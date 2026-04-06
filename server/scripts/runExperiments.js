// server/scripts/runAllExperiments.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const ARCHITECTURES = ["mvc", "3tier", "microservices", "client-server"];
const MODELS = ["gpt4", "claude", "grok"];
const PROMPT_TYPES = ["frnfr", "srs"];
const REPEATS = 5;

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 3000; // αναμονή μεταξύ calls για να μην υπερφορτωθούν τα APIs

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runOne(architecture, model, promptType, attempt) {
    console.log(`\n▶ [${architecture}] [${model}] [${promptType}] attempt ${attempt}...`);

    try {
        // 1. run-experiment
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ architecture, model, promptType })
        });
        const runData = await runRes.json();
        if (!runRes.ok) throw new Error(runData?.error || "run-experiment failed");
        console.log(`  ✓ run-experiment id=${runData.id}`);

        // 2. analyze
        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST"
        });
        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) throw new Error(analyzeData?.error || "analyze failed");
        console.log(`  ✓ analyze done`);

        return { ok: true, id: runData.id, architecture, model, promptType, attempt };

    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return { ok: false, architecture, model, promptType, attempt, error: err.message };
    }
}

async function main() {
    const combinations = [];

    for (const architecture of ARCHITECTURES) {
        for (const model of MODELS) {
            for (const promptType of PROMPT_TYPES) {
                for (let attempt = 1; attempt <= REPEATS; attempt++) {
                    combinations.push({ architecture, model, promptType, attempt });
                }
            }
        }
    }

    console.log(`\n🚀 Τρέχω ${combinations.length} experiments συνολικά...`);
    console.log(`   (${ARCHITECTURES.length} architectures × ${MODELS.length} models × ${PROMPT_TYPES.length} prompt types × ${REPEATS} repeats)\n`);

    const results = [];
    let success = 0;
    let failure = 0;

    for (const { architecture, model, promptType, attempt } of combinations) {
        const result = await runOne(architecture, model, promptType, attempt);
        results.push(result);

        if (result.ok) success++;
        else failure++;

        // αναμονή μεταξύ calls
        await sleep(DELAY_MS);
    }

    // summary
    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${combinations.length}`);
    console.log(`❌ Αποτυχίες: ${failure}/${combinations.length}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα experiments:");
        results
            .filter(r => !r.ok)
            .forEach(r => console.log(`  - [${r.architecture}] [${r.model}] [${r.promptType}] attempt ${r.attempt}: ${r.error}`));
    }

    // αποθήκευση αποτελεσμάτων σε JSON
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