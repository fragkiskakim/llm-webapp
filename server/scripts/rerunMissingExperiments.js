require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const path = require("path");
const fs = require("fs");

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 3000;

// Βάλε εδώ μόνο τα combos που έχουν κενό response και πόσα λείπουν
const MISSING_COMBINATIONS = [
    //{ architecture: "client-server", model: "claude", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "client-server", model: "gpt4", promptType: "srs", temperature: "0.2", missing: 5 },
    //{ architecture: "client-server", model: "grok", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "gpt4", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "srs", temperature: "0", missing: 2 },
    { architecture: "client-server", model: "gpt4", promptType: "frnfr", temperature: "0.5", missing: 5 },
    //{ architecture: "microservices", model: "grok", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "client-server", model: "grok", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "client-server", model: "claude", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "grok", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "grok", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "3tier", model: "grok", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "grok", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "client-server", model: "grok", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "client-server", model: "grok", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "client-server", model: "grok", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "3tier", model: "grok", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "gpt4", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "client-server", model: "claude", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "client-server", model: "gpt4", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "microservices", model: "grok", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "frnfr", temperature: "0.2", missing: 5 },
    { architecture: "client-server", model: "claude", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "claude", promptType: "srs", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "grok", promptType: "srs", temperature: "0.2", missing: 5 },
    { architecture: "3tier", model: "grok", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "grok", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "microservices", model: "grok", promptType: "frnfr", temperature: "0", missing: 5 },
    { architecture: "microservices", model: "claude", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "claude", promptType: "frnfr", temperature: "0.5", missing: 5 },
    { architecture: "client-server", model: "gpt4", promptType: "srs", temperature: "0.5", missing: 5 },
    { architecture: "3tier", model: "grok", promptType: "frnfr", temperature: "0.2", missing: 4 },
    { architecture: "microservices", model: "gemini", promptType: "srs", temperature: "0", missing: 2 },
    { architecture: "3tier", model: "gemini", promptType: "srs", temperature: "0.5", missing: 2 },
    { architecture: "3tier", model: "gpt4", promptType: "frnfr", temperature: "0.0", missing: 1 },
    { architecture: "mvc", model: "gemini", promptType: "frnfr", temperature: "0.0", missing: 1 },
    { architecture: "mvc", model: "mistral", promptType: "frnfr", temperature: "0.5", missing: 1 },
    { architecture: "mvc", model: "gemini", promptType: "srs", temperature: "0.5", missing: 1 },
    { architecture: "3tier", model: "gemini", promptType: "frnfr", temperature: "0", missing: 1 },
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function runOne(architecture, model, promptType, temperature, attempt, serialIndex, total) {
    console.log(
        `\n[${serialIndex}/${total}] ▶ [${architecture}] [${model}] [${promptType}] [temp=${temperature}] rerun ${attempt}`
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
            }),
        });

        const runData = await runRes.json();
        if (!runRes.ok) {
            throw new Error(runData?.error || "run-experiment failed");
        }

        console.log(`  ✓ run-experiment id=${runData.id}`);

        const analyzeRes = await fetch(`${API}/api/analyze/${runData.id}`, {
            method: "POST",
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
            rerunAttempt: attempt,
        };
    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return {
            ok: false,
            architecture,
            model,
            promptType,
            temperature,
            rerunAttempt: attempt,
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
    console.log(`\n🚀 Τρέχω ${total} missing experiments μόνο\n`);

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

        await sleep(DELAY_MS);
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${total}`);
    console.log(`❌ Αποτυχίες: ${failure}/${total}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα reruns:");
        results
            .filter((r) => !r.ok)
            .forEach((r) => {
                console.log(
                    `  - [${r.architecture}] [${r.model}] [${r.promptType}] [temp=${r.temperature}] rerun ${r.rerunAttempt}: ${r.error}`
                );
            });
    }

    const outPath = path.join(__dirname, `../logs/rerun_missing_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Αποτελέσματα αποθηκεύτηκαν: ${outPath}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});