require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const path = require("path");
const fs = require("fs");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 5000; // Λίγο περισσότερο delay για τοπικά μοντέλα

const ARCHITECTURES = ["3tier", "mvc", "microservices", "client-server"];
const PROMPT_TYPES = ["srs", "frnfr"];
const TEMPERATURES = ["0", "0.2", "0.5"];
const LOCAL_MODELS = ["qwen", "deepseek"];
const RUNS_PER_COMBO = 5;
const PROJECT = "dcc"; // άλλαξε σε "mycharts" αν χρειάζεται

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
  headersTimeout: 3600000,
  bodyTimeout: 3600000,
  connectTimeout: 3600000,
}));

// Δημιουργία όλων των συνδυασμών για qwen και deepseek
const MISSING_COMBINATIONS = [];

for (const model of LOCAL_MODELS) {
    for (const architecture of ARCHITECTURES) {
        for (const promptType of PROMPT_TYPES) {
            for (const temperature of TEMPERATURES) {
                MISSING_COMBINATIONS.push({
                    architecture,
                    model,
                    promptType,
                    temperature,
                    missing: RUNS_PER_COMBO,
                });
            }
        }
    }
}

console.log(`\n📋 Συνολικοί συνδυασμοί: ${MISSING_COMBINATIONS.length}`);
console.log(`📋 Συνολικά runs: ${MISSING_COMBINATIONS.reduce((s, c) => s + c.missing, 0)}`);

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function runOne(architecture, model, promptType, temperature, attempt, serialIndex, total) {
    console.log(
        `\n[${serialIndex}/${total}] ▶ [${architecture}] [${model}] [${promptType}] [temp=${temperature}] run ${attempt}`
    );

    try {
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3600000), // 60 λεπτά
            body: JSON.stringify({
                architecture,
                model,
                promptType,
                temperature: String(temperature),
                project: PROJECT,
            }),
        });

        const runData = await runRes.json();
        if (!runRes.ok) {
            throw new Error(runData?.error || "run-experiment failed");
        }

        console.log(`  ✓ run-experiment id=${runData.id}`);

        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST",
            signal: AbortSignal.timeout(120000), // 2 λεπτά
        });

        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) {
            throw new Error(analyzeData?.error || "analyze failed");
        }

        console.log(`  ✓ analyze done`);

        return {
            ok: true,
            id: runData.id,
            architecture,
            model,
            promptType,
            temperature,
            attempt,
        };
    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return {
            ok: false,
            architecture,
            model,
            promptType,
            temperature,
            attempt,
            error: err.message,
        };
    }
}

async function main() {
    const jobs = [];

    for (const combo of MISSING_COMBINATIONS) {
        for (let i = 1; i <= combo.missing; i++) {
            jobs.push({
                architecture: combo.architecture,
                model: combo.model,
                promptType: combo.promptType,
                temperature: combo.temperature,
                attempt: i,
            });
        }
    }

    const total = jobs.length;
    console.log(`\n🚀 Τρέχω ${total} experiments για qwen & deepseek\n`);

    const results = [];
    let success = 0;
    let failure = 0;

    for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const result = await runOne(
            j.architecture,
            j.model,
            j.promptType,
            j.temperature,
            j.attempt,
            i + 1,
            total
        );

        results.push(result);
        if (result.ok) success++;
        else failure++;

        // Μεγαλύτερο delay μετά από κάθε run για να ξεκουραστεί το μοντέλο
        if (i < jobs.length - 1) {
            console.log(`  ⏳ Αναμονή ${DELAY_MS / 1000}s...`);
            await sleep(DELAY_MS);
        }
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${total}`);
    console.log(`❌ Αποτυχίες: ${failure}/${total}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα runs:");
        results
            .filter((r) => !r.ok)
            .forEach((r) => {
                console.log(
                    `  - [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt}: ${r.error}`
                );
            });
    }

    const outPath = path.join(__dirname, `../logs/local_models_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
