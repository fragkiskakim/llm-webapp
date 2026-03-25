require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { extractCppUmlFromJson, extractCppFromJson } = require("./parse");


const grokKey = process.env.GROK_API_KEY;
const OpenAI = require("openai");

const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});



const { pool, initDb } = require("./db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const createAnalyzeRouter = require("./routes/analyze");
app.use("/api", createAnalyzeRouter({ pool }));


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });




function wrapPromptForJson(prompt) {
  return [
    "You must respond with ONLY valid JSON.",
    'Schema: {"cpp": string}',
    "No markdown. No explanations. No extra keys.",
    "The value of cpp must be valid C++ header source code as a string.",
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
        CASE WHEN uml_code IS NULL OR length(uml_code)=0 THEN false ELSE true END AS has_uml,
        CASE WHEN uml_code_produced IS NULL OR length(uml_code_produced)=0 THEN false ELSE true END AS has_uml_produced,
        CASE
          WHEN cpp_metrics IS NULL THEN false
          WHEN cpp_metrics = '{}'::jsonb THEN false
          WHEN cpp_metrics = '[]'::jsonb THEN false
          ELSE true
        END AS has_cpp_metrics,
        cpp_metrics
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
    res.setHeader("Content-Disposition", `attachment; filename="generated_${id}.hpp"`);
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


app.get("/api/prompts/:id/uml_produced", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Invalid id");

    const r = await pool.query("SELECT uml_code_produced FROM prompts WHERE id=$1", [id]);
    const uml = r.rows[0]?.uml_code_produced;
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



// RUN EXPERIMENT API that runs each time we run a new experiment from the run page
app.post("/api/run-experiment", async (req, res) => {
  try {

    const architecture = req.body?.architecture;
    const promptType = req.body?.promptType;
    const model = req.body?.model;


    if (!architecture || !promptType) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const archKey =
      architecture === "3tier" ? "3_3tier" :
        architecture === "mvc" ? "3_mvc" :
          architecture === "microservices" ? "3_micro" :
            architecture === "client-server" ? "3_client-server" :
              null;

    const specKey =
      promptType === "srs" ? "2_srs" :
        promptType === "frnfr" ? "2_frnfr" :
          null;

    if (!archKey || !specKey) {
      return res.status(400).json({ error: "Invalid architecture or spec" });
    }

    const keys = [
      "1_task_description",
      specKey,
      archKey,
      "4_finalInstructions"
    ];

    const r = await pool.query(
      "SELECT name, prompt_part FROM prompt_experiment WHERE name = ANY($1)",
      [keys]
    );

    const map = new Map(r.rows.map(x => [x.name, x.prompt_part]));

    const prompt = keys.map(k => map.get(k)).join("\n\n");

    // ------------------------
    // INSERT RUN
    // ------------------------
    const category = `DCC_${architecture}_${model}_${promptType}`;

    const ins = await pool.query(
      `INSERT INTO run_experiments
      (architecture, model, prompt_type, prompt, category)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id`,
      [architecture, model, promptType, prompt, category]
    );

    const runId = ins.rows[0].id;

    // ------------------------
    // CALL LLM
    // ------------------------


    const llmInput = wrapPromptForJson(prompt);

    let text = "";
    let response;

    if (model === "gpt4") {

      const request_model = process.env.OPENAI_MODEL || "gpt-4o";

      response = await client.responses.create({
        model: request_model,
        input: llmInput
      });

      text = response.output_text ?? "";

    }
    else if (model === "claude") {

      const msg = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: llmInput
          }
        ]
      });

      text = msg.content[0].text;

    }
    else if (model === "grok") {

      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROK_API_KEY}`
        },
        body: JSON.stringify({
          model: "grok-4",
          messages: [
            { role: "user", content: llmInput }
          ]
        })
      });

      const data = await r.json();

      text = data.choices?.[0]?.message?.content ?? "";

    }

    const { cpp } = extractCppFromJson(text);

    // ------------------------
    // UPDATE WITH RESULT
    // ------------------------

    await pool.query(
      `UPDATE run_experiments
       SET response=$1, cpp_code=$2
       WHERE id=$3`,
      [text, cpp, runId]
    );

    //TODO: change the analysis to something that makes sense
    analysis = {
      min: 0.32,
      max: 0.87,
      total: 0.67,
      problem: "You have too many connections"
    }


    return res.json({
      id: runId,
      prompt,
      cpp,
      analysis
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// API to get all distinct categories for filtering on the frontend
app.get("/api/categories", async (req, res) => {
  try {

    const r = await pool.query(
      `SELECT DISTINCT category
       FROM run_experiments
       ORDER BY category`
    );

    res.json(r.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/api/results", async (req, res) => {

  const { category, architecture, model, promptType } = req.query;

  let query = `
    SELECT id,
           category,
           architecture,
           model,
           prompt_type
    FROM run_experiments
    WHERE 1=1
  `;

  const params = [];
  let i = 1;

  if (category) {
    query += ` AND category = $${i++}`;
    params.push(category);
  }

  if (architecture) {
    query += ` AND architecture = $${i++}`;
    params.push(architecture);
  }

  if (model) {
    query += ` AND model = $${i++}`;
    params.push(model);
  }

  if (promptType) {
    query += ` AND prompt_type = $${i++}`;
    params.push(promptType);
  }

  query += `
    GROUP BY category, architecture, model, prompt_type, id
    ORDER BY category
  `;

  const r = await pool.query(query, params);

  res.json(r.rows);
});


(async () => {
  await initDb();
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
})();
