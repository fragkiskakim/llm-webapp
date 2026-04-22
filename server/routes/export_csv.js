const express = require("express");
const router = express.Router();
const { pool } = require("../db");

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

  if (cohesionObj[namespaceName] !== undefined) {
    return cohesionObj[namespaceName];
  }

  const key = Object.keys(cohesionObj).find(
    (k) => k.toLowerCase() === namespaceName.toLowerCase()
  );

  return key ? cohesionObj[key] : "";
}

function getMartinMetric(architectureAnalysis, namespaceName, metricName) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") return "";

  if (
    martin[namespaceName] &&
    martin[namespaceName][metricName] !== undefined
  ) {
    return martin[namespaceName][metricName];
  }

  const key = Object.keys(martin).find(
    (k) => k.toLowerCase() === namespaceName.toLowerCase()
  );

  if (!key) return "";

  return martin[key][metricName] !== undefined ? martin[key][metricName] : "";
}

function computeMicroserviceAverages(architectureAnalysis) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") {
    return {
      count: 0,
      avgCa: "",
      avgCe: "",
      avgI: "",
      avgD: "",
      avgCohesion: "",
    };
  }

  const namespaces = Object.keys(martin);
  if (!namespaces.length) {
    return {
      count: 0,
      avgCa: "",
      avgCe: "",
      avgI: "",
      avgD: "",
      avgCohesion: "",
    };
  }

  const avg = (arr) => {
    const nums = arr.filter((x) => typeof x === "number" && !Number.isNaN(x));
    if (!nums.length) return "";
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const cohesionObj = architectureAnalysis?.cohesion || {};
  const cohesionVals = Object.values(cohesionObj).filter(
    (x) => typeof x === "number" && !Number.isNaN(x)
  );

  return {
    count: namespaces.length,
    avgCa: avg(namespaces.map((ns) => martin[ns]?.ca)),
    avgCe: avg(namespaces.map((ns) => martin[ns]?.ce)),
    avgI: avg(namespaces.map((ns) => martin[ns]?.instability)),
    avgD: avg(namespaces.map((ns) => martin[ns]?.distance)),
    avgCohesion: avg(cohesionVals),
  };
}

router.get("/export-csv", async (req, res) => {
  try {
    const { architecture } = req.query;

    if (!architecture) {
      return res.status(400).json({
        error: "Missing architecture query parameter",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        category,
        architecture,
        model,
        prompt_type,
        temperature,
        architecture_analysis
      FROM run_experiments
      WHERE architecture = $1
      ORDER BY id ASC
      `,
      [architecture]
    );

    const rows = result.rows;

    if (!rows.length) {
      return res.status(404).json({
        error: `No rows found for architecture='${architecture}'`,
      });
    }

    let headers = [];
    let dataRows = [];

    if (architecture === "3tier") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Run index",
        "Business Ca",
        "Business Ce",
        "Business I",
        "Business D",
        "Business Cohesion",
        "Data Ca",
        "Data Ce",
        "Data I",
        "Data D",
        "Data Cohesion",
        "Presentation Ca",
        "Presentation Ce",
        "Presentation I",
        "Presentation D",
        "Presentation Cohesion",
        "Arch Violations",
      ];

      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};

        return [
          getExperimentName(row.category),
          row.architecture ?? "",
          row.model ?? "",
          row.prompt_type ?? "",
          row.temperature ?? "",
          row.id,

          formatNumber(getMartinMetric(arch, "Business", "ca")),
          formatNumber(getMartinMetric(arch, "Business", "ce")),
          formatNumber(getMartinMetric(arch, "Business", "instability")),
          formatNumber(getMartinMetric(arch, "Business", "distance")),
          formatNumber(getCohesion(arch, "Business")),

          formatNumber(getMartinMetric(arch, "Data", "ca")),
          formatNumber(getMartinMetric(arch, "Data", "ce")),
          formatNumber(getMartinMetric(arch, "Data", "instability")),
          formatNumber(getMartinMetric(arch, "Data", "distance")),
          formatNumber(getCohesion(arch, "Data")),

          formatNumber(getMartinMetric(arch, "Presentation", "ca")),
          formatNumber(getMartinMetric(arch, "Presentation", "ce")),
          formatNumber(getMartinMetric(arch, "Presentation", "instability")),
          formatNumber(getMartinMetric(arch, "Presentation", "distance")),
          formatNumber(getCohesion(arch, "Presentation")),

          getArchViolations(arch),
        ];
      });
    } else if (architecture === "microservices") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Run index",
        "# Namespaces",
        "Avg Ca",
        "Avg Ce",
        "Avg I",
        "Avg D",
        "Avg Cohesion",
        "Arch Violations",
      ];

      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};
        const avg = computeMicroserviceAverages(arch);

        return [
          getExperimentName(row.category),
          row.architecture ?? "",
          row.model ?? "",
          row.prompt_type ?? "",
          row.temperature ?? "",
          row.id,
          avg.count,
          formatNumber(avg.avgCa),
          formatNumber(avg.avgCe),
          formatNumber(avg.avgI),
          formatNumber(avg.avgD),
          formatNumber(avg.avgCohesion),
          getArchViolations(arch),
        ];
      });
    } else if (architecture === "client-server") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Run index",
        "Client Ca",
        "Client Ce",
        "Client I",
        "Client D",
        "Client Cohesion",
        "Server Ca",
        "Server Ce",
        "Server I",
        "Server D",
        "Server Cohesion",
        "Arch Violations",
      ];

      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};

        return [
          getExperimentName(row.category),
          row.architecture ?? "",
          row.model ?? "",
          row.prompt_type ?? "",
          row.temperature ?? "",
          row.id,

          formatNumber(getMartinMetric(arch, "Client", "ca")),
          formatNumber(getMartinMetric(arch, "Client", "ce")),
          formatNumber(getMartinMetric(arch, "Client", "instability")),
          formatNumber(getMartinMetric(arch, "Client", "distance")),
          formatNumber(getCohesion(arch, "Client")),

          formatNumber(getMartinMetric(arch, "Server", "ca")),
          formatNumber(getMartinMetric(arch, "Server", "ce")),
          formatNumber(getMartinMetric(arch, "Server", "instability")),
          formatNumber(getMartinMetric(arch, "Server", "distance")),
          formatNumber(getCohesion(arch, "Server")),

          getArchViolations(arch),
        ];
      });
    } else if (architecture === "mvc") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Run index",
        "Model Ca",
        "Model Ce",
        "Model I",
        "Model D",
        "Model Cohesion",
        "View Ca",
        "View Ce",
        "View I",
        "View D",
        "View Cohesion",
        "Controller Ca",
        "Controller Ce",
        "Controller I",
        "Controller D",
        "Controller Cohesion",
        "Arch Violations",
      ];

      dataRows = rows.map((row) => {
        const arch = row.architecture_analysis || {};

        return [
          getExperimentName(row.category),
          row.architecture ?? "",
          row.model ?? "",
          row.prompt_type ?? "",
          row.temperature ?? "",
          row.id,

          formatNumber(getMartinMetric(arch, "Model", "ca")),
          formatNumber(getMartinMetric(arch, "Model", "ce")),
          formatNumber(getMartinMetric(arch, "Model", "instability")),
          formatNumber(getMartinMetric(arch, "Model", "distance")),
          formatNumber(getCohesion(arch, "Model")),

          formatNumber(getMartinMetric(arch, "View", "ca")),
          formatNumber(getMartinMetric(arch, "View", "ce")),
          formatNumber(getMartinMetric(arch, "View", "instability")),
          formatNumber(getMartinMetric(arch, "View", "distance")),
          formatNumber(getCohesion(arch, "View")),

          formatNumber(getMartinMetric(arch, "Controller", "ca")),
          formatNumber(getMartinMetric(arch, "Controller", "ce")),
          formatNumber(getMartinMetric(arch, "Controller", "instability")),
          formatNumber(getMartinMetric(arch, "Controller", "distance")),
          formatNumber(getCohesion(arch, "Controller")),

          getArchViolations(arch),
        ];
      });
    } else {
      return res.status(400).json({
        error: `Unsupported architecture: ${architecture}`,
      });
    }

    const csv = [
      headers.map(csvEscape).join(","),
      ...dataRows.map((r) => r.map(csvEscape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${architecture}_export.csv"`
    );

    return res.send(csv);
  } catch (err) {
    console.error("export-csv error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;