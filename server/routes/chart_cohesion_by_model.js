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

function getAverageCohesion(architectureAnalysis) {
  const cohesionObj = architectureAnalysis?.cohesion;
  if (!cohesionObj || typeof cohesionObj !== "object") return "";

  const vals = Object.values(cohesionObj).filter(
    (x) => typeof x === "number" && !Number.isNaN(x)
  );

  return avg(vals);
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

router.get("/chart-cohesion-by-model", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        architecture,
        model,
        architecture_analysis
      FROM run_experiments
      WHERE architecture_analysis IS NOT NULL
      ORDER BY architecture, model
    `);

    const rows = result.rows;

    const grouped = groupBy(
      rows,
      (row) => JSON.stringify([row.architecture ?? "", row.model ?? ""])
    );

    const response = {
      "client-server": [],
      "3tier": [],
      "mvc": [],
      "microservices": [],
    };

    for (const [key, group] of grouped.entries()) {
      const [architecture, model] = JSON.parse(key);

      if (architecture === "client-server") {
        const clientVals = [];
        const serverVals = [];

        for (const row of group) {
          const arch = row.architecture_analysis || {};
          clientVals.push(getCohesion(arch, "Client"));
          serverVals.push(getCohesion(arch, "Server"));
        }

        response["client-server"].push({
          model,
          Client: formatNumber(avg(clientVals)),
          Server: formatNumber(avg(serverVals)),
        });
      } else if (architecture === "3tier") {
        const businessVals = [];
        const dataVals = [];
        const presentationVals = [];

        for (const row of group) {
          const arch = row.architecture_analysis || {};
          businessVals.push(getCohesion(arch, "Business"));
          dataVals.push(getCohesion(arch, "Data"));
          presentationVals.push(getCohesion(arch, "Presentation"));
        }

        response["3tier"].push({
          model,
          Business: formatNumber(avg(businessVals)),
          Data: formatNumber(avg(dataVals)),
          Presentation: formatNumber(avg(presentationVals)),
        });
      } else if (architecture === "mvc") {
        const modelVals = [];
        const viewVals = [];
        const controllerVals = [];

        for (const row of group) {
          const arch = row.architecture_analysis || {};
          modelVals.push(getCohesion(arch, "Model"));
          viewVals.push(getCohesion(arch, "View"));
          controllerVals.push(getCohesion(arch, "Controller"));
        }

        response["mvc"].push({
          model,
          Model: formatNumber(avg(modelVals)),
          View: formatNumber(avg(viewVals)),
          Controller: formatNumber(avg(controllerVals)),
        });
      } else if (architecture === "microservices") {
        const avgCohesionVals = [];

        for (const row of group) {
          const arch = row.architecture_analysis || {};
          avgCohesionVals.push(getAverageCohesion(arch));
        }

        response["microservices"].push({
          model,
          AvgCohesion: formatNumber(avg(avgCohesionVals)),
        });
      }
    }

    return res.json(response);
  } catch (err) {
    console.error("chart-cohesion-by-model error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;