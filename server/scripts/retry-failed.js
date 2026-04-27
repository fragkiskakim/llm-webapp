require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const path = require("path");
const fs = require("fs");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 5000;
const PROJECT = "dcc";

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
  headersTimeout: 3600000,
  bodyTimeout: 3600000,
  connectTimeout: 3600000,
}));

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
    const logDir = path.join(__dirname, "../../server/logs");
    const files = fs.readdirSync(logDir).filter(f => f.startsWith("local_models_"));

    if (files.length === 0) {
        console.error("❌ Δεν βρέθηκε κανένα log αρχείο στο logs/");
        process.exit(1);
    }

    const latest = files.sort().at(-1);
    console.log(`📂 Διαβάζω: ${latest}`);
    const results = JSON.parse(fs.readFileSync(path.join(logDir, latest)));

    const failed = results.filter(r => !r.ok);

    if (failed.length === 0) {
        console.log("✅ Δεν υπάρχουν αποτυχημένα runs!");
        return;
    }

    console.log(`\n🔁 Επανάληψη ${failed.length} αποτυχημένων runs\n`);

    const newResults = [];
    let success = 0, failure = 0;

    for (let i = 0; i < failed.length; i++) {
        const j = failed[i];
        const result = await runOne(j.architecture, j.model, j.promptType, j.temperature, j.attempt, i + 1, failed.length);
        newResults.push(result);
        if (result.ok) success++; else failure++;

        if (i < failed.length - 1) {
            console.log(`  ⏳ Αναμονή ${DELAY_MS / 1000}s...`);
            await sleep(DELAY_MS);
        }
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${failed.length}`);
    console.log(`❌ Αποτυχίες: ${failure}/${failed.length}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα runs:");
        newResults
            .filter(r => !r.ok)
            .forEach(r => {
                console.log(`  - [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt}: ${r.error}`);
            });
    }

    const outPath = path.join(__dirname, `../../logs/retry_${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(newResults, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
