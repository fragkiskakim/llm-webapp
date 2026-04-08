// server/scripts/runAllExperiments.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const ARCHITECTURES = ["mvc", "3tier", "microservices", "client-server"];
const MODELS = ["gpt4", "claude", "grok", "gemini", "mistral"];
const PROMPT_TYPES = ["frnfr", "srs"];
const TEMPERATURES = [0.0, 0.2, 0.5];
const REPEATS = 5;

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 3000;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runOne(architecture, model, promptType, temperature, attempt) {
    console.log(`\n▶ [${architecture}] [${model}] [${promptType}] [temp=${temperature}] attempt ${attempt}...`);

    try {
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ architecture, model, promptType, temperature: String(temperature) })
        });
        const runData = await runRes.json();
        if (!runRes.ok) throw new Error(runData?.error || "run-experiment failed");
        console.log(`  ✓ run-experiment id=${runData.id}`);

        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST"
        });
        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) throw new Error(analyzeData?.error || "analyze failed");
        console.log(`  ✓ analyze done`);

        return { ok: true, id: runData.id, architecture, model, promptType, temperature, attempt };

    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return { ok: false, architecture, model, promptType, temperature, attempt, error: err.message };
    }
}

async function main() {
    const combinations = [];

    for (const architecture of ARCHITECTURES) {
        for (const model of MODELS) {
            for (const promptType of PROMPT_TYPES) {
                for (const temperature of TEMPERATURES) {
                    for (let attempt = 1; attempt <= REPEATS; attempt++) {
                        combinations.push({ architecture, model, promptType, temperature, attempt });
                    }
                }
            }
        }
    }

    const total = combinations.length;
    const breakdown = `${ARCHITECTURES.length} arch × ${MODELS.length} models × ${PROMPT_TYPES.length} prompt types × ${TEMPERATURES.length} temperatures × ${REPEATS} repeats`;

    console.log(`\n🚀 Τρέχω ${total} experiments συνολικά...`);
    console.log(`   (${breakdown})`);
    console.log(`   Εκτιμώμενος χρόνος: ~${Math.round(total * DELAY_MS / 60000)} λεπτά\n`);

    const results = [];
    let success = 0;
    let failure = 0;

    for (const [i, { architecture, model, promptType, temperature, attempt }] of combinations.entries()) {
        console.log(`[${i + 1}/${total}]`);
        const result = await runOne(architecture, model, promptType, temperature, attempt);
        results.push(result);

        if (result.ok) success++;
        else failure++;

        await sleep(DELAY_MS);
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${total}`);
    console.log(`❌ Αποτυχίες: ${failure}/${total}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα experiments:");
        results
            .filter(r => !r.ok)
            .forEach(r => console.log(`  - [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] attempt ${r.attempt}: ${r.error}`));
    }

    const fs = require("fs");
    const outPath = require("path").join(__dirname, `../logs/batch_${Date.now()}.json`);
    fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});