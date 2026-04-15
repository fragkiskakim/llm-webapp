require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 1000;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getAllIds() {
    const res = await pool.query(
        `SELECT id FROM run_experiments ORDER BY id`
    );
    return res.rows.map(r => r.id);
}

async function recomputeOne(id, index, total) {
    console.log(`\n[${index}/${total}] ▶ recompute id=${id}`);

    try {
        const res = await fetch(`${API}/api/recompute-metrics/${id}`, {
            method: "POST"
        });

        const text = await res.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(`Expected JSON but got: ${text.slice(0, 200)}`);
        }

        if (!res.ok) {
            throw new Error(data?.error || "recompute failed");
        }

        console.log(`  ✓ recomputed`);
        return { ok: true, id };

    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return { ok: false, id, error: err.message };
    }
}

async function main() {
    const ids = await getAllIds();

    const total = ids.length;
    console.log(`\n🚀 Recomputing metrics for ${total} runs\n`);

    const results = [];
    let success = 0;
    let failure = 0;

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];

        const result = await recomputeOne(id, i + 1, total);
        results.push(result);

        if (result.ok) success++;
        else failure++;

        await sleep(DELAY_MS);
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${total}`);
    console.log(`❌ Αποτυχίες: ${failure}/${total}`);

    if (failure > 0) {
        console.log("\nΑποτυχημένα:");
        results
            .filter(r => !r.ok)
            .forEach(r => console.log(`  - id=${r.id}: ${r.error}`));
    }

    const outPath = path.join(__dirname, `../logs/recompute_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log(`\n📄 Saved log: ${outPath}`);
    await pool.end();
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});