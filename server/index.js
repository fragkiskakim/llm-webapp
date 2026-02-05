require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { extractCppUmlFromJson } = require("./parse");



const OpenAI = require("openai");
const { pool, initDb } = require("./db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });




function wrapPromptForJson(prompt) {
    return [
        "You must respond with ONLY valid JSON.",
        'Schema: {"cpp": string, "uml": string}',
        "No markdown. No explanations. No extra keys.",
        "The value of cpp must be valid C++ source code as a string.",
        "The value of uml must be valid PlantUML as a string.",
        "",
        "User request:",
        prompt
    ].join("\n");
}



app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/generate", async (req, res) => {
    try {
        const prompt = (req.body?.prompt ?? "").trim();
        const exp_name = (req.body?.exp_name ?? null);
        const architecture = (req.body?.architecture ?? null);
        const description_type = (req.body?.description_type ?? null);

        if (!prompt) return res.status(400).json({ error: "Empty prompt" });
        if (prompt.length > 18000) return res.status(400).json({ error: "Prompt too long" });

        // 1) Store prompt
        const ins = await pool.query(
        `INSERT INTO prompts(prompt, exp_name, architecture, description_type)
        VALUES($1, $2, $3, $4)
        RETURNING id, created_at`,
        [prompt, exp_name, architecture, description_type]
        );

        const rowId = ins.rows[0].id;

        // 2) Call OpenAI (request JSON-only output)
        const model = process.env.OPENAI_MODEL || "gpt-5.2";
        const llmInput = wrapPromptForJson(prompt);

        const response = await client.responses.create({
            model,
            input: llmInput
        });

        const text = response.output_text ?? "";

        // 3) Parse and validate format
        const { cpp, uml, parsed } = extractCppUmlFromJson(text);

        // 4) Store raw response + parsed parts (even if parsing fails, store raw for debugging)
        await pool.query(
            "UPDATE prompts SET response=$1, cpp_code=$2, uml_code=$3 WHERE id=$4",
            [text, cpp, uml, rowId]
        );

        // 5) If not correct format, return 422 with details
        if (!parsed) {
            return res.status(422).json({
                error: 'Invalid LLM format. Expected ONLY JSON: {"cpp": "...", "uml": "..."}',
                id: rowId,
                model,
                output: text,
                parsed: { cpp_found: Boolean(cpp), uml_found: Boolean(uml) }
            });
        }

        return res.json({
            id: rowId,
            model,
            cpp,
            uml
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/latest", async (_req, res) => {
    const r = await pool.query(
        "SELECT id, created_at, prompt, cpp_code, uml_code FROM prompts ORDER BY id DESC LIMIT 1"
    );
    res.json(r.rows[0] ?? null);
});

app.get("/api/prompts", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        id,
        created_at,
        exp_name,
        architecture,
        description_type,
        prompt,
        CASE WHEN cpp_code IS NULL OR length(cpp_code)=0 THEN false ELSE true END AS has_cpp,
        CASE WHEN uml_code IS NULL OR length(uml_code)=0 THEN false ELSE true END AS has_uml
      FROM prompts
      ORDER BY id DESC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/api/prompts/:id/cpp", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).send("Invalid id");

        const r = await pool.query("SELECT cpp_code FROM prompts WHERE id=$1", [id]);
        const cpp = r.rows[0]?.cpp_code;
        if (!cpp) return res.status(404).send("CPP not found");

        res.setHeader("Content-Type", "text/x-c++src; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="generated_${id}.cpp"`);
        res.send(cpp);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


app.get("/api/prompts/:id/uml", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).send("Invalid id");

        const r = await pool.query("SELECT uml_code FROM prompts WHERE id=$1", [id]);
        const uml = r.rows[0]?.uml_code;
        if (!uml) return res.status(404).send("UML not found");

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="diagram_${id}.puml"`);
        res.send(uml);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


app.get("/api/prompt-template", async (req, res) => {
  try {
    const arch = String(req.query.arch || "").toLowerCase();     // "3tier" | "microservices" | "mvc"
    const spec = String(req.query.spec || "").toLowerCase();     // "srs" | "frnfr"

    const archKey =
      arch === "3tier" ? "3_3tier" :
      arch === "mvc" ? "3_mvc" :
      arch === "microservices" ? "3_micro" :
      null;

    const specKey =
      spec === "srs" ? "2_srs" :
      spec === "frnfr" ? "2_frnfr" :
      null;

    if (!archKey || !specKey) {
      return res.status(400).json({ error: "Invalid arch/spec. Use arch=3tier|mvc|microservices and spec=srs|frnfr." });
    }

    const keys = ["1_task_description", specKey, archKey, "4_finalInstructions"];

    const r = await pool.query(
      "SELECT name, prompt_part FROM prompt_experiment WHERE name = ANY($1)",
      [keys]
    );

    const map = new Map(r.rows.map(x => [x.name, x.prompt_part]));

    const missing = keys.filter(k => !map.has(k));
    if (missing.length) {
      return res.status(422).json({ error: "Missing prompt parts in prompt_experiment.", missing });
    }

    const fullPrompt = keys.map(k => map.get(k)).join("\n\n");

    return res.json({ arch, spec, prompt: fullPrompt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }


});

app.get("/api/prompt-experiment", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT name, prompt_part FROM prompt_experiment ORDER BY name"
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.put("/api/prompt-experiment/:name", async (req, res) => {
  try {
    const name = String(req.params.name || "").trim();
    const prompt_part = String(req.body?.prompt_part ?? "");

    if (!name) return res.status(400).json({ error: "Empty name" });

    const r = await pool.query(
      `INSERT INTO prompt_experiment(name, prompt_part)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET prompt_part = EXCLUDED.prompt_part
       RETURNING name, prompt_part`,
      [name, prompt_part]
    );

    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



(async () => {
    await initDb();
    const port = Number(process.env.PORT || 3001);
    app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
})();
