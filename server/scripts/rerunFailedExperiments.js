// server/scripts/rerunFailedExperiments.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 3000;

// Βάλε εδώ το log file που παρήχθη από το προηγούμενο batch
const INPUT_LOG = path.join(
    __dirname,
    "../logs/mycharts_batch_1776362926738.json"
);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runOne(project, architecture, model, promptType, temperature, attempt) {
    console.log(
        `\n▶ RETRY [${project}] [${architecture}] [${model}] [${promptType}] [temp=${temperature}] attempt ${attempt}...`
    );

    try {
        const runRes = await fetch(`${API}/api/run-experiment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                architecture,
                model,
                promptType,
                temperature: String(temperature),
                project
            })
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

        return {
            ok: true,
            retried: true,
            oldAttempt: attempt,
            id: runData.id,
            project,
            architecture,
            model,
            promptType,
            temperature
        };

    } catch (err) {
        console.error(`  ✗ FAILED AGAIN: ${err.message}`);
        return {
            ok: false,
            retried: true,
            oldAttempt: attempt,
            project,
            architecture,
            model,
            promptType,
            temperature,
            error: err.message
        };
    }
}

async function main() {
    if (!fs.existsSync(INPUT_LOG)) {
        throw new Error(`Log file not found: ${INPUT_LOG}`);
    }

    const raw = fs.readFileSync(INPUT_LOG, "utf8");
    const previousResults = JSON.parse(raw);

    const failed = previousResults.filter(r => !r.ok);

    if (failed.length === 0) {
        console.log("Δεν βρέθηκαν αποτυχημένα experiments.");
        return;
    }

    console.log(`\n🔁 Βρέθηκαν ${failed.length} αποτυχημένα experiments για rerun.\n`);

    const retryResults = [];
    let success = 0;
    let failure = 0;

    for (const [i, item] of failed.entries()) {
        console.log(`[${i + 1}/${failed.length}]`);

        const result = await runOne(
            item.project || "mycharts",
            item.architecture,
            item.model,
            item.promptType,
            item.temperature,
            item.attempt
        );

        retryResults.push(result);

        if (result.ok) success++;
        else failure++;

        await sleep(DELAY_MS);
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Retry success: ${success}/${failed.length}`);
    console.log(`❌ Retry failed: ${failure}/${failed.length}`);

    if (failure > 0) {
        console.log("\nΑυτά απέτυχαν ξανά:");
        retryResults
            .filter(r => !r.ok)
            .forEach(r =>
                console.log(
                    `  - [${r.project}] [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] old attempt ${r.oldAttempt}: ${r.error}`
                )
            );
    }

    const outPath = path.join(
        __dirname,
        `../logs/retry_failed_${Date.now()}.json`
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(retryResults, null, 2));

    console.log(`\n📄 Retry results saved to: ${outPath}`);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});