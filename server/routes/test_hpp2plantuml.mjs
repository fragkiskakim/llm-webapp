import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy-paste η function εδώ
function runHpp2Plantuml(headerPath, pumlOutPath) {
    return new Promise((resolve, reject) => {
        const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
        const PYTHON_ARGS = (process.env.PYTHON_ARGS || "")
            .split(/\s+/)
            .filter(Boolean);

        const scriptPath = path.join(__dirname, "hpp2plantuml.py");

        const args = [
            ...PYTHON_ARGS,
            scriptPath,
            "-i", headerPath,
            "-o", pumlOutPath,
            "-d"
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

const headerPath = path.resolve("routes/test_input.hpp");
const pumlOutPath = path.resolve("routes/test_output.puml");

runHpp2Plantuml(headerPath, pumlOutPath)
    .then(puml => {
        console.log("✅ Success!");
        console.log(puml);
    })
    .catch(e => console.error("❌ Error:", e.message));