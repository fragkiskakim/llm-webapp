// server/routes/analyze_architecture.js

// ─── Martin metrics ───────────────────────────────────────────────────────────
// Για κάθε namespace υπολογίζει:
//   Ca  = afferent couplings  (πόσα άλλα namespaces εξαρτώνται ΑΠΟ αυτό)
//   Ce  = efferent couplings  (πόσα άλλα namespaces εξαρτάται αυτό)
//   I   = Instability = Ce / (Ca + Ce)
//   A   = Abstractness = abstract_classes / total_classes
//   D   = |A + I - 1|  (Distance from Main Sequence)

function computeMartinMetrics(graphJson) {
    const { nodes, edges } = graphJson;

    // namespace -> set of classes
    const nsClasses = {};
    for (const node of nodes) {
        const ns = node.owner_namespace;
        if (!ns) continue;
        if (!nsClasses[ns]) nsClasses[ns] = { total: 0, abstract: 0 };
        nsClasses[ns].total++;
        if (node.is_abstract) nsClasses[ns].abstract++;
    }

    // namespace -> Ca, Ce
    const Ca = {}, Ce = {};
    for (const ns of Object.keys(nsClasses)) { Ca[ns] = 0; Ce[ns] = 0; }

    for (const edge of edges) {
        const srcNode = nodes.find(n => n.id === edge.source || n.id === edge.src);
        const dstNode = nodes.find(n => n.id === edge.target || n.id === edge.dst);
        if (!srcNode || !dstNode) continue;
        const srcNs = srcNode.owner_namespace;
        const dstNs = dstNode.owner_namespace;
        if (!srcNs || !dstNs || srcNs === dstNs) continue;
        Ce[srcNs] = (Ce[srcNs] || 0) + 1;
        Ca[dstNs] = (Ca[dstNs] || 0) + 1;
    }

    const metrics = {};
    for (const ns of Object.keys(nsClasses)) {
        const ca = Ca[ns] || 0;
        const ce = Ce[ns] || 0;
        const total = nsClasses[ns].total;
        const abstract = nsClasses[ns].abstract;
        const I = (ca + ce) === 0 ? 0 : ce / (ca + ce);
        const A = total === 0 ? 0 : abstract / total;
        const D = Math.abs(A + I - 1);
        metrics[ns] = {
            ca, ce,
            instability: +I.toFixed(3),
            abstractness: +A.toFixed(3),
            distance: +D.toFixed(3),
            total_classes: total,
            abstract_classes: abstract,
        };
    }
    return metrics;
}

// ─── Cohesion (LCOM approximation) ───────────────────────────────────────────
// Χρησιμοποιούμε τον αριθμό εσωτερικών συνδέσεων μέσα στο namespace
// vs τον μέγιστο δυνατό αριθμό συνδέσεων
// cohesion = internal_edges / max_possible_edges
// όπου max = n*(n-1) για directed graph

function computeCohesion(graphJson) {
    const { nodes, edges } = graphJson;

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
        const maxEdges = n * (n - 1);
        if (maxEdges === 0) { cohesion[ns] = 1; continue; }

        const internalEdges = edges.filter(e => {
            const src = e.source || e.src;
            const dst = e.target || e.dst;
            return members.has(src) && members.has(dst);
        }).length;

        cohesion[ns] = +(internalEdges / maxEdges).toFixed(3);
    }
    return cohesion;
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
        if (!allowed.has(edge)) {
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge} (επιτρέπεται μόνο Presentation→Business, Business→Data)`);
        }
    }
    if (!nsEdges.has("Presentation→Business")) warnings.push("⚠️ Λείπει η εξάρτηση Presentation→Business");
    if (!nsEdges.has("Business→Data")) warnings.push("⚠️ Λείπει η εξάρτηση Business→Data");
    return warnings;
}

function checkClientServer(nsEdges) {
    const warnings = [];
    const allowed = new Set(["Client→Server", "Server→Database"]);
    for (const edge of nsEdges) {
        if (!allowed.has(edge)) {
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge} (επιτρέπεται μόνο Client→Server, Server→Database)`);
        }
    }
    if (!nsEdges.has("Client→Server")) warnings.push("⚠️ Λείπει η εξάρτηση Client→Server");
    if (!nsEdges.has("Server→Database")) warnings.push("⚠️ Λείπει η εξάρτηση Server→Database");
    return warnings;
}

function checkMVC(nsEdges) {
    const warnings = [];
    const required = new Set(["View→Controller", "Controller→Model"]);
    const optional = new Set(["View→Model"]);
    for (const edge of nsEdges) {
        if (!required.has(edge) && !optional.has(edge)) {
            warnings.push(`❌ Παράνομη εξάρτηση: ${edge}`);
        }
        if (optional.has(edge)) {
            warnings.push(`⚠️ Προαιρετική εξάρτηση ${edge} — ελέγξτε αν είναι σκόπιμη`);
        }
    }
    for (const req of required) {
        if (!nsEdges.has(req)) warnings.push(`❌ Λείπει η απαιτούμενη εξάρτηση: ${req}`);
    }
    return warnings;
}

function checkMicroservices(nsEdges, graphJson) {
    const warnings = [];
    // Βασικός κανόνας: κάθε service έχει το δικό του namespace
    // Απαγορεύεται direct cross-service database access
    // Ανιχνεύουμε αν κάποιο namespace (εκτός Database) έχει άμεση εξάρτηση σε Database namespace
    const { nodes } = graphJson;
    const namespaces = [...new Set(nodes.map(n => n.owner_namespace).filter(Boolean))];
    const dbNamespaces = namespaces.filter(ns => ns.toLowerCase().includes("database") || ns.toLowerCase().includes("data"));

    for (const edge of nsEdges) {
        const [src, dst] = edge.split("→");
        for (const dbNs of dbNamespaces) {
            if (dst === dbNs && src !== dbNs) {
                warnings.push(`⚠️ Direct database access από ${src}→${dst} — εξετάστε αν παραβιάζει τα όρια του service`);
            }
        }
    }
    return warnings;
}

// ─── Main export ──────────────────────────────────────────────────────────────

function analyzeArchitecture(graphJson, architecture) {
    const martinMetrics = computeMartinMetrics(graphJson);
    const cohesion = computeCohesion(graphJson);
    const nsEdges = getNamespaceEdges(graphJson);

    // Architecture-specific warnings
    let archWarnings = [];
    if (architecture === "3tier") archWarnings = check3Tier(nsEdges);
    else if (architecture === "client-server") archWarnings = checkClientServer(nsEdges);
    else if (architecture === "mvc") archWarnings = checkMVC(nsEdges);
    else if (architecture === "microservices") archWarnings = checkMicroservices(nsEdges, graphJson);

    // Martin metric warnings
    const martinWarnings = [];
    for (const [ns, m] of Object.entries(martinMetrics)) {
        if (m.distance > 0.3) {
            martinWarnings.push(`⚠️ ${ns}: απόσταση από Main Sequence D=${m.distance} (>0.3) — εξετάστε ισορροπία abstractness/instability`);
        }
    }

    // Cohesion warnings
    const cohesionWarnings = [];
    for (const [ns, c] of Object.entries(cohesion)) {
        if (c < 0.3) {
            cohesionWarnings.push(`⚠️ ${ns}: χαμηλό cohesion (${c}) — οι κλάσεις του namespace είναι χαλαρά συνδεδεμένες`);
        }
    }

    return {
        architecture,
        martin_metrics: martinMetrics,
        cohesion,
        warnings: {
            architecture: archWarnings,
            martin: martinWarnings,
            cohesion: cohesionWarnings,
        },
        summary: {
            total_warnings: archWarnings.length + martinWarnings.length + cohesionWarnings.length,
            arch_violations: archWarnings.filter(w => w.startsWith("❌")).length,
        }
    };
}

module.exports = { analyzeArchitecture };