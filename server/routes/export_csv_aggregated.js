const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return Number(value.toFixed(4));
}

function getExperimentName(category) {
  if (!category) return "";
  const str = String(category);
  const idx = str.indexOf("_");
  return idx === -1 ? str : str.slice(0, idx);
}

function getArchViolations(architectureAnalysis) {
  return architectureAnalysis?.summary?.arch_violations ?? "";
}

function getCohesion(architectureAnalysis, namespaceName) {
  const cohesionObj = architectureAnalysis?.cohesion;
  if (!cohesionObj || typeof cohesionObj !== "object") return "";
  if (cohesionObj[namespaceName] !== undefined) return cohesionObj[namespaceName];
  const key = Object.keys(cohesionObj).find(
    (k) => k.toLowerCase() === namespaceName.toLowerCase()
  );
  return key ? cohesionObj[key] : "";
}

function getMartinMetric(architectureAnalysis, namespaceName, metricName) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") return "";
  if (martin[namespaceName]?.[metricName] !== undefined)
    return martin[namespaceName][metricName];
  const key = Object.keys(martin).find(
    (k) => k.toLowerCase() === namespaceName.toLowerCase()
  );
  if (!key) return "";
  return martin[key][metricName] !== undefined ? martin[key][metricName] : "";
}

function getWeightedCoupling(architectureAnalysis, namespaceName, metric) {
  const wc = architectureAnalysis?.weighted_coupling;
  if (!wc || typeof wc !== "object") return "";
  if (wc[namespaceName]?.[metric] !== undefined) return wc[namespaceName][metric];
  const key = Object.keys(wc).find(
    (k) => k.toLowerCase() === namespaceName.toLowerCase()
  );
  if (!key) return "";
  return wc[key][metric] !== undefined ? wc[key][metric] : "";
}

function avg(values) {
  const nums = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!nums.length) return "";
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(values) {
  const nums = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!nums.length) return "";
  if (nums.length === 1) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / nums.length);
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.architecture ?? "",
      row.model ?? "",
      row.temperature ?? "",
      row.prompt_type ?? "",
      getExperimentName(row.category),
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

// Collects per-namespace stat arrays for fixed architectures
function buildNamespaceStats(groupRows, namespaces) {
  const result = {};
  for (const ns of namespaces) {
    result[ns] = { ca: [], ce: [], instability: [], distance: [], cohesion: [], weighted_ce: [], weighted_ca: [] };
  }
  const archViolations = [];

  for (const row of groupRows) {
    const arch = row.architecture_analysis || {};
    for (const ns of namespaces) {
      result[ns].ca.push(getMartinMetric(arch, ns, "ca"));
      result[ns].ce.push(getMartinMetric(arch, ns, "ce"));
      result[ns].instability.push(getMartinMetric(arch, ns, "instability"));
      result[ns].distance.push(getMartinMetric(arch, ns, "distance"));
      result[ns].cohesion.push(getCohesion(arch, ns));
      result[ns].weighted_ce.push(getWeightedCoupling(arch, ns, "weighted_ce"));
      result[ns].weighted_ca.push(getWeightedCoupling(arch, ns, "weighted_ca"));
    }
    archViolations.push(getArchViolations(arch));
  }

  return { result, archViolations };
}

// Aggregates microservice-level stats for one run
function computeMicroserviceAveragesPerRun(architectureAnalysis) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") {
    return {
      namespaceCount: "", avgCa: "", avgCe: "", avgI: "", avgD: "",
      avgCohesion: "", avgWeightedCe: "", avgWeightedCa: "",
      archViolations: getArchViolations(architectureAnalysis)
    };
  }
  const namespaces = Object.keys(martin);
  const avgFn = (arr) => {
    const nums = arr.filter((x) => typeof x === "number" && !Number.isNaN(x));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : "";
  };
  const cohesionObj = architectureAnalysis?.cohesion || {};
  const cohesionVals = Object.values(cohesionObj).filter(
    (x) => typeof x === "number" && !Number.isNaN(x)
  );
  const wc = architectureAnalysis?.weighted_coupling || {};
  return {
    namespaceCount: namespaces.length,
    avgCa: avgFn(namespaces.map((ns) => martin[ns]?.ca)),
    avgCe: avgFn(namespaces.map((ns) => martin[ns]?.ce)),
    avgI: avgFn(namespaces.map((ns) => martin[ns]?.instability)),
    avgD: avgFn(namespaces.map((ns) => martin[ns]?.distance)),
    avgCohesion: avgFn(cohesionVals),
    avgWeightedCe: avgFn(namespaces.map((ns) => wc[ns]?.weighted_ce)),
    avgWeightedCa: avgFn(namespaces.map((ns) => wc[ns]?.weighted_ca)),
    archViolations: getArchViolations(architectureAnalysis),
  };
}

// Builds aggregated header+values for a single namespace
function nsAggColumns(ns) {
  return {
    headers: [
      `AVG ${ns} Ca`, `STD ${ns} Ca`,
      `AVG ${ns} Ce`, `STD ${ns} Ce`,
      `AVG ${ns} I`, `STD ${ns} I`,
      `AVG ${ns} D`, `STD ${ns} D`,
      `AVG ${ns} Cohesion`, `STD ${ns} Cohesion`,
      `AVG ${ns} Weighted Ce`, `STD ${ns} Weighted Ce`,
      `AVG ${ns} Weighted Ca`, `STD ${ns} Weighted Ca`,
    ],
    values: (stats) => [
      formatNumber(avg(stats[ns].ca)), formatNumber(stddev(stats[ns].ca)),
      formatNumber(avg(stats[ns].ce)), formatNumber(stddev(stats[ns].ce)),
      formatNumber(avg(stats[ns].instability)), formatNumber(stddev(stats[ns].instability)),
      formatNumber(avg(stats[ns].distance)), formatNumber(stddev(stats[ns].distance)),
      formatNumber(avg(stats[ns].cohesion)), formatNumber(stddev(stats[ns].cohesion)),
      formatNumber(avg(stats[ns].weighted_ce)), formatNumber(stddev(stats[ns].weighted_ce)),
      formatNumber(avg(stats[ns].weighted_ca)), formatNumber(stddev(stats[ns].weighted_ca)),
    ],
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/export-csv-aggregated", async (req, res) => {
  try {
    const { architecture } = req.query;
    if (!architecture) {
      return res.status(400).json({ error: "Missing architecture query parameter" });
    }

    const result = await pool.query(
      `SELECT id, category, architecture, model, prompt_type, temperature,
              architecture_analysis
       FROM run_experiments
       WHERE architecture = $1
       ORDER BY id ASC`,
      [architecture]
    );

    const rows = result.rows;
    if (!rows.length) {
      return res.status(404).json({ error: `No rows found for architecture='${architecture}'` });
    }

    const grouped = groupRows(rows);

    const baseHeaders = ["Experiment", "Architecture", "LLM model", "Prompt type", "Temperature", "Number of runs"];
    const baseValues = (first, group) => [
      getExperimentName(first.category),
      first.architecture ?? "",
      first.model ?? "",
      first.prompt_type ?? "",
      first.temperature ?? "",
      group.length,
    ];

    let headers = [];
    const dataRows = [];

    if (["3tier", "mvc", "client-server"].includes(architecture)) {
      const namespaceMap = {
        "3tier": ["Business", "Data", "Presentation"],
        "mvc": ["Model", "View", "Controller"],
        "client-server": ["Client", "Server"],
      };
      const namespaces = namespaceMap[architecture];

      headers = [
        ...baseHeaders,
        ...namespaces.flatMap((ns) => nsAggColumns(ns).headers),
        "AVG Arch Violations", "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];
        const { result: stats, archViolations } = buildNamespaceStats(group, namespaces);
        dataRows.push([
          ...baseValues(first, group),
          ...namespaces.flatMap((ns) => nsAggColumns(ns).values(stats)),
          formatNumber(avg(archViolations)),
          formatNumber(stddev(archViolations)),
        ]);
      }

    } else if (architecture === "microservices") {
      headers = [
        ...baseHeaders,
        "AVG # Namespaces", "STD # Namespaces",
        "AVG Avg Ca", "STD Avg Ca",
        "AVG Avg Ce", "STD Avg Ce",
        "AVG Avg I", "STD Avg I",
        "AVG Avg D", "STD Avg D",
        "AVG Avg Cohesion", "STD Avg Cohesion",
        "AVG Avg Weighted Ce", "STD Avg Weighted Ce",
        "AVG Avg Weighted Ca", "STD Avg Weighted Ca",
        "AVG Arch Violations", "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];
        const namespaceCounts = [], avgCas = [], avgCes = [], avgIs = [], avgDs = [];
        const avgCohesions = [], avgWCes = [], avgWCas = [], archViolations = [];

        for (const row of group) {
          const perRun = computeMicroserviceAveragesPerRun(row.architecture_analysis || {});
          namespaceCounts.push(perRun.namespaceCount);
          avgCas.push(perRun.avgCa);
          avgCes.push(perRun.avgCe);
          avgIs.push(perRun.avgI);
          avgDs.push(perRun.avgD);
          avgCohesions.push(perRun.avgCohesion);
          avgWCes.push(perRun.avgWeightedCe);
          avgWCas.push(perRun.avgWeightedCa);
          archViolations.push(perRun.archViolations);
        }

        dataRows.push([
          ...baseValues(first, group),
          formatNumber(avg(namespaceCounts)), formatNumber(stddev(namespaceCounts)),
          formatNumber(avg(avgCas)), formatNumber(stddev(avgCas)),
          formatNumber(avg(avgCes)), formatNumber(stddev(avgCes)),
          formatNumber(avg(avgIs)), formatNumber(stddev(avgIs)),
          formatNumber(avg(avgDs)), formatNumber(stddev(avgDs)),
          formatNumber(avg(avgCohesions)), formatNumber(stddev(avgCohesions)),
          formatNumber(avg(avgWCes)), formatNumber(stddev(avgWCes)),
          formatNumber(avg(avgWCas)), formatNumber(stddev(avgWCas)),
          formatNumber(avg(archViolations)), formatNumber(stddev(archViolations)),
        ]);
      }

    } else {
      return res.status(400).json({ error: `Unsupported architecture: ${architecture}` });
    }

    const csv = [
      headers.map(csvEscape).join(","),
      ...dataRows.map((r) => r.map(csvEscape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${architecture}_aggregated_export.csv"`);
    return res.send(csv);

  } catch (err) {
    console.error("export-csv-aggregated error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;