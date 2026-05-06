require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const API = process.env.API_URL || "http://localhost:3001";
const DELAY_MS = 2000;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function analyzeOne(id, index, total) {
    console.log(`\n[${index}/${total}] ▶ analyze id=${id}`);

    try {
        const res = await fetch(`${API}/api/analyze/${id}`, {
            method: "POST",
            signal: AbortSignal.timeout(120000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); }
        catch { throw new Error(`Non-JSON response: ${text.slice(0, 200)}`); }

        if (!res.ok) throw new Error(data?.error || data?.details || "analyze failed");

        const hasUml     = !!data.plantuml;
        const hasMetrics = !!data.metrics;
        const hasGraph   = !!data.graphJson;
        const hasArch    = !!data.architectureAnalysis;

        console.log(`  ✓ uml=${hasUml} metrics=${hasMetrics} graph=${hasGraph} arch=${hasArch}`);

        if (!hasUml) console.warn(`  ⚠️  uml_produced still missing`);

        return { ok: true, id, hasUml, hasMetrics, hasGraph, hasArch };

    } catch (err) {
        console.error(`  ✗ FAILED: ${err.message}`);
        return { ok: false, id, error: err.message };
    }
}

async function main() {
    // Βρες όλα τα ids χωρίς uml_produced
    const r = await pool.query(`
        SELECT id, architecture, model, prompt_type, temperature
        FROM run_experiments
        WHERE (uml_produced IS NULL OR uml_produced = '')
          AND (cpp_code IS NOT NULL AND cpp_code != '')
        ORDER BY id
    `);

    const rows = r.rows;
    const total = rows.length;

    if (total === 0) {
        console.log("✅ Δεν υπάρχουν runs χωρίς uml_produced!");
        await pool.end();
        return;
    }

    console.log(`\n🔍 Βρέθηκαν ${total} runs χωρίς uml_produced`);
    console.log("─".repeat(55));

    const results = [];
    let success = 0, failure = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        console.log(`     [${row.model}] [${row.architecture}] [${row.prompt_type}] temp=${row.temperature}`);
        const result = await analyzeOne(row.id, i + 1, total);
        results.push(result);
        if (result.ok) success++; else failure++;

        if (i < rows.length - 1) await sleep(DELAY_MS);
    }

    console.log("\n═══════════════════════════════");
    console.log(`✅ Επιτυχία: ${success}/${total}`);
    console.log(`❌ Αποτυχίες: ${failure}/${total}`);

    const stillMissing = results.filter(r => r.ok && !r.hasUml);
    if (stillMissing.length > 0) {
        console.log(`\n⚠️  Εξακολουθούν να λείπει uml: ${stillMissing.map(r => r.id).join(", ")}`);
    }

    if (failure > 0) {
        console.log("\nΑποτυχημένα:");
        results.filter(r => !r.ok).forEach(r =>
            console.log(`  - id=${r.id}: ${r.error}`)
        );
    }

    const outPath = path.join(__dirname, `../logs/reanalyze_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Log: ${outPath}`);

    await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
