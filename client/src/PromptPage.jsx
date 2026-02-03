import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function PromptPage() {
    const [prompt, setPrompt] = useState("");
    const [output, setOutput] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    async function submit() {
        setErr("");
        setOutput("");
        const p = prompt.trim();
        if (!p) return;

        setLoading(true);
        try {
            const r = await fetch(`${API}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: p }),
            });

            const data = await r.json();
            console.log("API response JSON:", data);

            if (!r.ok) throw new Error(data?.error || "Request failed");
            // Για debug: δείξε όλο το JSON
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

            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                style={{ width: "100%", padding: 12, fontSize: 14 }}
                placeholder="Γράψε prompt εδώ..."
            />

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button onClick={submit} disabled={loading || !prompt.trim()}>
                    {loading ? "Running..." : "Run"}
                </button>
                <button onClick={() => { setPrompt(""); setOutput(""); setErr(""); }} disabled={loading}>
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
