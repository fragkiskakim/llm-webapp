import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function PromptPage() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [arch, setArch] = useState("");
  const [spec, setSpec] = useState("");
  const [loadedMeta, setLoadedMeta] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const canLoad = Boolean(arch && spec);

  async function loadPromptTemplate() {
    setErr("");
    if (!canLoad) return;

    setLoadingTemplate(true);
    try {
      const r = await fetch(`${API}/api/prompt-template?arch=${encodeURIComponent(arch)}&spec=${encodeURIComponent(spec)}`);
      const data = await r.json();
      console.log("Prompt template JSON:", data);

      if (!r.ok) throw new Error(data?.error || "Failed to load prompt template");
      setPrompt(data.prompt || "");
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoadingTemplate(false);
    }
    setLoadedMeta({
    exp_name: "DCC",
    architecture: arch,
    description_type: spec,
    });

  }

  async function submit() {
  setErr("");
  setOutput("");
  const p = prompt.trim();
  if (!p) return;

  setLoading(true);
  try {
    const body = { prompt: p };

    // Μόνο αν το prompt προήλθε από Load Prompt
    if (loadedMeta) {
      body.exp_name = loadedMeta.exp_name;                 // "DCC"
      body.architecture = loadedMeta.architecture;         // "3tier" | "mvc" | "microservices"
      body.description_type = loadedMeta.description_type; // "srs" | "frnfr"
    }

    const r = await fetch(`${API}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    console.log("API response JSON:", data);

    if (!r.ok) throw new Error(data?.error || "Request failed");
    setOutput(JSON.stringify(data, null, 2));
  } catch (e) {
    setErr(e.message || "Error");
  } finally {
    setLoading(false);
  }
}


  return (
    <div>
      <h2>LLM Prompt Runner</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label>
          Architecture{" "}
          <select value={arch} onChange={(e) => setArch(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="">-- select --</option>
            <option value="3tier">3-tier</option>
            <option value="microservices">Microservices</option>
            <option value="mvc">MVC</option>
          </select>
        </label>

        <label>
          Spec{" "}
          <select value={spec} onChange={(e) => setSpec(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="">-- select --</option>
            <option value="srs">SRS</option>
            <option value="frnfr">FR-NFR</option>
          </select>
        </label>

        <button onClick={loadPromptTemplate} disabled={!canLoad || loadingTemplate}>
          {loadingTemplate ? "Loading..." : "Load Prompt"}
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={10}
        style={{ width: "100%", padding: 12, fontSize: 14 }}
        placeholder="Γράψε prompt εδώ ή πάτα Load Prompt..."
      />

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button onClick={submit} disabled={loading || !prompt.trim()}>
          {loading ? "Running..." : "Run"}
        </button>
        <button
          onClick={() => {
            setPrompt("");
            setOutput("");
            setErr("");
            setLoadedMeta(null);
          }}
          disabled={loading}
        >
          Clear
        </button>
      </div>

      {err && <p style={{ color: "crimson", marginTop: 12 }}>{err}</p>}

      {output && (
        <div style={{ marginTop: 20 }}>
          <h3>Response (debug JSON)</h3>
          <pre style={{ whiteSpace: "pre-wrap", padding: 12, background: "#f6f6f6" }}>
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
