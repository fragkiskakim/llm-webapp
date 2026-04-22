const express = require("express");
const router = express.Router();
const { pool } = require("../db");

function avg(values) {
  const nums = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!nums.length) return "";
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  return Number(value.toFixed(4));
}

function getArchViolations(architectureAnalysis) {
  return architectureAnalysis?.summary?.arch_violations ?? "";
}

function getCohesionValues(architectureAnalysis) {
  const cohesionObj = architectureAnalysis?.cohesion;
  if (!cohesionObj || typeof cohesionObj !== "object") return [];

  return Object.values(cohesionObj).filter(
    (x) => typeof x === "number" && !Number.isNaN(x)
  );
}

function getMartinMetricValues(architectureAnalysis, metricName) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") return [];

  return Object.values(martin)
    .map((ns) => ns?.[metricName])
    .filter((x) => typeof x === "number" && !Number.isNaN(x));
}

function computePerRunSummary(architectureAnalysis) {
  const cohesionVals = getCohesionValues(architectureAnalysis);
  const instabilityVals = getMartinMetricValues(architectureAnalysis, "instability");
  const distanceVals = getMartinMetricValues(architectureAnalysis, "distance");

  return {
    archViolations: getArchViolations(architectureAnalysis),
    avgCohesion: avg(cohesionVals),
    avgInstability: avg(instabilityVals),
    avgDistance: avg(distanceVals),
  };
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

router.get("/chart-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        category,
        architecture,
        model,
        prompt_type,
        temperature,
        architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY id ASC
    `);

    const rows = result.rows;

    if (!rows.length) {
      return res.json({
        byArchitecture: [],
        byModelWithinArchitecture: [],
      });
    }

    // 1) Summary ανά architecture
    const architectureGroups = groupBy(rows, (row) => row.architecture ?? "unknown");

    const byArchitecture = [];

    for (const [architecture, group] of architectureGroups.entries()) {
      const archViolations = [];
      const cohesions = [];
      const instabilities = [];
      const distances = [];

      for (const row of group) {
        const summary = computePerRunSummary(row.architecture_analysis || {});

        archViolations.push(summary.archViolations);
        cohesions.push(summary.avgCohesion);
        instabilities.push(summary.avgInstability);
        distances.push(summary.avgDistance);
      }

      byArchitecture.push({
        architecture,
        runs: group.length,
        avgArchViolations: formatNumber(avg(archViolations)),
        avgCohesion: formatNumber(avg(cohesions)),
        avgInstability: formatNumber(avg(instabilities)),
        avgDistance: formatNumber(avg(distances)),
      });
    }

    // 2) Summary ανά (architecture, model)
    const modelGroups = groupBy(
      rows,
      (row) => JSON.stringify([row.architecture ?? "unknown", row.model ?? "unknown"])
    );

    const byModelWithinArchitecture = [];

    for (const [key, group] of modelGroups.entries()) {
      const [architecture, model] = JSON.parse(key);

      const archViolations = [];
      const cohesions = [];
      const instabilities = [];
      const distances = [];

      for (const row of group) {
        const summary = computePerRunSummary(row.architecture_analysis || {});

        archViolations.push(summary.archViolations);
        cohesions.push(summary.avgCohesion);
        instabilities.push(summary.avgInstability);
        distances.push(summary.avgDistance);
      }

      byModelWithinArchitecture.push({
        architecture,
        model,
        runs: group.length,
        avgArchViolations: formatNumber(avg(archViolations)),
        avgCohesion: formatNumber(avg(cohesions)),
        avgInstability: formatNumber(avg(instabilities)),
        avgDistance: formatNumber(avg(distances)),
      });
    }

    return res.json({
      byArchitecture,
      byModelWithinArchitecture,
    });
  } catch (err) {
    console.error("chart-summary error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;