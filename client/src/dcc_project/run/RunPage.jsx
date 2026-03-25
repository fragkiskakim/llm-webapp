import DccTabs from "../../DccTabs.jsx";
import ResultContainer from "./ResultContainer.jsx";
import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function RunPage() {

  const [architecture, setArchitecture] = useState("");
  const [model, setModel] = useState("");
  const [promptType, setPromptType] = useState("");
  const [warning, setWarning] = useState("");

  const [result, setResult] = useState(null);

  async function runExperiment(architecture, model, promptType) {

    try {

      const r = await fetch(`${API}/api/run-experiment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          architecture,
          model,
          promptType
        })
      });

      const data = await r.json();

      if (!r.ok) throw new Error(data?.error || "Run failed");

      const analyze = await fetch(`${API}/api/analyze/${data.id}`, {
        method: "POST"
      });

      const analyzeData = await analyze.json();
      if (!analyze.ok) throw new Error(analyzeData?.error || "Analyze failed");

      // 3️⃣ combine results
      const result = {
        ...data,
        metrics: analyzeData.metrics,
        plantuml_produced: analyzeData.plantuml
      };

      setResult(result);

      console.log("Experiment result:", result);

    } catch (e) {
      setWarning(e.message);
    }
  }

  function handleRun() {
    if (!architecture || !model || !promptType) {
      setWarning("Please select all filters before running.");
      return;
    }

    setWarning("");
    runExperiment(architecture, model, promptType);
  }

  const cardStyle = {
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: 20,
    marginTop: 30,
    background: "#fff"
  };

  const selectStyle = {
    padding: "8px 10px",
    border: "1px solid #ccc",
    borderRadius: 6,
    minWidth: 160
  };

  const buttonStyle = {
    padding: "8px 16px",
    background: "#333",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  };

  return (
    <div>

      <DccTabs />

      {/* Filters */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>

        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >

          <select
            style={selectStyle}
            value={architecture}
            onChange={(e) => setArchitecture(e.target.value)}
          >
            <option value="" disabled>
              Architecture
            </option>
            <option value="mvc">MVC</option>
            <option value="3tier">3-Tier</option>
            <option value="microservices">Microservices</option>
            <option value="client-server">Client Server</option>
          </select>

          <select
            style={selectStyle}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="" disabled>LLM Model</option>
            <option value="gpt4">GPT-4</option>
            <option value="claude">Claude</option>
            <option value="grok">Grok</option>
          </select>

          <select
            style={selectStyle}
            value={promptType}
            onChange={(e) => setPromptType(e.target.value)}
          >
            <option value="" disabled>Prompt Type</option>
            <option value="frnfr">FR-NFR</option>
            <option value="srs">SRS</option>
          </select>

          <button style={buttonStyle} onClick={handleRun}>
            Run
          </button>

        </div>

        {warning && (
          <div style={{ color: "red", marginTop: 10 }}>
            {warning}
          </div>
        )}

      </div>

      {/* Result */}
      <ResultContainer result={result} />

    </div>
  );
}