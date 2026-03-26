import { useState } from "react";
import CodePanel from "./CodePanel.jsx";
import AnalysisPanel from "./AnalysisPanel.jsx";
import VisualizationPanel from "./VisualizationPanel.jsx";
import { useControlled } from "@mui/material";

export default function ResultContainer({ result }) {
  const [tab, setTab] = useState("code");

  if (!result) return null;

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 20,
        marginTop: 30,
        background: "#fff"
      }}
    >
      <h3 style={{ marginTop: 0 }}>Result</h3>

      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <button
          onClick={() => setTab("code")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            background: tab === "code" ? "#e3a1a1" : "#eee"
          }}
        >
          Code
        </button>

        <button
          onClick={() => setTab("prompt")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            background: tab === "prompt" ? "#e3a1a1" : "#eee"
          }}
        >
          Prompt
        </button>

        <button
          onClick={() => setTab("viz")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            background: tab === "viz" ? "#e3a1a1" : "#eee"
          }}
        >
          Visualization
        </button>

        <button
          onClick={() => setTab("analysis")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            background: tab === "analysis" ? "#e3a1a1" : "#eee"
          }}
        >
          Analysis
        </button>
        <button
          onClick={() => setTab("graphjson")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            background: tab === "graphjson" ? "#e3a1a1" : "#eee"
          }}
        >
          Graph JSON
        </button>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {tab === "prompt" && <div>{result.prompt}</div>}
        {tab === "code" && <CodePanel code={result.cpp} />}
        {tab === "viz" && <VisualizationPanel uml={result.plantuml_produced} />}
        {tab === "analysis" && <AnalysisPanel analysis={result.analysis} />}
        {tab === "graphjson" && <CodePanel code={JSON.stringify(result.graphjson, null, 2)} />}


      </div>
    </div>
  );
}