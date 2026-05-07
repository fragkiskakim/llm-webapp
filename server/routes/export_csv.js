const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getExperimentName(category) {
  if (!category) return "";
  return String(category).split("_")[0];
}

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
  if (typeof value !== "number") return value;
  return Number(value.toFixed(4));
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

function computeMicroserviceAverages(architectureAnalysis) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") {
    return {
      count: 0, avgCa: "", avgCe: "", avgI: "", avgD: "",
      avgCohesion: "", avgWeightedCe: "", avgWeightedCa: ""
    };
  }
  const namespaces = Object.keys(martin);
  if (!namespaces.length) {
    return {
      count: 0, avgCa: "", avgCe: "", avgI: "", avgD: "",
      avgCohesion: "", avgWeightedCe: "", avgWeightedCa: ""
    };
  }
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
    count: namespaces.length,
    avgCa: avgFn(namespaces.map((ns) => martin[ns]?.ca)),
    avgCe: avgFn(namespaces.map((ns) => martin[ns]?.ce)),
    avgI: avgFn(namespaces.map((ns) => martin[ns]?.instability)),
    avgD: avgFn(namespaces.map((ns) => martin[ns]?.distance)),
    avgCohesion: avgFn(cohesionVals),
    avgWeightedCe: avgFn(namespaces.map((ns) => wc[ns]?.weighted_ce)),
    avgWeightedCa: avgFn(namespaces.map((ns) => wc[ns]?.weighted_ca)),
  };
}

// ─── Namespace column builder ─────────────────────────────────────────────────
// Returns [header_strings] and (arch) => [value_array] for a single namespace.

function nsColumns(ns) {
  return {
    headers: [
      `${ns} Ca`, `${ns} Ce`, `${ns} I`, `${ns} D`, `${ns} Cohesion`,
      `${ns} Weighted Ce`, `${ns} Weighted Ca`,
    ],
    values: (arch) => [
      formatNumber(getMartinMetric(arch, ns, "ca")),
      formatNumber(getMartinMetric(arch, ns, "ce")),
      formatNumber(getMartinMetric(arch, ns, "instability")),
      formatNumber(getMartinMetric(arch, ns, "distance")),
      formatNumber(getCohesion(arch, ns)),
      formatNumber(getWeightedCoupling(arch, ns, "weighted_ce")),
      formatNumber(getWeightedCoupling(arch, ns, "weighted_ca")),
    ],
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/export-csv", async (req, res) => {
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

    const baseHeaders = ["Experiment", "Architecture", "LLM model", "Prompt type", "Temperature", "Run index"];
    const baseValues = (row) => [
      getExperimentName(row.category),
      row.architecture ?? "",
      row.model ?? "",
      row.prompt_type ?? "",
      row.temperature ?? "",
      row.id,
    ];

    let headers = [];
    let dataRows = [];

    if (architecture === "3tier") {
      const namespaces = ["Business", "Data", "Presentation"];
      headers = [
        ...baseHeaders,
        ...namespaces.flatMap((ns) => nsColumns(ns).headers),
        "Arch Violations",
      ];
      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};
        return [
          ...baseValues(row),
          ...namespaces.flatMap((ns) => nsColumns(ns).values(arch)),
          getArchViolations(arch),
        ];
      });

    } else if (architecture === "mvc") {
      const namespaces = ["Model", "View", "Controller"];
      headers = [
        ...baseHeaders,
        ...namespaces.flatMap((ns) => nsColumns(ns).headers),
        "Arch Violations",
      ];
      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};
        return [
          ...baseValues(row),
          ...namespaces.flatMap((ns) => nsColumns(ns).values(arch)),
          getArchViolations(arch),
        ];
      });

    } else if (architecture === "client-server") {
      const namespaces = ["Client", "Server"];
      headers = [
        ...baseHeaders,
        ...namespaces.flatMap((ns) => nsColumns(ns).headers),
        "Arch Violations",
      ];
      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};
        return [
          ...baseValues(row),
          ...namespaces.flatMap((ns) => nsColumns(ns).values(arch)),
          getArchViolations(arch),
        ];
      });

    } else if (architecture === "microservices") {
      headers = [
        ...baseHeaders,
        "# Namespaces",
        "Avg Ca", "Avg Ce", "Avg I", "Avg D", "Avg Cohesion",
        "Avg Weighted Ce", "Avg Weighted Ca",
        "Arch Violations",
      ];
      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};
        const m = computeMicroserviceAverages(arch);
        return [
          ...baseValues(row),
          m.count,
          formatNumber(m.avgCa),
          formatNumber(m.avgCe),
          formatNumber(m.avgI),
          formatNumber(m.avgD),
          formatNumber(m.avgCohesion),
          formatNumber(m.avgWeightedCe),
          formatNumber(m.avgWeightedCa),
          getArchViolations(arch),
        ];
      });

    } else {
      return res.status(400).json({ error: `Unsupported architecture: ${architecture}` });
    }

    const csv = [
      headers.map(csvEscape).join(","),
      ...dataRows.map((r) => r.map(csvEscape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${architecture}_export.csv"`);
    return res.send(csv);

  } catch (err) {
    console.error("export-csv error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;