import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function snippet(s, n = 120) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function HistoryPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    async function load() {
        setErr("");
        setLoading(true);
        try {
            const r = await fetch(`${API}/api/prompts`);
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || "Failed to load");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(e.message || "Error");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    return (
        <div>
            <h2>History</h2>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <button onClick={load} disabled={loading}>
                    {loading ? "Loading..." : "Refresh"}
                </button>
            </div>

            {err && <p style={{ color: "crimson" }}>{err}</p>}

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
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td>{r.id}</td>
                                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                                <td title={r.prompt || ""}>{snippet(r.prompt)}</td>
                                <td>
                                    <button
                                        disabled={!r.has_cpp}
                                        onClick={() => { window.location.href = `${API}/api/prompts/${r.id}/cpp`; }}
                                    >
                                        Download
                                    </button>
                                </td>
                                <td>
                                    <button
                                        disabled={!r.has_uml}
                                        onClick={() => { window.location.href = `${API}/api/prompts/${r.id}/uml`; }}
                                    >
                                        Download
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {(!loading && rows.length === 0) && (
                            <tr><td colSpan="5">No results</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
