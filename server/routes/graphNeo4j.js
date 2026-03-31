const express = require("express");
const driver = require("../neo4j");
const { pool, initDb } = require("../db");

const router = express.Router();

function sanitizeRelType(type) {
    return String(type || "RELATED_TO")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
}

router.post("/graph/import/:id", async (req, res) => {
    const runId = Number(req.params.id);

    if (!Number.isInteger(runId)) {
        return res.status(400).json({ error: "Invalid run_experiments id" });
    }

    const session = driver.session({
        database: process.env.NEO4J_DATABASE,
    });

    try {
        const pgResult = await pool.query(
            `
      SELECT id, architecture, model, prompt_type, graph_json
      FROM run_experiments
      WHERE id = $1
      `,
            [runId]
        );

        if (pgResult.rows.length === 0) {
            return res.status(404).json({ error: "run_experiments row not found" });
        }

        const row = pgResult.rows[0];
        const graph = row.graph_json;

        if (
            !graph ||
            !Array.isArray(graph.nodes) ||
            !Array.isArray(graph.edges)
        ) {
            return res.status(400).json({
                error: "graph_json must have the form { nodes: [...], edges: [...] }",
            });
        }

        // Καθάρισε τυχόν προηγούμενο γράφο του ίδιου experiment
        await session.run(
            `
      MATCH (n {run_id: $runId})
      DETACH DELETE n
      `,
            { runId }
        );

        // Προαιρετικά: ένας κεντρικός κόμβος για το experiment
        await session.run(
            `
      MERGE (r:RunExperiment {run_id: $runId})
      SET r.architecture = $architecture,
          r.model = $model,
          r.prompt_type = $promptType,
          r.scope = $scope
      `,
            {
                runId,
                architecture: row.architecture,
                model: row.model,
                promptType: row.prompt_type,
                scope: graph.scope || null,
            }
        );

        // 1. Create namespace nodes (μία φορά για κάθε namespace)
        const namespaces = [...new Set(graph.nodes.map(n => n.owner_namespace).filter(Boolean))];

        for (const ns of namespaces) {
            await session.run(
                `
        MERGE (n:Namespace {name: $name, run_id: $runId})
        `,
                { name: ns, runId }
            );
        }

        // 2. Create class/entity nodes
        for (const node of graph.nodes) {
            await session.run(
                `
        MERGE (n:Entity {id: $id, run_id: $runId})
        SET n.kind = $kind,
            n.owner_namespace = $owner_namespace,
            n.is_abstract = $is_abstract,
            n.is_template = $is_template
        `,
                {
                    id: node.id,
                    runId,
                    kind: node.kind || null,
                    owner_namespace: node.owner_namespace || null,
                    is_abstract: !!node.is_abstract,
                    is_template: !!node.is_template,
                }
            );

            // σύνδεση class -> namespace
            if (node.owner_namespace) {
                await session.run(
                    `
          MATCH (e:Entity {id: $id, run_id: $runId})
          MATCH (ns:Namespace {name: $ns, run_id: $runId})
          MERGE (e)-[:BELONGS_TO]->(ns)
          `,
                    {
                        id: node.id,
                        ns: node.owner_namespace,
                        runId,
                    }
                );
            }

            // σύνδεση experiment -> node
            await session.run(
                `
        MATCH (r:RunExperiment {run_id: $runId})
        MATCH (e:Entity {id: $id, run_id: $runId})
        MERGE (r)-[:CONTAINS]->(e)
        `,
                {
                    runId,
                    id: node.id,
                }
            );
        }

        // 3. Create relationships from edges
        for (const edge of graph.edges) {
            const relType = sanitizeRelType(edge.type);

            await session.run(
                `
        MATCH (a:Entity {id: $src, run_id: $runId})
        MATCH (b:Entity {id: $dst, run_id: $runId})
        MERGE (a)-[r:${relType}]->(b)
        `,
                {
                    src: edge.src,
                    dst: edge.dst,
                    runId,
                }
            );
        }

        return res.json({
            ok: true,
            runId,
            importedNodes: graph.nodes.length,
            importedEdges: graph.edges.length,
            namespaces: namespaces.length,
        });
    } catch (err) {
        console.error("Neo4j import error:", err);
        return res.status(500).json({
            ok: false,
            error: err.message,
        });
    } finally {
        await session.close();
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

module.exports = router;