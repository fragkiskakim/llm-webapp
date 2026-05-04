require("dotenv").config();



// ── 1. undici global dispatcher (extended timeouts for local LLMs) ────────────
const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
  headersTimeout: 1800000,  // 30 λεπτά
  bodyTimeout: 1800000
}));


// ── 2. Dependencies ───────────────────────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const grokKey = process.env.GROK_API_KEY;
const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");



const { extractCppFromJson } = require("./parse");
const { pool, initDb } = require("./db");



// ── 3. SDK clients ────────────────────────────────────────────────────────────
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// ── 4. Express setup ──────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));


// ── 5. Routers ────────────────────────────────────────────────────────────────
app.use("/api", require("./routes/analyze")({ pool }));
app.use("/api", require("./routes/neo4jTest"));
app.use("/api", require("./routes/graphNeo4j"));
app.use("/api", require("./routes/export_csv"));
app.use("/api", require("./routes/export_csv_aggregated"));
app.use("/api", require("./routes/chart_summary"));
app.use("/api", require("./routes/chart_cohesion_by_model"));
app.use("/api", require("./routes/AdvancedAnalysis"));


// ── 6. Health ─────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));


// ── 7. Prompt experiment — GET all parts ─────────────────────────────────────
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

// ── 8. Prompt experiment — UPSERT a part ─────────────────────────────────────
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



// ── 9. Run experiment — core endpoint ────────────────────────────────────────
app.post("/api/run-experiment", async (req, res) => {
  try {
    const architecture = req.body?.architecture;
    const promptType = req.body?.promptType;
    const model = req.body?.model;
    const temperature = req.body?.temperature;
    const project = req.body?.project;

    if (!architecture || !promptType || temperature == null || !model || !project) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    if (!["dcc", "mycharts"].includes(project)) {
      return res.status(400).json({ error: "Invalid project" });
    }

    const archKey =
      architecture === "3tier" ? "3_3tier" :
        architecture === "mvc" ? "3_mvc" :
          architecture === "microservices" ? "3_micro" :
            architecture === "client-server" ? "3_client-server" :
              null;

    const finalInstructionsKey =
      architecture === "3tier" ? "4_finalInstructions_3tier" :
        architecture === "mvc" ? "4_finalInstructions_mvc" :
          architecture === "microservices" ? "4_finalInstructions_micro" :
            architecture === "client-server" ? "4_finalInstructions_client-server" :
              null;

    const specKey =
      promptType === "srs"
        ? (project === "dcc" ? "2_srs_dcc" : "2_srs_mycharts")
        : promptType === "frnfr"
          ? (project === "dcc" ? "2_frnfr_dcc" : "2_frnfr_mycharts")
          : null;

    if (!archKey || !specKey || !finalInstructionsKey) {
      return res.status(400).json({ error: "Invalid architecture or spec" });
    }

    const keys = [
      "1_task_description",
      specKey,
      archKey,
      finalInstructionsKey
    ];

    const r = await pool.query(
      "SELECT name, prompt_part FROM prompt_experiment WHERE name = ANY($1)",
      [keys]
    );

    const map = new Map(r.rows.map(x => [x.name, x.prompt_part]));
    const prompt = keys.map(k => map.get(k)).join("\n\n");

    const category = `${project.toUpperCase()}_${architecture}_${model}_${promptType}_temp${temperature}`;

    const ins = await pool.query(
      `INSERT INTO run_experiments
       (architecture, model, prompt_type, temperature, prompt, category)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [architecture, model, promptType, temperature, prompt, category]
    );

    const runId = ins.rows[0].id;

    const llmInput = prompt;

    let text = "";
    let response;

    if (model === "gpt4") {
      const request_model = process.env.OPENAI_MODEL || "gpt-4o";

      response = await client.responses.create({
        model: request_model,
        input: llmInput,
        temperature: Number(temperature) ?? 0.0
      });

      text = response.output_text ?? "";
    }
    else if (model === "claude") {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4000,
        temperature: Number(temperature) ?? 0.0,
        messages: [
          {
            role: "user",
            content: llmInput
          }
        ]
      });

      text = msg.content?.[0]?.text ?? "";
    }
    else if (model === "grok") {
      const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROK_API_KEY}`
        },
        body: JSON.stringify({
          model: "grok-4",
          temperature: Number(temperature) ?? 0.0,
          messages: [
            { role: "user", content: llmInput }
          ]
        })
      });

      const data = await grokRes.json();
      text = data.choices?.[0]?.message?.content ?? "";
    }
    else if (model === "gemini") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: Number(temperature) ?? 0.0
        }
      });

      const result = await geminiModel.generateContent(llmInput);
      text = result.response.text();
    }
    else if (model === "qwen") {
      const qwenRes = await fetch("http://localhost:11434/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(1800000),
        body: JSON.stringify({
          model: "qwen2.5-coder:32b",
          temperature: Number(temperature) ?? 0.0,
          messages: [{ role: "user", content: llmInput }]
        })
      });
      const data = await qwenRes.json();
      text = data.choices?.[0]?.message?.content ?? "";
    }
    else if (model === "deepseek") {
      const deepseekRes = await fetch("http://localhost:11434/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(1800000),
        body: JSON.stringify({
          model: "deepseek-r1:32b",
          temperature: Number(temperature) ?? 0.0,
          messages: [{ role: "user", content: llmInput }]
        })
      });
      const data = await deepseekRes.json();
      text = data.choices?.[0]?.message?.content ?? "";
    }
    else if (model === "mistral") {
      const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: Number(temperature) ?? 0.0,
          messages: [
            { role: "user", content: llmInput }
          ]
        })
      });

      const data = await mistralRes.json();
      text = data.choices?.[0]?.message?.content ?? "";
    }
    else {
      return res.status(400).json({ error: "Invalid model" });
    }

    const { cpp } = extractCppFromJson(text);

    await pool.query(
      `UPDATE run_experiments
       SET response = $1, cpp_code = $2
       WHERE id = $3`,
      [text, cpp, runId]
    );

    return res.json({
      id: runId,
      prompt,
      cpp,
      category,
      project
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});







// ── 10. Categories ────────────────────────────────────────────────────────────
app.get("/api/categories", async (req, res) => {
  try {
    const project = req.query.project; // <-- από query

    let query = `
      SELECT DISTINCT category
      FROM run_experiments
    `;

    const params = [];

    if (project) {
      query += ` WHERE category ILIKE $1`;
      params.push(`${project.toUpperCase()}_%`);
    }

    query += ` ORDER BY category`;

    const r = await pool.query(query, params);

    res.json(r.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── 11. Results — filtered list ───────────────────────────────────────────────
app.get("/api/results", async (req, res) => {
  try {
    const { project, category, architecture, model, promptType, temperature } = req.query;

    let query = `
      SELECT id,
             category,
             architecture,
             model,
             prompt_type,
             temperature
      FROM run_experiments
      WHERE 1=1
    `;

    const params = [];
    let i = 1;

    if (project) {
      query += ` AND category ILIKE $${i++}`;
      params.push(`${project.toUpperCase()}_%`);
    }

    if (category) {
      const categoryList = category.split(",");
      query += ` AND category = ANY($${i++})`;
      params.push(categoryList);
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

    if (temperature) {
      query += ` AND temperature = $${i++}`;
      params.push(temperature);
    }

    query += `
      ORDER BY category, id
    `;

    const r = await pool.query(query, params);

    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── 12. Single run experiment by id ──────────────────────────────────────────
app.get("/api/run-experiments/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const r = await pool.query(
      `
      SELECT
        id,
        prompt,
        cpp_code AS cpp,
        cpp_metrics AS metrics,
        uml_produced AS plantuml_produced,
        graph_json AS graphJson,
        architecture_analysis AS architecture_analysis,
        category
      FROM run_experiments
      WHERE id = $1
      `,
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Result not found" });
    }

    return res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error",
      details: String(err.message || err),
    });
  }
});

// ── 13. Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  await initDb();
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
})();
