const express = require("express");
const driver = require("../neo4j");
const { pool, initDb } = require("../db");

const router = express.Router();

function sanitizeRelType(type) {
    return String(type || "RELATED_TO")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
}

const { importGraphForRun } = require("./graphImport");

router.post("/graph/import/:id", async (req, res) => {
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId)) return res.status(400).json({ error: "Invalid run_experiments id" });

    try {
        const result = await importGraphForRun(runId, { pool, driver });
        return res.json({ ok: true, runId, ...result });
    } catch (err) {
        console.error("Neo4j import error:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

router.get("/graph/view/:id", async (req, res) => {
    const runId = Number(req.params.id);

    if (!Number.isInteger(runId)) {
        return res.status(400).json({ error: "Invalid run_experiments id" });
    }

    const session = driver.session({
        database: process.env.NEO4J_DATABASE,
    });

    try {
        const result = await session.run(
            `
      MATCH (a:Entity {run_id: $runId})
      OPTIONAL MATCH (a)-[r]->(b:Entity {run_id: $runId})
      RETURN a, r, b
      `,
            { runId }
        );

        const nodesMap = new Map();
        const edges = [];

        for (const record of result.records) {
            const a = record.get("a");
            const r = record.get("r");
            const b = record.get("b");

            if (a) {
                nodesMap.set(a.properties.id, {
                    id: a.properties.id,
                    label: a.properties.id,
                    kind: a.properties.kind,
                    owner_namespace: a.properties.owner_namespace,
                    is_abstract: a.properties.is_abstract,
                    is_template: a.properties.is_template,
                });
            }

            if (b) {
                nodesMap.set(b.properties.id, {
                    id: b.properties.id,
                    label: b.properties.id,
                    kind: b.properties.kind,
                    owner_namespace: b.properties.owner_namespace,
                    is_abstract: b.properties.is_abstract,
                    is_template: b.properties.is_template,
                });
            }

            if (a && r && b) {
                edges.push({
                    id: r.identity.toString(),
                    source: a.properties.id,
                    target: b.properties.id,
                    type: r.type,
                });
            }
        }

        return res.json({
            ok: true,
            runId,
            nodes: [...nodesMap.values()],
            edges,
        });
    } catch (err) {
        console.error("Neo4j view error:", err);
        return res.status(500).json({
            ok: false,
            error: err.message,
        });
    } finally {
        await session.close();
    }
});


router.get("/graph/namespace/view/:id", async (req, res) => {
    const runId = Number(req.params.id);

    if (!Number.isInteger(runId)) {
        return res.status(400).json({ error: "Invalid run_experiments id" });
    }

    const session = driver.session({
        database: process.env.NEO4J_DATABASE,
    });

    try {
        const result = await session.run(
            `
            MATCH (a:Entity {run_id: $runId})-[r]->(b:Entity {run_id: $runId})
            WHERE a.owner_namespace IS NOT NULL AND b.owner_namespace IS NOT NULL
              AND a.owner_namespace <> b.owner_namespace
            RETURN a.owner_namespace AS srcNs,
                   b.owner_namespace AS dstNs,
                   r.type AS relType,
                   count(*) AS cnt
            `,
            { runId }
        );

        // συλλογή μοναδικών namespaces
        const namespacesSet = new Set();
        const edgeMap = new Map();

        for (const record of result.records) {
            const srcNs = record.get("srcNs");
            const dstNs = record.get("dstNs");
            const relType = record.get("relType");
            const cnt = record.get("cnt").toNumber();

            namespacesSet.add(srcNs);
            namespacesSet.add(dstNs);

            const key = `${srcNs}→${dstNs}`;
            if (!edgeMap.has(key)) {
                edgeMap.set(key, { source: srcNs, target: dstNs, types: {}, total: 0 });
            }
            const entry = edgeMap.get(key);
            entry.types[relType] = (entry.types[relType] || 0) + cnt;
            entry.total += cnt;
        }

        return res.json({
            ok: true,
            runId,
            nodes: [...namespacesSet].map((ns) => ({ id: ns, name: ns })),
            edges: [...edgeMap.values()],
        });

    } catch (err) {
        console.error("Neo4j namespaces error:", err);
        return res.status(500).json({ ok: false, error: err.message });
    } finally {
        await session.close();
    }
});

module.exports = router;