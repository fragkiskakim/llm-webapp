import { useState } from "react";
import { encode } from "plantuml-encoder";

export default function VisualizationPanel({ uml }) {
  const [showCode, setShowCode] = useState(false);

  if (!uml) return <div>No diagram available</div>;

  const encoded = encode(uml);
  const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;

  const downloadPuml = () => {
    const blob = new Blob([uml], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagram.puml";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadSvg = async () => {
    const res = await fetch(url);
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Κουμπιά */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowCode(v => !v)}>
          {showCode ? "Hide Code" : "Show Code"}
        </button>
        <button onClick={downloadPuml}>⬇ Download .puml</button>
        <button onClick={downloadSvg}>⬇ Download .svg</button>
      </div>

      {/* Διάγραμμα + κώδικας */}
      <div style={{ display: "flex", gap: 10 }}>
        <div
          style={{
            flex: 1,
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 10,
            background: "#fafafa",
            overflow: "auto",
            maxHeight: 400,
            display: "flex",
            justifyContent: "center"
          }}
        >
          <img src={url} alt="PlantUML Diagram" style={{ maxWidth: "100%" }} />
        </div>

        {showCode && (
          <div
            style={{
              flex: 1,
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: 10,
              background: "#1e1e1e",
              overflow: "auto",
              maxHeight: 400,
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