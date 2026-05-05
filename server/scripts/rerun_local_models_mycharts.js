require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const path = require("path");
const fs = require("fs");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 5000;
const PROJECT = "mycharts";

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
  headersTimeout: 3600000,
  bodyTimeout: 3600000,
  connectTimeout: 3600000,
}));

// Όλα τα missing combos για MYCHARTS
const MISSING_COMBINATIONS = [
    // qwen - 3tier
    { architecture: "3tier", model: "qwen", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "3tier", model: "qwen", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "qwen", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "3tier", model: "qwen", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "3tier", model: "qwen", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "qwen", promptType: "srs", temperature: "0.5", missing: 5 },
    // deepseek - 3tier
    { architecture: "3tier", model: "deepseek", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "3tier", model: "deepseek", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "deepseek", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "3tier", model: "deepseek", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "3tier", model: "deepseek", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "deepseek", promptType: "srs", temperature: "0.5", missing: 5 },
    // qwen - microservices
    { architecture: "microservices", model: "qwen", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "qwen", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "qwen", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "microservices", model: "qwen", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "qwen", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "qwen", promptType: "srs", temperature: "0.5", missing: 5 },
    // deepseek - microservices
    { architecture: "microservices", model: "deepseek", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "deepseek", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "deepseek", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "microservices", model: "deepseek", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "deepseek", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "deepseek", promptType: "srs", temperature: "0.5", missing: 5 },
    // gemini - 1 missing combo
    { architecture: "3tier", model: "gemini", promptType: "frnfr", temperature: "0.5", missing: 5 },
];

console.log(`\n📋 Συνολικοί συνδυασμοί: ${MISSING_COMBINATIONS.length}`);
console.log(`📋 Συνολικά runs: ${MISSING_COMBINATIONS.reduce((s, c) => s + c.missing, 0)}`);

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function runOne(architecture, model, promptType, temperature, attempt, serialIndex, total) {
    console.log(`\n[${serialIndex}/${total}] ▶ [${architecture}] [${model}] [${promptType}] [temp=${temperature}] run ${attempt}`);

    try {
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3600000),
            body: JSON.stringify({ architecture, model, promptType, temperature: String(temperature), project: PROJECT }),
        });

        const runData = await runRes.json();
        if (!runRes.ok) throw new Error(runData?.error || "run-experiment failed");
        console.log(`  ✓ run-experiment id=${runData.id}`);

        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST",
            signal: AbortSignal.timeout(120000),
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
    const jobs = [];
    for (const combo of MISSING_COMBINATIONS) {
        for (let i = 1; i <= combo.missing; i++) {
            jobs.push({ architecture: combo.architecture, model: combo.model, promptType: combo.promptType, temperature: combo.temperature, attempt: i });
        }
    }

    const total = jobs.length;
    console.log(`\n🚀 Τρέχω ${total} missing experiments για project=${PROJECT}\n`);

    const results = [];
    let success = 0, failure = 0;

    for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const result = await runOne(j.architecture, j.model, j.promptType, j.temperature, j.attempt, i + 1, total);
        results.push(result);
        if (result.ok) success++; else failure++;

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
        results.filter(r => !r.ok).forEach(r =>
            console.log(`  - [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt}: ${r.error}`)
        );
    }

    const outPath = path.join(__dirname, `../logs/mycharts_missing_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });
