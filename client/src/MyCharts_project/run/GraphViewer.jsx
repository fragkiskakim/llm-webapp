import { useEffect, useState, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";

import * as d3 from "d3-force";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const PALETTE = [
    "#6FA8DC", "#93C47D", "#F6B26B", "#C27BA0",
    "#76A5AF", "#E06666", "#FFD966", "#8E7CC3",
    "#6AA84F", "#E69138",
];

function buildColorMap(nodes) {
    const namespaces = [...new Set(nodes.map((n) => n.owner_namespace).filter(Boolean))];
    return Object.fromEntries(namespaces.map((ns, i) => [ns, PALETTE[i % PALETTE.length]]));
}

function buildNamespaceCenters(colorMap, width = 1200, height = 700) {
    const namespaces = Object.keys(colorMap);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.28;

    const centers = {};

    namespaces.forEach((ns, i) => {
        const angle = (2 * Math.PI * i) / namespaces.length;
        centers[ns] = {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        };
    });

    return centers;
}

export default function GraphViewer({ runId }) {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [colorMap, setColorMap] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);

    const fgRef = useRef();

    useEffect(() => {
        if (!fgRef.current || !graphData.nodes.length) return;

        const width = containerRef.current?.clientWidth || 1200;
        const height = 700;
        const centers = buildNamespaceCenters(colorMap, width, height);

        const fg = fgRef.current;
        const chargeStrength = -220;
        const linkDistance = 120;

        fg.d3Force("charge", d3.forceManyBody().strength(chargeStrength));
        fg.d3Force("link").distance(linkDistance);
        fg.d3Force("center", d3.forceCenter(width / 2, height / 2));

        fg.d3Force(
            "collision",
            d3.forceCollide(28)
        );

        fg.d3Force(
            "x",
            d3.forceX((node) => centers[node.namespace]?.x ?? width / 2).strength(0.18)
        );

        fg.d3Force(
            "y",
            d3.forceY((node) => centers[node.namespace]?.y ?? height / 2).strength(0.18)
        );

        fg.d3ReheatSimulation();

        setTimeout(() => {
            fg.zoomToFit(700, 80);
        }, 800);
    }, [graphData, colorMap]);

    useEffect(() => {
        if (!runId) return;
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError("");
                const res = await fetch(`${API}/api/graph/view/${runId}`);
                if (!res.ok) throw new Error((await res.text()) || "Failed to load graph");
                const data = await res.json();
                if (!cancelled) {
                    const nodes = data.nodes || [];
                    const map = buildColorMap(nodes);
                    setColorMap(map);
                    setGraphData({
                        nodes: nodes.map((n) => ({
                            id: n.id,
                            name: n.id.split("::").pop(),
                            namespace: n.owner_namespace || "",
                            color: map[n.owner_namespace] || "#D9D9D9",
                        })),
                        links: (data.edges || []).map((e) => ({
                            source: e.source,
                            target: e.target,
                            type: e.type,
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
                    ref={fgRef}
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