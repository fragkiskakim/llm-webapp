
function sanitizeRelType(type) {
    return String(type || "RELATED_TO")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
}


async function importGraphForRun(runId, { pool, driver }) {
    const pgResult = await pool.query(
        `SELECT id, architecture, model, prompt_type, graph_json
         FROM run_experiments WHERE id = $1`,
        [runId]
    );

    console.log(pgResult.rows[0]);

    if (pgResult.rows.length === 0) throw new Error("run_experiments row not found");

    const row = pgResult.rows[0];
    const graph = row.graph_json;

    console.log(`Importing graph for runId ${runId}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new Error("graph_json must have the form { nodes: [...], edges: [...] }");
    }

    const session = driver.session({ database: process.env.NEO4J_DATABASE });

    try {
        await session.run(`MATCH (n {run_id: $runId}) DETACH DELETE n`, { runId });

        await session.run(
            `MERGE (r:RunExperiment {run_id: $runId})
             SET r.architecture = $architecture, r.model = $model,
                 r.prompt_type = $promptType, r.scope = $scope`,
            { runId, architecture: row.architecture, model: row.model, promptType: row.prompt_type, scope: graph.scope || null }
        );

        const namespaces = [...new Set(graph.nodes.map(n => n.owner_namespace).filter(Boolean))];

        for (const ns of namespaces) {
            await session.run(`MERGE (n:Namespace {name: $name, run_id: $runId})`, { name: ns, runId });
        }

        for (const node of graph.nodes) {
            await session.run(
                `MERGE (n:Entity {id: $id, run_id: $runId})
                 SET n.kind = $kind, n.owner_namespace = $owner_namespace,
                     n.is_abstract = $is_abstract, n.is_template = $is_template`,
                { id: node.id, runId, kind: node.kind || null, owner_namespace: node.owner_namespace || null, is_abstract: !!node.is_abstract, is_template: !!node.is_template }
            );

            if (node.owner_namespace) {
                await session.run(
                    `MATCH (e:Entity {id: $id, run_id: $runId})
                     MATCH (ns:Namespace {name: $ns, run_id: $runId})
                     MERGE (e)-[:BELONGS_TO]->(ns)`,
                    { id: node.id, ns: node.owner_namespace, runId }
                );
            }

            await session.run(
                `MATCH (r:RunExperiment {run_id: $runId})
                 MATCH (e:Entity {id: $id, run_id: $runId})
                 MERGE (r)-[:CONTAINS]->(e)`,
                { runId, id: node.id }
            );
        }

        for (const edge of graph.edges) {
            const relType = sanitizeRelType(edge.type);
            await session.run(
                `MATCH (a:Entity {id: $src, run_id: $runId})
                 MATCH (b:Entity {id: $dst, run_id: $runId})
                 MERGE (a)-[r:${relType}]->(b)`,
                { src: edge.src, dst: edge.dst, runId }
            );
        }

        return { importedNodes: graph.nodes.length, importedEdges: graph.edges.length, namespaces: namespaces.length };
    } finally {
        await session.close();
    }
}

module.exports = { importGraphForRun };