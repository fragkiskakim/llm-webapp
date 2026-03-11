// server/routes/analyze.js  (Windows-friendly)
const express = require("express");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");



//helper function to strip function bodies from C++ code, leaving only declarations (for better namespace analysis)
function stripFunctionBodies(code) {

    // remove constructor initializer lists
    code = code.replace(/\)\s*:\s*[^{]+{/g, "){");

    // remove inline function bodies
    code = code.replace(/\)\s*\{[^{}]*\}/g, ");");

    return code;
}






function runAnalyzer(cppPath) {
    return new Promise((resolve, reject) => {
        const PYTHON_BIN = process.env.PYTHON_BIN || "py";
        const PYTHON_ARGS = (process.env.PYTHON_ARGS || "-3")
            .split(/\s+/)
            .filter(Boolean);

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

// NEW: run hpp2plantuml and return the generated .puml content (as text)
function runHpp2Plantuml(headerPath, pumlOutPath) {
    return new Promise((resolve, reject) => {
        const PYTHON_BIN = process.env.PYTHON_BIN || "py";
        const PYTHON_ARGS = (process.env.PYTHON_ARGS || "-3")
            .split(/\s+/)
            .filter(Boolean);

        const SCRIPT = process.env.HPP2PLANTUML_SCRIPT;

        if (!SCRIPT) {
            return reject(new Error("HPP2PLANTUML_SCRIPT not defined in .env"));
        }

        const args = [
            ...PYTHON_ARGS,
            SCRIPT,
            "-i", headerPath,
            "-o", pumlOutPath,
            "-d" // enable dependency extraction (optional but useful for metrics)
        ];

        const p = spawn(PYTHON_BIN, args, { windowsHide: true });

        let err = "";
        p.stderr.on("data", d => (err += d.toString()));
        p.on("error", reject);

        p.on("close", async (code) => {
            if (code !== 0)
                return reject(new Error(err || `hpp2plantuml failed (${code})`));

            try {
                const puml = await fs.readFile(pumlOutPath, "utf8");
                resolve(puml);
            } catch (e) {
                reject(new Error(`Failed to read .puml: ${e.message}`));
            }
        });
    });
}

module.exports = function createAnalyzeRouter({ pool }) {
    const router = express.Router();

    // POST /api/analyze/:id
    router.post("/analyze/:id", async (req, res) => {
        let dir = null;
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

            const r = await pool.query("SELECT cpp_code FROM run_experiments WHERE id=$1", [id]);
            const cpp = r.rows[0]?.cpp_code;
            if (!cpp) return res.status(404).json({ error: "CPP not found" });

            dir = await fs.mkdtemp(path.join(os.tmpdir(), "cppns-"));

            // 1) Keep your analyzer input (.cpp)
            const cppPath = path.join(dir, `generated_${id}.cpp`);
            await fs.writeFile(cppPath, cpp, "utf8");

            // 2) Create a header file for hpp2plantuml (better results than feeding .cpp)
            //    If your LLM output is a full .cpp, this may still work, but headers are safer.
            const hppPath = path.join(dir, `generated_${id}.hpp`);
            const headerOnly = stripFunctionBodies(cpp);

            await fs.writeFile(hppPath, headerOnly, "utf8");

            console.log("\n===== HEADER SENT TO HPP2PLANTUML =====");
            console.log(headerOnly);
            console.log("===== END HEADER =====\n");
            // If you want: extract only class/struct declarations into .hpp later.

            // 3) Run both steps
            const [metrics, plantuml] = await Promise.all([
                runAnalyzer(cppPath),
                runHpp2Plantuml(hppPath, path.join(dir, `diagram_${id}.puml`)),
            ]);

            // 4) Store results
            await pool.query(
                "UPDATE run_experiments SET cpp_metrics=$1, uml_produced=$2 WHERE id=$3",
                [metrics, plantuml, id]
            );

            return res.json({ id, metrics, plantuml });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error", details: String(err.message || err) });
        } finally {
            if (dir) {
                await fs.rm(dir, { recursive: true, force: true }).catch(() => { });
            }
        }
    });

    return router;
};