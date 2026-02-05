import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function snippet(s, n = 120) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function DatabasePage() {
  const [tab, setTab] = useState("prompts"); // "prompts" | "prompt_experiment"

  // prompts
  const [prompts, setPrompts] = useState([]);
  const [promptsLoading, setPromptsLoading] = useState(false);

  // prompt_experiment
  const [parts, setParts] = useState([]); // {name, prompt_part}
  const [partsLoading, setPartsLoading] = useState(false);

  // edits state: name -> edited string
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const dirtyNames = useMemo(() => {
    const dirty = [];
    for (const p of parts) {
      const edited = edits[p.name];
      if (edited !== undefined && edited !== p.prompt_part) dirty.push(p.name);
    }
    return dirty;
  }, [parts, edits]);

  async function loadPrompts() {
    setPromptsLoading(true);
    try {
      const r = await fetch(`${API}/api/prompts`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to load prompts");
      setPrompts(Array.isArray(data) ? data : []);
    } finally {
      setPromptsLoading(false);
    }
  }

  async function loadPromptExperiment() {
    setPartsLoading(true);
    try {
      const r = await fetch(`${API}/api/prompt-experiment`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to load prompt_experiment");
      const rows = Array.isArray(data) ? data : [];
      setParts(rows);

      // reset edits on load
      const nextEdits = {};
      for (const row of rows) nextEdits[row.name] = row.prompt_part;
      setEdits(nextEdits);
    } finally {
      setPartsLoading(false);
    }
  }

  useEffect(() => {
    // initial load (και reload όταν αλλάζει tab)
    if (tab === "prompts") loadPrompts();
    if (tab === "prompt_experiment") loadPromptExperiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function updateEdit(name, value) {
    setEdits((prev) => ({ ...prev, [name]: value }));
  }

  async function saveAllDirty() {
    if (dirtyNames.length === 0) return;

    setSaving(true);
    try {
      for (const name of dirtyNames) {
        const prompt_part = edits[name] ?? "";
        const r = await fetch(`${API}/api/prompt-experiment/${encodeURIComponent(name)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt_part }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Failed to save ${name}`);
      }
      await loadPromptExperiment();
    } catch (e) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Database</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setTab("prompts")} disabled={tab === "prompts"}>
          prompts
        </button>
        <button
          onClick={() => setTab("prompt_experiment")}
          disabled={tab === "prompt_experiment"}
        >
          prompt_experiment
        </button>
      </div>

      {tab === "prompts" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <button onClick={loadPrompts} disabled={promptsLoading}>
              {promptsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Created</th>
                  <th>Prompt</th>
                  <th>CPP</th>
                  <th>UML</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                    <td title={r.prompt || ""}>{snippet(r.prompt)}</td>
                    <td>
                      <button
                        disabled={!r.has_cpp}
                        onClick={() => (window.location.href = `${API}/api/prompts/${r.id}/cpp`)}
                      >
                        Download
                      </button>
                    </td>
                    <td>
                      <button
                        disabled={!r.has_uml}
                        onClick={() => (window.location.href = `${API}/api/prompts/${r.id}/uml`)}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
                {!promptsLoading && prompts.length === 0 && (
                  <tr>
                    <td colSpan="5">No rows</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "prompt_experiment" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <button onClick={loadPromptExperiment} disabled={partsLoading || saving}>
              {partsLoading ? "Loading..." : "Refresh"}
            </button>

            <button onClick={saveAllDirty} disabled={saving || dirtyNames.length === 0}>
              {saving ? "Saving..." : `Save (${dirtyNames.length})`}
            </button>

            <span style={{ opacity: 0.7 }}>
              {dirtyNames.length > 0 ? "Unsaved changes" : "All saved"}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 240 }}>name</th>
                  <th>prompt_part</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((row) => {
                  const current = edits[row.name] ?? "";
                  const isDirty = current !== row.prompt_part;
                  return (
                    <tr key={row.name}>
                      <td style={{ fontFamily: "monospace" }}>{row.name}</td>
                      <td>
                        <textarea
                          value={current}
                          onChange={(e) => updateEdit(row.name, e.target.value)}
                          rows={6}
                          style={{
                            width: "100%",
                            padding: 10,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            border: isDirty ? "2px solid #b45309" : "1px solid #ccc",
                          }}
                        />
                        {isDirty && <div style={{ fontSize: 12, opacity: 0.7 }}>modified</div>}
                      </td>
                    </tr>
                  );
                })}
                {!partsLoading && parts.length === 0 && (
                  <tr>
                    <td colSpan="2">No rows</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
