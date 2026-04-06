import { useEffect, useState, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const PALETTE = [
    "#6FA8DC", "#93C47D", "#F6B26B", "#C27BA0",
    "#76A5AF", "#E06666", "#FFD966", "#8E7CC3",
    "#6AA84F", "#E69138",
];

function buildNamespaceColorMap(nodes) {
    return Object.fromEntries(nodes.map((n, i) => [n.id, PALETTE[i % PALETTE.length]]));
}

export default function GraphViewer({ runId }) {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [colorMap, setColorMap] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!runId) return;
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError("");
                const res = await fetch(`${API}/api/graph/namespace/view/${runId}`);
                if (!res.ok) throw new Error((await res.text()) || "Failed to load graph");
                const data = await res.json();
                if (!cancelled) {
                    const nodes = data.nodes || [];
                    const map = buildNamespaceColorMap(nodes);  // 👈 αλλαγή
                    setColorMap(map);
                    setGraphData({
                        nodes: nodes.map((n) => ({
                            id: n.id,
                            name: n.id,           // το namespace είναι ήδη το όνομα
                            namespace: n.id,      // 👈 βάλε το id ως namespace
                            color: map[n.id] || "#D9D9D9",
                        })),
                        links: (data.edges || []).map((e) => ({
                            source: e.source,
                            target: e.target,
                            type: e.type,
                            count: e.total || 1,
                        })),
                    });
                }
            } catch (err) {
                if (!cancelled) setError(err.message || "Unknown error");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [runId]);

    if (error) return <div>Σφάλμα: {error}</div>;
    if (loading) return <div>Φόρτωση γράφου...</div>;
    if (!graphData.nodes.length) return <div>Δεν υπάρχουν δεδομένα.</div>;

    return (
        <div style={{ width: "100%", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, padding: "8px 16px", borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
                {Object.entries(colorMap).map(([ns, color]) => (
                    <div key={ns} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
                        <span>{ns}</span>
                    </div>
                ))}
            </div>

            <div ref={containerRef} style={{ height: 700 }}>
                <ForceGraph2D
                    graphData={graphData}
                    nodeLabel="name"
                    nodeColor={(n) => n.color}
                    nodeRelSize={6}
                    linkLabel="type"
                    linkDirectionalArrowLength={6}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0.1}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.name;
                        const fontSize = Math.max(12 / globalScale, 3);
                        const radius = 6;

                        // χρώμα από το colorMap απευθείας
                        const color = colorMap[node.namespace] || "#D9D9D9";

                        // κύκλος
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();

                        // label
                        ctx.font = `${fontSize}px Sans-Serif`;
                        ctx.fillStyle = "#333";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(label, node.x, node.y + radius + fontSize);
                    }}
                    nodePointerAreaPaint={(node, color, ctx) => {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();
                    }}
                    width={containerRef.current?.clientWidth || 800}
                    height={700}
                />
            </div>
        </div>
    );
}