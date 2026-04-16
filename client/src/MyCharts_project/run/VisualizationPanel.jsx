import { useState } from "react";
import { encode } from "plantuml-encoder";

const btnBase = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  transition: "background 0.15s, opacity 0.15s",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnPrimary = {
  ...btnBase,
  background: "#4f46e5",
  color: "#fff",
};

const btnSecondary = {
  ...btnBase,
  background: "#f0f0f0",
  color: "#333",
  border: "1px solid #ddd",
};

export default function VisualizationPanel({ uml , filename = "diagram"  }) {
  const [showCode, setShowCode] = useState(false);

  if (!uml) return <div>No diagram available</div>;

  const encoded = encode(uml);
  const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;

  const downloadPuml = () => {
    const blob = new Blob([uml], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.puml`;  // ← αλλαγή
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadSvg = async () => {
    const res = await fetch(url);
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.svg`;  // ← αλλαγή
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={showCode ? btnPrimary : btnSecondary}
          onClick={() => setShowCode(v => !v)}
        >
          {showCode ? "⬅ Hide Code" : "🔍 Show Code"}
        </button>
        <button style={btnSecondary} onClick={downloadPuml}>
          ⬇ Download .puml
        </button>
        <button style={btnSecondary} onClick={downloadSvg}>
          ⬇ Download .svg
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div
          style={{
            flex: 1,
            border: "1px solid #e2e2e2",
            borderRadius: 10,
            padding: 12,
            background: "#fafafa",
            overflow: "auto",
            maxHeight: 400,
            display: "flex",
            justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <img src={url} alt="PlantUML Diagram" style={{ maxWidth: "100%" }} />
        </div>

        {showCode && (
          <div
            style={{
              flex: 1,
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
              background: "#1e1e1e",
              overflow: "auto",
              maxHeight: 400,
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }}
          >
            <pre style={{ margin: 0, color: "#d4d4d4", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {uml}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}