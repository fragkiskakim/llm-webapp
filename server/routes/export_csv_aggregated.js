const express = require("express");
const router = express.Router();
const { pool } = require("../db");

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

function computeMicroserviceAveragesPerRun(architectureAnalysis) {
  const martin = architectureAnalysis?.martin_metrics;
  if (!martin || typeof martin !== "object") {
    return {
      namespaceCount: "",
      avgCa: "",
      avgCe: "",
      avgI: "",
      avgD: "",
      avgCohesion: "",
      archViolations: getArchViolations(architectureAnalysis),
    };
  }

  const namespaces = Object.keys(martin);

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
    namespaceCount: namespaces.length,
    avgCa: avg(namespaces.map((ns) => martin[ns]?.ca)),
    avgCe: avg(namespaces.map((ns) => martin[ns]?.ce)),
    avgI: avg(namespaces.map((ns) => martin[ns]?.instability)),
    avgD: avg(namespaces.map((ns) => martin[ns]?.distance)),
    avgCohesion: avg(cohesionVals),
    archViolations: getArchViolations(architectureAnalysis),
  };
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
  const variance =
    nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / nums.length;

  return Math.sqrt(variance);
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

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  return groups;
}

function buildNamespaceStats(groupRows, namespaces) {
  const result = {};

  for (const ns of namespaces) {
    result[ns] = {
      ca: [],
      ce: [],
      instability: [],
      distance: [],
      cohesion: [],
    };
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
    }

    archViolations.push(getArchViolations(arch));
  }

  return { result, archViolations };
}

router.get("/export-csv-aggregated", async (req, res) => {
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

    const grouped = groupRows(rows);

    let headers = [];
    const dataRows = [];

    if (architecture === "3tier") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Number of runs",

        "AVG Business Ca",
        "STD Business Ca",
        "AVG Business Ce",
        "STD Business Ce",
        "AVG Business I",
        "STD Business I",
        "AVG Business D",
        "STD Business D",
        "AVG Business Cohesion",
        "STD Business Cohesion",

        "AVG Data Ca",
        "STD Data Ca",
        "AVG Data Ce",
        "STD Data Ce",
        "AVG Data I",
        "STD Data I",
        "AVG Data D",
        "STD Data D",
        "AVG Data Cohesion",
        "STD Data Cohesion",

        "AVG Presentation Ca",
        "STD Presentation Ca",
        "AVG Presentation Ce",
        "STD Presentation Ce",
        "AVG Presentation I",
        "STD Presentation I",
        "AVG Presentation D",
        "STD Presentation D",
        "AVG Presentation Cohesion",
        "STD Presentation Cohesion",

        "AVG Arch Violations",
        "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];
        const { result: stats, archViolations } = buildNamespaceStats(group, [
          "Business",
          "Data",
          "Presentation",
        ]);

        dataRows.push([
          getExperimentName(first.category),
          first.architecture ?? "",
          first.model ?? "",
          first.prompt_type ?? "",
          first.temperature ?? "",
          group.length,

          formatNumber(avg(stats.Business.ca)),
          formatNumber(stddev(stats.Business.ca)),
          formatNumber(avg(stats.Business.ce)),
          formatNumber(stddev(stats.Business.ce)),
          formatNumber(avg(stats.Business.instability)),
          formatNumber(stddev(stats.Business.instability)),
          formatNumber(avg(stats.Business.distance)),
          formatNumber(stddev(stats.Business.distance)),
          formatNumber(avg(stats.Business.cohesion)),
          formatNumber(stddev(stats.Business.cohesion)),

          formatNumber(avg(stats.Data.ca)),
          formatNumber(stddev(stats.Data.ca)),
          formatNumber(avg(stats.Data.ce)),
          formatNumber(stddev(stats.Data.ce)),
          formatNumber(avg(stats.Data.instability)),
          formatNumber(stddev(stats.Data.instability)),
          formatNumber(avg(stats.Data.distance)),
          formatNumber(stddev(stats.Data.distance)),
          formatNumber(avg(stats.Data.cohesion)),
          formatNumber(stddev(stats.Data.cohesion)),

          formatNumber(avg(stats.Presentation.ca)),
          formatNumber(stddev(stats.Presentation.ca)),
          formatNumber(avg(stats.Presentation.ce)),
          formatNumber(stddev(stats.Presentation.ce)),
          formatNumber(avg(stats.Presentation.instability)),
          formatNumber(stddev(stats.Presentation.instability)),
          formatNumber(avg(stats.Presentation.distance)),
          formatNumber(stddev(stats.Presentation.distance)),
          formatNumber(avg(stats.Presentation.cohesion)),
          formatNumber(stddev(stats.Presentation.cohesion)),

          formatNumber(avg(archViolations)),
          formatNumber(stddev(archViolations)),
        ]);
      }
    } else if (architecture === "mvc") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Number of runs",

        "AVG Model Ca",
        "STD Model Ca",
        "AVG Model Ce",
        "STD Model Ce",
        "AVG Model I",
        "STD Model I",
        "AVG Model D",
        "STD Model D",
        "AVG Model Cohesion",
        "STD Model Cohesion",

        "AVG View Ca",
        "STD View Ca",
        "AVG View Ce",
        "STD View Ce",
        "AVG View I",
        "STD View I",
        "AVG View D",
        "STD View D",
        "AVG View Cohesion",
        "STD View Cohesion",

        "AVG Controller Ca",
        "STD Controller Ca",
        "AVG Controller Ce",
        "STD Controller Ce",
        "AVG Controller I",
        "STD Controller I",
        "AVG Controller D",
        "STD Controller D",
        "AVG Controller Cohesion",
        "STD Controller Cohesion",

        "AVG Arch Violations",
        "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];
        const { result: stats, archViolations } = buildNamespaceStats(group, [
          "Model",
          "View",
          "Controller",
        ]);

        dataRows.push([
          getExperimentName(first.category),
          first.architecture ?? "",
          first.model ?? "",
          first.prompt_type ?? "",
          first.temperature ?? "",
          group.length,

          formatNumber(avg(stats.Model.ca)),
          formatNumber(stddev(stats.Model.ca)),
          formatNumber(avg(stats.Model.ce)),
          formatNumber(stddev(stats.Model.ce)),
          formatNumber(avg(stats.Model.instability)),
          formatNumber(stddev(stats.Model.instability)),
          formatNumber(avg(stats.Model.distance)),
          formatNumber(stddev(stats.Model.distance)),
          formatNumber(avg(stats.Model.cohesion)),
          formatNumber(stddev(stats.Model.cohesion)),

          formatNumber(avg(stats.View.ca)),
          formatNumber(stddev(stats.View.ca)),
          formatNumber(avg(stats.View.ce)),
          formatNumber(stddev(stats.View.ce)),
          formatNumber(avg(stats.View.instability)),
          formatNumber(stddev(stats.View.instability)),
          formatNumber(avg(stats.View.distance)),
          formatNumber(stddev(stats.View.distance)),
          formatNumber(avg(stats.View.cohesion)),
          formatNumber(stddev(stats.View.cohesion)),

          formatNumber(avg(stats.Controller.ca)),
          formatNumber(stddev(stats.Controller.ca)),
          formatNumber(avg(stats.Controller.ce)),
          formatNumber(stddev(stats.Controller.ce)),
          formatNumber(avg(stats.Controller.instability)),
          formatNumber(stddev(stats.Controller.instability)),
          formatNumber(avg(stats.Controller.distance)),
          formatNumber(stddev(stats.Controller.distance)),
          formatNumber(avg(stats.Controller.cohesion)),
          formatNumber(stddev(stats.Controller.cohesion)),

          formatNumber(avg(archViolations)),
          formatNumber(stddev(archViolations)),
        ]);
      }
    } else if (architecture === "client-server") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Number of runs",

        "AVG Client Ca",
        "STD Client Ca",
        "AVG Client Ce",
        "STD Client Ce",
        "AVG Client I",
        "STD Client I",
        "AVG Client D",
        "STD Client D",
        "AVG Client Cohesion",
        "STD Client Cohesion",

        "AVG Server Ca",
        "STD Server Ca",
        "AVG Server Ce",
        "STD Server Ce",
        "AVG Server I",
        "STD Server I",
        "AVG Server D",
        "STD Server D",
        "AVG Server Cohesion",
        "STD Server Cohesion",

        "AVG Arch Violations",
        "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];
        const { result: stats, archViolations } = buildNamespaceStats(group, [
          "Client",
          "Server",
        ]);

        dataRows.push([
          getExperimentName(first.category),
          first.architecture ?? "",
          first.model ?? "",
          first.prompt_type ?? "",
          first.temperature ?? "",
          group.length,

          formatNumber(avg(stats.Client.ca)),
          formatNumber(stddev(stats.Client.ca)),
          formatNumber(avg(stats.Client.ce)),
          formatNumber(stddev(stats.Client.ce)),
          formatNumber(avg(stats.Client.instability)),
          formatNumber(stddev(stats.Client.instability)),
          formatNumber(avg(stats.Client.distance)),
          formatNumber(stddev(stats.Client.distance)),
          formatNumber(avg(stats.Client.cohesion)),
          formatNumber(stddev(stats.Client.cohesion)),

          formatNumber(avg(stats.Server.ca)),
          formatNumber(stddev(stats.Server.ca)),
          formatNumber(avg(stats.Server.ce)),
          formatNumber(stddev(stats.Server.ce)),
          formatNumber(avg(stats.Server.instability)),
          formatNumber(stddev(stats.Server.instability)),
          formatNumber(avg(stats.Server.distance)),
          formatNumber(stddev(stats.Server.distance)),
          formatNumber(avg(stats.Server.cohesion)),
          formatNumber(stddev(stats.Server.cohesion)),

          formatNumber(avg(archViolations)),
          formatNumber(stddev(archViolations)),
        ]);
      }
    } else if (architecture === "microservices") {
      headers = [
        "Experiment",
        "Architecture",
        "LLM model",
        "Prompt type",
        "Temperature",
        "Number of runs",
        "AVG # Namespaces",
        "STD # Namespaces",
        "AVG Avg Ca",
        "STD Avg Ca",
        "AVG Avg Ce",
        "STD Avg Ce",
        "AVG Avg I",
        "STD Avg I",
        "AVG Avg D",
        "STD Avg D",
        "AVG Avg Cohesion",
        "STD Avg Cohesion",
        "AVG Arch Violations",
        "STD Arch Violations",
      ];

      for (const [, group] of grouped) {
        const first = group[0];

        const namespaceCounts = [];
        const avgCas = [];
        const avgCes = [];
        const avgIs = [];
        const avgDs = [];
        const avgCohesions = [];
        const archViolations = [];

        for (const row of group) {
          const arch = row.architecture_analysis || {};
          const perRun = computeMicroserviceAveragesPerRun(arch);

          namespaceCounts.push(perRun.namespaceCount);
          avgCas.push(perRun.avgCa);
          avgCes.push(perRun.avgCe);
          avgIs.push(perRun.avgI);
          avgDs.push(perRun.avgD);
          avgCohesions.push(perRun.avgCohesion);
          archViolations.push(perRun.archViolations);
        }

        dataRows.push([
          getExperimentName(first.category),
          first.architecture ?? "",
          first.model ?? "",
          first.prompt_type ?? "",
          first.temperature ?? "",
          group.length,

          formatNumber(avg(namespaceCounts)),
          formatNumber(stddev(namespaceCounts)),
          formatNumber(avg(avgCas)),
          formatNumber(stddev(avgCas)),
          formatNumber(avg(avgCes)),
          formatNumber(stddev(avgCes)),
          formatNumber(avg(avgIs)),
          formatNumber(stddev(avgIs)),
          formatNumber(avg(avgDs)),
          formatNumber(stddev(avgDs)),
          formatNumber(avg(avgCohesions)),
          formatNumber(stddev(avgCohesions)),
          formatNumber(avg(archViolations)),
          formatNumber(stddev(archViolations)),
        ]);
      }
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
      `attachment; filename="${architecture}_aggregated_export.csv"`
    );

    return res.send(csv);
  } catch (err) {
    console.error("export-csv-aggregated error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;