const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// ─── helpers ────────────────────────────────────────────────────────────────

function avg(values) {
  const nums = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(values) {
  const nums = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function fmt(v) {
  if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) return null;
  return Number(Number(v).toFixed(4));
}

function getCohesionValues(architectureAnalysis) {
  const cohesionObj = architectureAnalysis?.cohesion;
  if (!cohesionObj || typeof cohesionObj !== "object") return {};
  return cohesionObj;
}

function getMartinMetrics(architectureAnalysis) {
  return architectureAnalysis?.martin_metrics || {};
}

function getAvgCohesion(architectureAnalysis) {
  const vals = Object.values(getCohesionValues(architectureAnalysis)).filter(
    (x) => typeof x === "number" && !isNaN(x)
  );
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function getArchViolations(architectureAnalysis) {
  return architectureAnalysis?.summary?.arch_violations ?? null;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

const ARCH_NAMESPACES = {
  "client-server": ["Client", "Server"],
  "3tier": ["Business", "Data", "Presentation"],
  mvc: ["Model", "View", "Controller"],
};

// ─── 1. Temperature Effect ───────────────────────────────────────────────────
// Returns: per architecture, per model, per temperature → avg cohesion per namespace
// Shape: { "client-server": [ { temperature, model, Client, Server }, … ], … }

router.get("/chart-temperature-effect", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT architecture, model, temperature, architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY architecture, model, temperature::float
    `);

    const architectures = ["client-server", "3tier", "mvc", "microservices"];
    const response = Object.fromEntries(architectures.map((a) => [a, []]));

    const grouped = groupBy(
      result.rows,
      (r) => JSON.stringify([r.architecture, r.model, r.temperature])
    );

    for (const [key, rows] of grouped.entries()) {
      const [architecture, model, temperature] = JSON.parse(key);
      if (!response[architecture]) continue;

      const namespaces = ARCH_NAMESPACES[architecture];

      if (namespaces) {
        const entry = { temperature: Number(temperature), model };
        for (const ns of namespaces) {
          const vals = rows.map((r) => {
            const c = getCohesionValues(r.architecture_analysis);
            const key = Object.keys(c).find((k) => k.toLowerCase() === ns.toLowerCase());
            return key ? c[key] : null;
          }).filter((x) => x !== null);
          entry[ns] = fmt(avg(vals));
        }
        response[architecture].push(entry);
      } else if (architecture === "microservices") {
        const vals = rows.map((r) => getAvgCohesion(r.architecture_analysis)).filter((x) => x !== null);
        response["microservices"].push({
          temperature: Number(temperature),
          model,
          AvgCohesion: fmt(avg(vals)),
        });
      }
    }

    return res.json(response);
  } catch (err) {
    console.error("chart-temperature-effect error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── 2. Coupling & Instability (Martin Metrics) ──────────────────────────────
// Returns per architecture → per namespace → per model: avg ca, ce, instability, distance
// Shape: { "3tier": [ { model, namespace, ca, ce, instability, distance, abstractness }, … ], … }

router.get("/chart-coupling-instability", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT architecture, model, architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY architecture, model
    `);

    const architectures = ["client-server", "3tier", "mvc", "microservices"];
    const response = Object.fromEntries(architectures.map((a) => [a, []]));

    // group by architecture + model
    const grouped = groupBy(
      result.rows,
      (r) => JSON.stringify([r.architecture, r.model])
    );

    for (const [key, rows] of grouped.entries()) {
      const [architecture, model] = JSON.parse(key);
      if (!response[architecture]) continue;

      const namespaces = ARCH_NAMESPACES[architecture];
      const nsNames = namespaces || ["microservices"]; // microservices: aggregate

      if (namespaces) {
        for (const ns of namespaces) {
          const caVals = [], ceVals = [], instVals = [], distVals = [], absVals = [];

          for (const row of rows) {
            const mm = getMartinMetrics(row.architecture_analysis);
            const nsKey = Object.keys(mm).find((k) => k.toLowerCase() === ns.toLowerCase());
            if (!nsKey) continue;
            const m = mm[nsKey];
            if (typeof m.ca === "number") caVals.push(m.ca);
            if (typeof m.ce === "number") ceVals.push(m.ce);
            if (typeof m.instability === "number") instVals.push(m.instability);
            if (typeof m.distance === "number") distVals.push(m.distance);
            if (typeof m.abstractness === "number") absVals.push(m.abstractness);
          }

          response[architecture].push({
            model,
            namespace: ns,
            ca: fmt(avg(caVals)),
            ce: fmt(avg(ceVals)),
            instability: fmt(avg(instVals)),
            distance: fmt(avg(distVals)),
            abstractness: fmt(avg(absVals)),
          });
        }
      } else if (architecture === "microservices") {
        // for microservices, avg across all namespaces in each run, then avg across runs
        const caVals = [], ceVals = [], instVals = [], distVals = [], absVals = [];

        for (const row of rows) {
          const mm = getMartinMetrics(row.architecture_analysis);
          const nsValues = Object.values(mm);
          if (!nsValues.length) continue;
          caVals.push(avg(nsValues.map((m) => m.ca).filter((x) => typeof x === "number")));
          ceVals.push(avg(nsValues.map((m) => m.ce).filter((x) => typeof x === "number")));
          instVals.push(avg(nsValues.map((m) => m.instability).filter((x) => typeof x === "number")));
          distVals.push(avg(nsValues.map((m) => m.distance).filter((x) => typeof x === "number")));
          absVals.push(avg(nsValues.map((m) => m.abstractness).filter((x) => typeof x === "number")));
        }

        response["microservices"].push({
          model,
          namespace: "avg",
          ca: fmt(avg(caVals.filter((x) => x !== null))),
          ce: fmt(avg(ceVals.filter((x) => x !== null))),
          instability: fmt(avg(instVals.filter((x) => x !== null))),
          distance: fmt(avg(distVals.filter((x) => x !== null))),
          abstractness: fmt(avg(absVals.filter((x) => x !== null))),
        });
      }
    }

    return res.json(response);
  } catch (err) {
    console.error("chart-coupling-instability error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── 3. Prompt Type Comparison ───────────────────────────────────────────────
// Returns per architecture → per model → frnfr vs srs avg cohesion (and violations)
// Shape: { "3tier": [ { model, frnfr_cohesion, srs_cohesion, frnfr_violations, srs_violations }, … ] }

router.get("/chart-prompt-comparison", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT architecture, model, prompt_type, architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY architecture, model, prompt_type
    `);

    const architectures = ["client-server", "3tier", "mvc", "microservices"];
    const response = Object.fromEntries(architectures.map((a) => [a, []]));

    // group by architecture + model + prompt_type
    const byModelPrompt = groupBy(
      result.rows,
      (r) => JSON.stringify([r.architecture, r.model, r.prompt_type])
    );

    // collect all (arch, model) pairs
    const archModelSet = new Set(
      result.rows.map((r) => JSON.stringify([r.architecture, r.model]))
    );

    for (const archModelKey of archModelSet) {
      const [architecture, model] = JSON.parse(archModelKey);
      if (!response[architecture]) continue;

      const entry = { model };
      const promptTypes = ["frnfr", "srs"];

      for (const pt of promptTypes) {
        const key = JSON.stringify([architecture, model, pt]);
        const rows = byModelPrompt.get(key) || [];

        if (rows.length === 0) {
          entry[`${pt}_cohesion`] = null;
          entry[`${pt}_violations`] = null;
          continue;
        }

        const cohesionVals = rows.map((r) => getAvgCohesion(r.architecture_analysis)).filter((x) => x !== null);
        const violationsVals = rows.map((r) => getArchViolations(r.architecture_analysis)).filter((x) => x !== null);

        entry[`${pt}_cohesion`] = fmt(avg(cohesionVals));
        entry[`${pt}_violations`] = fmt(avg(violationsVals));
      }

      response[architecture].push(entry);
    }

    return res.json(response);
  } catch (err) {
    console.error("chart-prompt-comparison error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── 4. Variance / STD Analysis ──────────────────────────────────────────────
// Returns per architecture → per model: mean cohesion, std cohesion, mean violations, std violations
// Shape: { "3tier": [ { model, mean_cohesion, std_cohesion, mean_violations, std_violations }, … ] }

router.get("/chart-variance-analysis", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT architecture, model, architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY architecture, model
    `);

    const architectures = ["client-server", "3tier", "mvc", "microservices"];
    const response = Object.fromEntries(architectures.map((a) => [a, []]));

    const grouped = groupBy(
      result.rows,
      (r) => JSON.stringify([r.architecture, r.model])
    );

    for (const [key, rows] of grouped.entries()) {
      const [architecture, model] = JSON.parse(key);
      if (!response[architecture]) continue;

      const cohesionVals = rows
        .map((r) => getAvgCohesion(r.architecture_analysis))
        .filter((x) => x !== null);

      const violationVals = rows
        .map((r) => getArchViolations(r.architecture_analysis))
        .filter((x) => x !== null);

      // per-namespace STD for non-microservices
      const namespaces = ARCH_NAMESPACES[architecture];
      const nsStd = {};

      if (namespaces) {
        for (const ns of namespaces) {
          const vals = rows.map((r) => {
            const c = getCohesionValues(r.architecture_analysis);
            const nsKey = Object.keys(c).find((k) => k.toLowerCase() === ns.toLowerCase());
            return nsKey ? c[nsKey] : null;
          }).filter((x) => x !== null);
          nsStd[`std_${ns.toLowerCase()}`] = fmt(stdDev(vals));
          nsStd[`mean_${ns.toLowerCase()}`] = fmt(avg(vals));
        }
      }

      response[architecture].push({
        model,
        mean_cohesion: fmt(avg(cohesionVals)),
        std_cohesion: fmt(stdDev(cohesionVals)),
        mean_violations: fmt(avg(violationVals)),
        std_violations: fmt(stdDev(violationVals)),
        n: rows.length,
        ...nsStd,
      });
    }

    return res.json(response);
  } catch (err) {
    console.error("chart-variance-analysis error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;