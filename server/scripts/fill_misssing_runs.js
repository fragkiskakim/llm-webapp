require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const path = require("path");
const fs = require("fs");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 3000;

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
    headersTimeout: 7200000,
    bodyTimeout:    7200000,
    connectTimeout: 7200000,
}));

const MISSING_COMBINATIONS = [    
    { project: "mycharts", architecture: "3tier",         model: "gemini",   promptType: "srs",   temperature: "0.5", missing: 1 },
    { project: "mycharts", architecture: "microservices", model: "gemini",   promptType: "frnfr", temperature: "0",   missing: 1 },
];

const totalRuns = MISSING_COMBINATIONS.reduce((s, c) => s + c.missing, 0);
console.log(`\n📋 Συνδυασμοί προς συμπλήρωση: ${MISSING_COMBINATIONS.length}`);
console.log(`📋 Συνολικά runs: ${totalRuns}`);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runOne(project, architecture, model, promptType, temperature, attempt, serialIndex, total) {
    console.log(`\n[${serialIndex}/${total}] ▶ [${project}] [${architecture}] [${model}] [${promptType}] [temp=${temperature}] run ${attempt}`);

    try {
        // run-experiment — deepseek/qwen χρειάζονται πολύ ώρα
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(7200000), // 2 ώρες
            body: JSON.stringify({ architecture, model, promptType, temperature: String(temperature), project }),
        });

        
        const runData = await runRes.json();
        if (!runRes.ok) throw new Error(runData?.error || "run-experiment failed");
        console.log(`  ✓ run-experiment id=${runData.id}`);

        // analyze — Python scripts, αρκούν 5 λεπτά
        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST",
            signal: AbortSignal.timeout(300000), // 5 λεπτά
        });

        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) throw new Error(analyzeData?.error || "analyze failed");
        console.log(`  ✓ analyze done`);

        return { ok: true, id: runData.id, project, architecture, model, promptType, temperature, attempt };
    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`, err.cause || "");
        return { ok: false, project, architecture, model, promptType, temperature, attempt, error: err.message };
    }
}

async function main() {
    const jobs = [];
    for (const combo of MISSING_COMBINATIONS) {
        for (let i = 1; i <= combo.missing; i++) {
            jobs.push({ ...combo, attempt: i });
        }
    }

    const total = jobs.length;
    console.log(`\n🚀 Τρέχω ${total} missing runs\n`);

    const results = [];
    let success = 0, failure = 0;

    for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const result = await runOne(j.project, j.architecture, j.model, j.promptType, j.temperature, j.attempt, i + 1, total);
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
            console.log(`  - [${r.project}] [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt}: ${r.error}`)
        );
    }

    const outPath = path.join(__dirname, `../logs/fill_missing_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });
