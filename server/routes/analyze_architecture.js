// server/routes/analyze_architecture.js

// ─── Cohesion (LCOM approximation) ───────────────────────────────────────────
// cohesion = unique_internal_pairs / max_possible_pairs
// όπου max = n*(n-1)/2 για undirected graph

function computeCohesion(graphJson) {
    const { nodes = [], edges = [] } = graphJson;

    const nsNodes = {};
    for (const node of nodes) {
        const ns = node.owner_namespace;
        if (!ns) continue;
        if (!nsNodes[ns]) nsNodes[ns] = new Set();
        nsNodes[ns].add(node.id);
    }

    const cohesion = {};
    for (const [ns, members] of Object.entries(nsNodes)) {
        const n = members.size;
        if (n < 2) { cohesion[ns] = 0; continue; }

        const maxPossibleConnections = (n * (n - 1)) / 2;
        const uniqueInternalPairs = new Set();

        for (const e of edges) {
            const src = e.source ?? e.src;
            const dst = e.target ?? e.dst;
            if (!src || !dst || src === dst) continue;
            if (!members.has(src) || !members.has(dst)) continue;
            uniqueInternalPairs.add([src, dst].sort().join("::"));
        }

        cohesion[ns] = +(uniqueInternalPairs.size / maxPossibleConnections).toFixed(3);
    }

    return cohesion;
}

// ─── Weighted Coupling ────────────────────────────────────────────────────────
// weighted_ce[A] = total edges leaving A to other namespaces (counts multiplicity)
// weighted_ca[A] = total edges arriving at A from other namespaces (counts multiplicity)
//
// Contrast with Martin's Ca/Ce which count only unique namespace-to-namespace pairs.
// weighted_ce/ca capture coupling *strength*: a namespace with 20 edges to B is more
// tightly coupled than one with 1 edge to B, even though both have Ce = 1.

function computeWeightedCoupling(graphJson) {
    const { nodes = [], edges = [] } = graphJson;

    const nodeNs = {};
    for (const node of nodes) {
        if (node.owner_namespace) nodeNs[node.id] = node.owner_namespace;
    }

    const weightedCe = {};
    const weightedCa = {};

    for (const e of edges) {
        const src = e.source ?? e.src;
        const dst = e.target ?? e.dst;
        if (!src || !dst) continue;
        const srcNs = nodeNs[src];
        const dstNs = nodeNs[dst];
        if (!srcNs || !dstNs || srcNs === dstNs) continue;

        weightedCe[srcNs] = (weightedCe[srcNs] ?? 0) + 1;
        weightedCa[dstNs] = (weightedCa[dstNs] ?? 0) + 1;
    }

    const allNs = new Set([...Object.keys(weightedCe), ...Object.keys(weightedCa)]);
    const result = {};
    for (const ns of allNs) {
        result[ns] = {
            weighted_ce: weightedCe[ns] ?? 0,
            weighted_ca: weightedCa[ns] ?? 0,
        };
    }
    return result;
}

// ─── Architecture-specific warnings ──────────────────────────────────────────

function getNamespaceEdges(graphJson) {
    const { nodes, edges } = graphJson;
    const nsEdges = new Set();
    for (const edge of edges) {
        const srcNode = nodes.find(n => n.id === (edge.source || edge.src));
        const dstNode = nodes.find(n => n.id === (edge.target || edge.dst));
        if (!srcNode || !dstNode) continue;
        const src = srcNode.owner_namespace;
        const dst = dstNode.owner_namespace;
        if (src && dst && src !== dst) nsEdges.add(`${src}→${dst}`);
    }
    return nsEdges;
}

function check3Tier(nsEdges) {
    const warnings = [];
    const allowed = new Set(["Presentation→Business", "Business→Data"]);
    for (const edge of nsEdges) {
        if (!allowed.has(edge))
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge}`);
    }
    if (!nsEdges.has("Presentation→Business"))
        warnings.push(`❌ Λείπει η απαιτούμενη εξάρτηση: Presentation→Business`);
    if (!nsEdges.has("Business→Data"))
        warnings.push(`❌ Λείπει η απαιτούμενη εξάρτηση: Business→Data`);
    return warnings;
}

function checkClientServer(nsEdges) {
    const warnings = [];
    const allowed = new Set(["Client→Server"]);
    for (const edge of nsEdges) {
        if (!allowed.has(edge))
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge}`);
    }
    if (!nsEdges.has("Client→Server"))
        warnings.push(`❌ Λείπει η απαιτούμενη εξάρτηση: Client→Server`);
    return warnings;
}

function checkMVC(nsEdges) {
    const warnings = [];
    const required = new Set(["View→Controller", "Controller→Model"]);
    const optional = new Set(["View→Model"]);
    for (const edge of nsEdges) {
        if (!required.has(edge) && !optional.has(edge))
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge}`);
        if (optional.has(edge))
            warnings.push(`⚠️ Προαιρετική εξάρτηση ${edge}`);
    }
    for (const req of required) {
        if (!nsEdges.has(req))
            warnings.push(`❌ Λείπει η απαιτούμενη εξάρτηση: ${req}`);
    }
    return warnings;
}

function checkMicroservices(nsEdges, graphJson) {
    const warnings = [];
    const { nodes } = graphJson;
    const namespaces = [...new Set(nodes.map(n => n.owner_namespace).filter(Boolean))];
    const dbNamespaces = namespaces.filter(ns =>
        ns.toLowerCase().includes("database") || ns.toLowerCase().includes("data")
    );
    for (const edge of nsEdges) {
        const [src, dst] = edge.split("→");
        for (const dbNs of dbNamespaces) {
            if (dst === dbNs && src !== dbNs)
                warnings.push(`⚠️ Direct database access από ${src}→${dst}`);
        }
    }
    return warnings;
}

// ─── Main export ──────────────────────────────────────────────────────────────

function analyzeArchitecture(graphJson, architecture, cppMetrics) {
    const cohesion = computeCohesion(graphJson);
    const weightedCoupling = computeWeightedCoupling(graphJson);
    const nsEdges = getNamespaceEdges(graphJson);

    // Martin metrics from Python (Ca/Ce = unique namespace pairs)
    const martinMetrics = {};
    if (cppMetrics?.namespaces) {
        for (const ns of cppMetrics.namespaces) {
            martinMetrics[ns.name] = {
                ca: ns.Ca,
                ce: ns.Ce,
                instability: +ns.I.toFixed(3),
                abstractness: +ns.A.toFixed(3),
                distance: +ns.D.toFixed(3),
            };
        }
    }

    // Architecture-specific warnings
    let archWarnings = [];
    if (architecture === "3tier") archWarnings = check3Tier(nsEdges);
    else if (architecture === "client-server") archWarnings = checkClientServer(nsEdges);
    else if (architecture === "mvc") archWarnings = checkMVC(nsEdges);
    else if (architecture === "microservices") archWarnings = checkMicroservices(nsEdges, graphJson);

    // Martin metric warnings
    const martinWarnings = [];
    for (const [ns, m] of Object.entries(martinMetrics)) {
        if (m.distance > 0.3)
            martinWarnings.push(`⚠️ ${ns}: D=${m.distance} (>0.3)`);
    }

    // Cohesion warnings
    const cohesionWarnings = [];
    for (const [ns, c] of Object.entries(cohesion)) {
        if (c < 0.3)
            cohesionWarnings.push(`⚠️ ${ns}: χαμηλό cohesion (${c})`);
    }

    return {
        architecture,
        martin_metrics: martinMetrics,
        cohesion,
        weighted_coupling: weightedCoupling,
        warnings: {
            architecture: archWarnings,
            martin: martinWarnings,
            cohesion: cohesionWarnings,
        },
        summary: {
            total_warnings: archWarnings.length + martinWarnings.length + cohesionWarnings.length,
            arch_violations: archWarnings.filter(w => w.startsWith("❌")).length,
        },
    };
}

module.exports = { analyzeArchitecture };