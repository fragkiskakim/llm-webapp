import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MODELS = ["gpt4", "claude", "gemini", "grok", "mistral", "qwen", "deepseek"];
const MODEL_COLORS = {
    gpt4: "#6c8cff", claude: "#ff9f6b", gemini: "#52d9a4",
    grok: "#ff6b8a", mistral: "#b48aff", qwen: "#ffd166", deepseek: "#60c8e8"
};
const ARCH_CONFIG = {
    "3tier": { namespaces: ["Business", "Data", "Presentation"], apiKey: "3tier", label: "3-Tier" },
    "mvc": { namespaces: ["Model", "View", "Controller"], apiKey: "mvc", label: "MVC" },
    "client-server": { namespaces: ["Client", "Server"], apiKey: "client-server", label: "Client-Server" },
    "microservices": { namespaces: null, apiKey: "microservices", label: "Microservices" },
};

function avg(arr) {
    const nums = arr.map(Number).filter(n => !isNaN(n) && n !== "");
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function groupBy(arr, key) {
    return arr.reduce((m, r) => { const k = r[key]; if (!m[k]) m[k] = []; m[k].push(r); return m; }, {});
}
function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    return lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
}
function getViolCol(row) { return Number(row["Arch Violations"] ?? 0); }
function getCohesion(row, arch) {
    if (arch === "microservices") return Number(row["Avg Cohesion"] || 0);
    const cfg = ARCH_CONFIG[arch];
    if (!cfg?.namespaces) return 0;
    return avg(cfg.namespaces.map(ns => Number(row[`${ns} Cohesion`] || 0)));
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BarChart({ title, models, valFn, maxVal = 1 }) {
    const vals = models.map(m => ({ m, v: valFn(m) }));
    const max = Math.max(...vals.map(x => x.v || 0), 0.001) * 1.1;
    return (
        <div style={styles.chartCard}>
            <div style={styles.chartTitle}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {vals.map(({ m, v }) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={styles.barLabel}>{m}</span>
                        <div style={styles.barTrack}>
                            <div style={{
                                ...styles.barFill,
                                width: `${Math.min(((v || 0) / max) * 100, 100)}%`,
                                background: MODEL_COLORS[m]
                            }} />
                        </div>
                        <span style={styles.barValue}>{v != null ? v.toFixed(2) : "—"}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function InstabilityHeatmap({ byModel, namespaces }) {
    const models = MODELS.filter(m => byModel[m]);
    return (
        <div style={styles.chartCard}>
            <div style={styles.chartTitle}>Instability (I) per Namespace</div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={{ padding: "6px 12px", color: "var(--text3)", textAlign: "right" }}></th>
                            {namespaces.map(ns => (
                                <th key={ns} style={{ padding: "6px 12px", color: "#8b93b8", fontFamily: "JetBrains Mono,monospace", fontWeight: 500 }}>{ns}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(m => (
                            <tr key={m}>
                                <td style={{ padding: "6px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#8b93b8", textAlign: "right" }}>{m}</td>
                                {namespaces.map(ns => {
                                    const v = avg((byModel[m] || []).map(r => Number(r[`${ns} I`] || 0)));
                                    const pct = v ?? 0;
                                    const bg = `hsl(${(1 - pct) * 120},60%,${20 + pct * 20}%)`;
                                    return (
                                        <td key={ns} style={{
                                            padding: "8px 12px",
                                            textAlign: "center",
                                            background: bg,
                                            color: pct > 0.5 ? "#fff" : "#ccc",
                                            fontFamily: "JetBrains Mono,monospace",
                                            border: "1px solid #2d3148",
                                            fontSize: 11
                                        }}>
                                            {v != null ? v.toFixed(2) : "—"}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                Expected: Data → low (green) | Business → medium | Presentation → high (red)
            </div>
        </div>
    );
}

function TempChart({ rows, arch }) {
    const temps = [0, 0.2, 0.5];
    const models = MODELS.filter(m => rows.some(r => r["LLM model"] === m));
    const byModelTemp = {};
    models.forEach(m => {
        byModelTemp[m] = temps.map(t => {
            const sub = rows.filter(r => r["LLM model"] === m && Math.abs(Number(r["Temperature"]) - t) < 0.01);
            return sub.length ? avg(sub.map(r => getViolCol(r))) : null;
        });
    });
    const allV = Object.values(byModelTemp).flat().filter(v => v != null);
    const maxV = Math.max(...allV, 0.001);
    const W = 420, H = 160, PL = 40, PR = 20, PT = 10, PB = 30;
    const cW = W - PL - PR, cH = H - PT - PB;
    const xS = i => PL + (i / (temps.length - 1)) * cW;
    const yS = v => PT + cH - (v / maxV) * cH;
    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={styles.chartTitle}>Arch Violations vs Temperature</div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", overflow: "visible" }}>
                {models.map(m => {
                    const pts = byModelTemp[m];
                    const valid = pts.map((v, i) => v != null ? { x: xS(i), y: yS(v) } : null).filter(Boolean);
                    if (!valid.length) return null;
                    const d = valid.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                    return (
                        <g key={m}>
                            <path d={d} fill="none" stroke={MODEL_COLORS[m]} strokeWidth={1.8} opacity={0.85} />
                            {valid.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={MODEL_COLORS[m]} opacity={0.9} />)}
                        </g>
                    );
                })}
                {temps.map((t, i) => (
                    <text key={t} x={xS(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#5a6285" fontFamily="JetBrains Mono,monospace">{t}</text>
                ))}
            </svg>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
                {models.map(m => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8b93b8" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: MODEL_COLORS[m] }} />
                        {m}
                    </div>
                ))}
            </div>
        </div>
    );
}

function PromptCompare({ rows }) {
    const models = MODELS.filter(m => rows.some(r => r["LLM model"] === m));
    const bySrs = groupBy(rows.filter(r => r["Prompt type"] === "srs"), "LLM model");
    const byFrnfr = groupBy(rows.filter(r => r["Prompt type"] === "frnfr"), "LLM model");
    const maxV = Math.max(
        ...models.map(m => avg((bySrs[m] || []).map(r => getViolCol(r))) || 0),
        ...models.map(m => avg((byFrnfr[m] || []).map(r => getViolCol(r))) || 0),
        0.001
    ) * 1.1;
    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={styles.chartTitle}>Arch Violations: SRS vs FR-NFR per Model</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
                {models.map(m => {
                    const sv = avg((bySrs[m] || []).map(r => getViolCol(r)));
                    const fv = avg((byFrnfr[m] || []).map(r => getViolCol(r)));
                    return (
                        <div key={m}>
                            <div style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#8b93b8", marginBottom: 6 }}>{m}</div>
                            {[{ label: "SRS", val: sv, color: "#6c8cff" }, { label: "FR-NFR", val: fv, color: "#ff6b8a" }].map(({ label, val, color }) => (
                                <div key={label} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                    <span style={{ width: 45, fontSize: 10, color, fontFamily: "JetBrains Mono,monospace" }}>{label}</span>
                                    <div style={{ flex: 1, height: 14, background: "#232736", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ width: `${val != null ? Math.min((val / maxV) * 100, 100) : 0}%`, height: "100%", background: color, opacity: 0.85, borderRadius: 3, transition: "width 0.6s" }} />
                                    </div>
                                    <span style={{ width: 32, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>{val != null ? val.toFixed(1) : "—"}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ResultsPage() {
    const [currentArch, setCurrentArch] = useState("3tier");
    const [experiment, setExperiment] = useState("DCC");
    const [temperature, setTemperature] = useState("all");
    const [promptType, setPromptType] = useState("all");
    const [rawData, setRawData] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadAll() {
            setLoading(true);
            const result = {};
            for (const key of Object.keys(ARCH_CONFIG)) {
                try {
                    const res = await fetch(`${API}/api/export-csv?architecture=${ARCH_CONFIG[key].apiKey}`);
                    if (res.ok) result[key] = parseCSV(await res.text());
                } catch { }
            }
            setRawData(result);
            setLoading(false);
        }
        loadAll();
    }, []);

    const rows = (rawData[currentArch] || []).filter(r => {
        if (r["Experiment"] !== experiment) return false;
        if (temperature !== "all" && String(r["Temperature"]) !== temperature) return false;
        if (promptType !== "all" && r["Prompt type"] !== promptType) return false;
        return true;
    });

    const cfg = ARCH_CONFIG[currentArch];
    const byModel = groupBy(rows, "LLM model");
    const models = MODELS.filter(m => byModel[m]);

    const allViols = rows.map(r => getViolCol(r));
    const allCoh = rows.map(r => getCohesion(r, currentArch));
    const modelViols = models.map(m => ({ m, v: avg((byModel[m] || []).map(r => getViolCol(r))) })).filter(x => x.v != null);
    const bestModel = [...modelViols].sort((a, b) => a.v - b.v)[0]?.m ?? "—";

    const handleDownload = (type) => {
        const url = `${API}/api/${type === "raw" ? "export-csv" : "export-csv-aggregated"}?architecture=${cfg.apiKey}`;
        window.open(url, "_blank");
    };

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.h1}>LLM Architecture Benchmark <span style={{ color: "#6c8cff" }}> Results</span></h1>
                <span style={styles.badge}>DCC + MyCharts</span>
            </div>

            {/* Architecture Tabs */}
            <div style={styles.tabs}>
                {Object.entries(ARCH_CONFIG).map(([key, { label }]) => (
                    <button key={key}
                        style={{ ...styles.tab, ...(currentArch === key ? styles.tabActive : {}) }}
                        onClick={() => setCurrentArch(key)}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Controls */}
            <div style={styles.controls}>
                {[
                    { label: "Experiment", id: "exp", value: experiment, opts: [["DCC", "DCC"], ["MYCHARTS", "MyCharts"]], set: setExperiment },
                    { label: "Temperature", id: "temp", value: temperature, opts: [["all", "All"], ["0", "0.0"], ["0.2", "0.2"], ["0.5", "0.5"]], set: setTemperature },
                ].map(({ label, id, value, opts, set }) => (
                    <div key={id} style={styles.controlGroup}>
                        <span style={styles.controlLabel}>{label}</span>
                        <select value={value} onChange={e => set(e.target.value)} style={styles.select}>
                            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>
                ))}
                <div style={styles.promptToggle}>
                    {[["all", "All"], ["srs", "SRS"], ["frnfr", "FR-NFR"]].map(([v, l]) => (
                        <button key={v}
                            style={{ ...styles.promptBtn, ...(promptType === v ? styles.promptBtnActive : {}) }}
                            onClick={() => setPromptType(v)}>{l}</button>
                    ))}
                </div>
            </div>

            {/* Downloads */}
            <div style={styles.downloadBar}>
                <button style={styles.dlBtn} onClick={() => handleDownload("raw")}>
                    ↓ Raw CSV ({cfg.apiKey})
                </button>
                <button style={styles.dlBtn} onClick={() => handleDownload("agg")}>
                    ↓ Aggregated CSV ({cfg.apiKey})
                </button>
            </div>

            {/* Stats */}
            <div style={styles.statsRow}>
                {[
                    { val: rows.length, label: "Total Runs" },
                    { val: avg(allViols)?.toFixed(2) ?? "—", label: "Avg Violations" },
                    { val: avg(allCoh)?.toFixed(2) ?? "—", label: "Avg Cohesion" },
                    { val: bestModel, label: "Best Model (violations)" },
                ].map(({ val, label }) => (
                    <div key={label} style={styles.statCard}>
                        <div style={styles.statValue}>{val}</div>
                        <div style={styles.statLabel}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Charts */}
            {loading ? (
                <div style={styles.loading}>Loading experiment data...</div>
            ) : rows.length === 0 ? (
                <div style={styles.loading}>No data for current selection</div>
            ) : (
                <div style={styles.grid}>
                    <BarChart
                        title="Arch Violations per Model"
                        models={models}
                        valFn={m => avg((byModel[m] || []).map(r => getViolCol(r)))}
                    />
                    <BarChart
                        title={cfg.namespaces ? "Avg Cohesion per Model" : "Avg Cohesion per Model"}
                        models={models}
                        valFn={m => avg((byModel[m] || []).map(r => getCohesion(r, currentArch)))}
                    />
                    {cfg.namespaces
                        ? <InstabilityHeatmap byModel={byModel} namespaces={cfg.namespaces} />
                        : <BarChart
                            title="Avg # Services per Model"
                            models={models}
                            valFn={m => avg((byModel[m] || []).map(r => Number(r["# Namespaces"] || 0)))}
                        />
                    }
                    {cfg.namespaces && (
                        <BarChart
                            title="|D| Distance from Main Sequence (avg)"
                            models={models}
                            valFn={m => avg(cfg.namespaces.map(ns => Math.abs(Number(avg((byModel[m] || []).map(r => Number(r[`${ns} D`] || 0)))))))}
                        />
                    )}
                    <TempChart rows={rows} arch={currentArch} />
                    <PromptCompare rows={rows} />
                </div>
            )}
        </div>
    );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = {
    page: { padding: 24, background: "#0f1117", minHeight: "100vh", color: "#e8eaf6", fontFamily: "Inter,sans-serif" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #2d3148" },
    h1: { fontFamily: "JetBrains Mono,monospace", fontSize: 20, fontWeight: 700, letterSpacing: -0.5 },
    badge: { fontFamily: "JetBrains Mono,monospace", fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(108,140,255,0.12)", border: "1px solid rgba(108,140,255,0.3)", color: "#6c8cff" },
    tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
    tab: { fontFamily: "JetBrains Mono,monospace", fontSize: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid #2d3148", background: "#1a1d27", color: "#8b93b8", cursor: "pointer", transition: "all 0.2s" },
    tabActive: { background: "#6c8cff", borderColor: "#6c8cff", color: "#fff", fontWeight: 600 },
    controls: { display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" },
    controlGroup: { display: "flex", alignItems: "center", gap: 8, background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 10, padding: "6px 12px" },
    controlLabel: { fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#5a6285", textTransform: "uppercase", letterSpacing: 0.5 },
    select: { background: "transparent", border: "none", color: "#e8eaf6", fontFamily: "Inter,sans-serif", fontSize: 13, cursor: "pointer", outline: "none" },
    promptToggle: { display: "flex", gap: 4, background: "#232736", padding: 3, borderRadius: 8 },
    promptBtn: { fontSize: 11, fontFamily: "JetBrains Mono,monospace", padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "#8b93b8", transition: "all 0.2s" },
    promptBtnActive: { background: "#6c8cff", color: "#fff" },
    downloadBar: { display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" },
    dlBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "JetBrains Mono,monospace", padding: "7px 14px", borderRadius: 10, border: "1px solid #2d3148", background: "#1a1d27", color: "#8b93b8", cursor: "pointer", transition: "all 0.2s" },
    statsRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 },
    statCard: { background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 10, padding: 16, textAlign: "center" },
    statValue: { fontFamily: "JetBrains Mono,monospace", fontSize: 24, fontWeight: 700, color: "#6c8cff", marginBottom: 4 },
    statLabel: { fontSize: 11, color: "#5a6285", textTransform: "uppercase", letterSpacing: 0.5 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
    chartCard: { background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 10, padding: 20, position: "relative", overflow: "hidden" },
    chartTitle: { fontFamily: "JetBrains Mono,monospace", fontSize: 12, fontWeight: 600, color: "#8b93b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 },
    barLabel: { fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#8b93b8", width: 70, textAlign: "right", flexShrink: 0 },
    barTrack: { flex: 1, height: 20, background: "#232736", borderRadius: 4, overflow: "hidden" },
    barFill: { height: "100%", borderRadius: 4, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)", opacity: 0.85 },
    barValue: { fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#5a6285", width: 40, flexShrink: 0 },
    loading: { display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#5a6285", fontFamily: "JetBrains Mono,monospace", fontSize: 13, gridColumn: "1/-1" },
};