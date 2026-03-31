import { useEffect, useState, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const NAMESPACE_COLORS = {
    Presentation: "#6FA8DC",
    Business: "#93C47D",
    Data: "#F6B26B",
};

export default function GraphViewer({ runId }) {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
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
                const res = await fetch(`${API}/api/graph/view/${runId}`);
                if (!res.ok) throw new Error((await res.text()) || "Failed to load graph");
                const data = await res.json();
                if (!cancelled) {
                    setGraphData({
                        nodes: (data.nodes || []).map((n) => ({
                            id: n.id,
                            name: n.id.split("::").pop(),
                            namespace: n.owner_namespace || "",
                            color: NAMESPACE_COLORS[n.owner_namespace] || "#D9D9D9",
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
        <div ref={containerRef} style={{ width: "100%", height: "700px", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
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
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.fillStyle = node.color;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = "#333";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, node.x, node.y + 12);
                }}
                width={containerRef.current?.clientWidth || 800}
                height={700}
            />
        </div>
    );
}