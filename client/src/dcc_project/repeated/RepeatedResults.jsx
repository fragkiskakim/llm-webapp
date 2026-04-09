import { useEffect, useState } from "react";
import DccTabs from "../../DccTabs.jsx";
import RepeatedTabs from "../../RepeatedTabs.jsx";
import ResultContainer from "../run/ResultContainer.jsx";
import ComparisonModal, { downloadComparisonCSV } from "./ComparisonModal.jsx";

// Στη parent row, δίπλα στο Compare κουμπί:
<td>
  <div style={{ display: "flex", gap: 6 }}>
    <button onClick={(e) => { e.stopPropagation(); setCompareCategory(category); }}>
      Compare
    </button>
    <button onClick={(e) => { e.stopPropagation(); downloadComparisonCSV(category, rows); }}>
      ⬇ CSV
    </button>
  </div>
</td>
import React from "react";



const API = import.meta.env.VITE_API_URL || "http://localhost:3001";



export default function RepeatedResults() {

  const [category, setCategory] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [model, setModel] = useState("");
  const [promptType, setPromptType] = useState("");
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [result, setResult] = useState(null);
  const [openRows, setOpenRows] = useState({});

  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [resultError, setResultError] = useState("");

  const [selectedRow, setSelectedRow] = useState(null);

  const [compareCategory, setCompareCategory] = useState(null);

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

  function toggle(category) {

    setOpenRows(prev => ({
      ...prev,
      [category]: !prev[category]
    }));

  }

  const grouped = results.reduce((acc, r) => {

    if (!acc[r.category]) {
      acc[r.category] = [];
    }

    acc[r.category].push(r);

    return acc;

  }, {});

  useEffect(() => {

    async function loadCategories() {

      const r = await fetch(`${API}/api/categories`);
      const data = await r.json();

      setCategories(data);

    }

    loadCategories();

  }, []);

  function handleMultiSelect(e, setter) {
    const values = Array.from(e.target.selectedOptions, o => o.value);
    setter(values);
  }

  async function handleRowClick(id) {
    try {
      setLoadingResult(true);
      setResultError("");
      setSelectedId(id);

      const r = await fetch(`${API}/api/run-experiments/${id}`);
      const data = await r.json();

      if (!r.ok) {
        throw new Error(data?.error || "Failed to load result");
      }

      console.log("Fetched result:", data);

      setSelectedResult(data);
      setIsPanelOpen(true);
    } catch (e) {
      setResultError(e.message);
    } finally {
      setLoadingResult(false);
    }
  }



  async function fetchResults() {

    const params = new URLSearchParams();

    if (category.length > 0) params.append("category", category.join(","));
    if (architecture) params.append("architecture", architecture);
    if (model) params.append("model", model);
    if (promptType) params.append("promptType", promptType);

    const r = await fetch(`${API}/api/results?${params.toString()}`);
    const data = await r.json();

    setResults(data);
  }

  useEffect(() => {
    fetchResults();
  }, [category, architecture, model, promptType]);

  return (
    <div>

      <DccTabs />
      <RepeatedTabs />

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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">ID</option>

            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>


          <select
            style={selectStyle}
            value={architecture}
            onChange={(e) => setArchitecture(e.target.value)}
          >
            <option value="">Architecture</option>
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
            <option value="">LLM Model</option>
            <option value="gpt4">GPT-4</option>
            <option value="claude">Claude</option>
            <option value="grok">Grok</option>
            <option value="mistral">Mistral</option>
            <option value="gemini">Gemini</option>
          </select>


          <select
            style={selectStyle}
            value={promptType}
            onChange={(e) => setPromptType(e.target.value)}
          >
            <option value="">Prompt type</option>
            <option value="frnfr">FR-NFR</option>
            <option value="srs">SRS</option>
          </select>

        </div>
      </div>

      {/* Results */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Results</h3>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>ID</th>
              <th>Architecture</th>
              <th>LLM Model</th>
              <th>Prompt Type</th>
              <th>Average Score</th>
              <th>Score Variability</th>
              <th>Compare results</th>
            </tr>
          </thead>

          <tbody>
            {Object.entries(grouped).map(([category, rows]) => {
              const first = rows[0];

              return (
                <React.Fragment key={category}>
                  {/* main row */}
                  <tr
                    style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                    onClick={() => toggle(category)}
                  >
                    <td>
                      {openRows[category] ? "▼" : "▶"} {category}
                    </td>

                    <td>{first.architecture}</td>
                    <td>{first.model}</td>
                    <td>{first.prompt_type}</td>
                    <td></td>
                    <td></td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCompareCategory(category); }}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          border: "1px solid #4f46e5",
                          background: "transparent",
                          color: "#4f46e5",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Compare
                      </button>
                      <button onClick={(e) => {
                        e.stopPropagation(); downloadComparisonCSV(category, rows);

                      }}

                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          border: "1px solid #4f46e5",
                          background: "transparent",
                          color: "#4f46e5",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                        ⬇ CSV
                      </button>
                    </td>
                  </tr>

                  {/* children rows */}
                  {openRows[category] &&
                    rows.map((r) => (
                      <tr
                        key={r.id}
                        style={{
                          background: selectedRow === r.id ? "rgba(217, 161, 161, 0.5)" : "#fafafa",
                          cursor: "pointer"
                        }}
                        onClick={() => {
                          setSelectedRow(r.id);
                          handleRowClick(r.id);
                        }}
                      >
                        <td style={{ paddingLeft: 30 }}>
                          {category}_{r.id}
                        </td>

                        <td>{r.architecture}</td>
                        <td>{r.model}</td>
                        <td>{r.prompt_type}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Result */}
      <ResultContainer result={selectedResult} />

      {compareCategory && (
        <ComparisonModal
          category={compareCategory}
          rows={grouped[compareCategory]}
          onClose={() => setCompareCategory(null)}
        />
      )}

    </div>
  );
}