// server/routes/analyze.js  (Windows-friendly)
const express = require("express");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

function runAnalyzer(cppPath) {
    return new Promise((resolve, reject) => {
        // Windows default: use Python Launcher (py). Override via .env if you want.
        const PYTHON_BIN = process.env.PYTHON_BIN || "py";
        const PYTHON_ARGS = (process.env.PYTHON_ARGS || "-3")
            .split(/\s+/)
            .filter(Boolean);

        // Absolute path to analyzer script (so CWD doesn't matter)
        const scriptPath = path.join(__dirname, "..", "routes", "analyze_cpp_namespaces.py");

        const args = [
            ...PYTHON_ARGS,
            scriptPath,
            cppPath,
            "--ignore-std",
            "--flag=-std=c++17",
        ];


        const p = spawn(PYTHON_BIN, args, { windowsHide: true });

        let out = "", err = "";
        p.stdout.on("data", d => (out += d.toString()));
        p.stderr.on("data", d => (err += d.toString()));

        // IMPORTANT: prevents server crash on spawn failures
        p.on("error", (e) => reject(e));

        p.on("close", code => {
            if (code !== 0) return reject(new Error(err || `analyzer failed (${code})`));
            try {
                resolve(JSON.parse(out));
            } catch (e) {
                reject(new Error(`Invalid JSON: ${e.message}\n${out}`));
            }
        });
    });
}

module.exports = function createAnalyzeRouter({ pool }) {
    const router = express.Router();

    // POST /api/analyze/:id
    router.post("/analyze/:id", async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

            const r = await pool.query("SELECT cpp_code FROM prompts WHERE id=$1", [id]);
            const cpp = r.rows[0]?.cpp_code;
            if (!cpp) return res.status(404).json({ error: "CPP not found" });

            const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cppns-"));
            const cppPath = path.join(dir, `generated_${id}.cpp`);
            await fs.writeFile(cppPath, cpp, "utf8");

            const metrics = await runAnalyzer(cppPath);

            await pool.query("UPDATE prompts SET cpp_metrics=$1 WHERE id=$2", [metrics, id]);

            await fs.rm(dir, { recursive: true, force: true });
            return res.json({ id, metrics });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error", details: String(err.message || err) });
        }
    });

    return router;
};
