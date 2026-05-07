import { useState, useEffect } from "react";

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
const EXPECTED_I = {
    Business: "medium", Data: "low", Presentation: "high",
    Model: "low", View: "high", Controller: "medium",
    Client: "high", Server: "low",
};
const NS_COLORS = ["#6c8cff", "#52d9a4", "#ffd166", "#ff6b8a"];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    return cfg?.namespaces ? avg(cfg.namespaces.map(ns => Number(row[`${ns} Cohesion`] || 0))) : 0;
}
function getWeightedCe(row, arch) {
    if (arch === "microservices") return Number(row["Avg Weighted Ce"] || 0);
    const cfg = ARCH_CONFIG[arch];
    return cfg?.namespaces ? avg(cfg.namespaces.map(ns => Number(row[`${ns} Weighted Ce`] || 0))) : 0;
}

// ── Base chart components ─────────────────────────────────────────────────────

function SectionHeader({ rq, title, subtitle }) {
    return (
        <div style={{ gridColumn: "1/-1", borderTop: "1px solid #2d3148", paddingTop: 20, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 10, color: "#6c8cff", background: "rgba(108,140,255,0.12)", border: "1px solid rgba(108,140,255,0.3)", padding: "2px 8px", borderRadius: 4 }}>{rq}</span>
                <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 14, fontWeight: 700, color: "#e8eaf6" }}>{title}</span>
            </div>
            {subtitle && <div style={{ fontSize: 12, color: "#5a6285", marginTop: 4 }}>{subtitle}</div>}
        </div>
    );
}

function BarChart({ title, models, valFn, wide = false }) {
    const vals = models.map(m => ({ m, v: valFn(m) }));
    const max = Math.max(...vals.map(x => x.v || 0), 0.001) * 1.1;
    return (
        <div style={{ ...styles.chartCard, ...(wide ? { gridColumn: "1/-1" } : {}) }}>
            <div style={styles.chartTitle}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {vals.map(({ m, v }) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={styles.barLabel}>{m}</span>
                        <div style={styles.barTrack}>
                            <div style={{ ...styles.barFill, width: `${Math.min(((v || 0) / max) * 100, 100)}%`, background: MODEL_COLORS[m] }} />
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
                            <th style={{ padding: "6px 10px", color: "#5a6285" }} />
                            {namespaces.map(ns => (
                                <th key={ns} style={{ padding: "6px 10px", color: "#8b93b8", fontFamily: "JetBrains Mono,monospace", fontWeight: 500 }}>
                                    {ns}
                                    <div style={{ fontSize: 9, color: "#5a6285", fontWeight: 400 }}>exp: {EXPECTED_I[ns] ?? "—"}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(m => (
                            <tr key={m}>
                                <td style={{ padding: "6px 10px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#8b93b8", textAlign: "right" }}>{m}</td>
                                {namespaces.map(ns => {
                                    const v = avg((byModel[m] || []).map(r => Number(r[`${ns} I`] || 0)));
                                    const pct = v ?? 0;
                                    return (
                                        <td key={ns} style={{
                                            padding: "7px 10px", textAlign: "center",
                                            background: `hsl(${(1 - pct) * 120},60%,${20 + pct * 20}%)`,
                                            color: pct > 0.5 ? "#fff" : "#ccc",
                                            fontFamily: "JetBrains Mono,monospace",
                                            border: "1px solid #2d3148", fontSize: 11
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
        </div>
    );
}

function DistanceChart({ byModel, namespaces }) {
    const models = MODELS.filter(m => byModel[m]);
    const allVals = models.flatMap(m => namespaces.map(ns => avg((byModel[m] || []).map(r => Math.abs(Number(r[`${ns} D`] || 0)))) ?? 0));
    const maxVal = Math.max(...allVals, 0.001) * 1.1;
    return (
        <div style={styles.chartCard}>
            <div style={styles.chartTitle}>|D| Distance from Main Sequence</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                {namespaces.map((ns, i) => (
                    <div key={ns} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8b93b8" }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: NS_COLORS[i] }} />{ns}
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {models.map(m => (
                    <div key={m}>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#8b93b8", marginBottom: 3 }}>{m}</div>
                        {namespaces.map((ns, i) => {
                            const v = avg((byModel[m] || []).map(r => Math.abs(Number(r[`${ns} D`] || 0))));
                            const pct = Math.min(((v || 0) / maxVal) * 100, 100);
                            return (
                                <div key={ns} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                    <span style={{ width: 88, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{ns}</span>
                                    <div style={{ flex: 1, height: 12, background: "#232736", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: NS_COLORS[i], opacity: 0.8, borderRadius: 3, transition: "width 0.6s" }} />
                                        <div style={{ position: "absolute", top: 0, left: `${Math.min((0.3 / maxVal) * 100, 100)}%`, width: 1, height: "100%", background: "#ff6b8a", opacity: 0.6 }} />
                                    </div>
                                    <span style={{ width: 36, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>{v != null ? v.toFixed(2) : "—"}</span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>Red line = D=0.3 threshold</div>
        </div>
    );
}

function WeightedCouplingChart({ byModel, namespaces }) {
    const models = MODELS.filter(m => byModel[m]);
    const nsToShow = namespaces ?? ["avg"];
    const allWCe = models.flatMap(m => nsToShow.map(ns => {
        const col = ns === "avg" ? "Avg Weighted Ce" : `${ns} Weighted Ce`;
        return avg((byModel[m] || []).map(r => Number(r[col] || 0))) ?? 0;
    }));
    const maxWCe = Math.max(...allWCe, 0.001) * 1.1;
    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={styles.chartTitle}>
                Coupling Strength — Weighted Ce
                <span style={{ color: "#5a6285", marginLeft: 8, fontWeight: 400, textTransform: "none", fontSize: 11 }}>
                    W = total edges · M = Martin Ce (unique pairs)
                </span>
            </div>
            {namespaces && (
                <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                    {namespaces.map((ns, i) => (
                        <div key={ns} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8b93b8" }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: NS_COLORS[i] }} />{ns}
                        </div>
                    ))}
                </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {models.map(m => (
                    <div key={m}>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#8b93b8", marginBottom: 4 }}>{m}</div>
                        {nsToShow.map((ns, i) => {
                            const wceCol = ns === "avg" ? "Avg Weighted Ce" : `${ns} Weighted Ce`;
                            const ceCol = ns === "avg" ? "Avg Ce" : `${ns} Ce`;
                            const wCe = avg((byModel[m] || []).map(r => Number(r[wceCol] || 0)));
                            const mCe = avg((byModel[m] || []).map(r => Number(r[ceCol] || 0)));
                            const pct = Math.min(((wCe || 0) / maxWCe) * 100, 100);
                            return (
                                <div key={ns} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                    <span style={{ width: 88, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{ns === "avg" ? "avg" : ns}</span>
                                    <div style={{ flex: 1, height: 14, background: "#232736", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: NS_COLORS[i], opacity: 0.85, borderRadius: 3, transition: "width 0.6s" }} />
                                    </div>
                                    <span style={{ width: 90, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                                        W:{wCe != null ? wCe.toFixed(0) : "—"} / M:{mCe != null ? mCe.toFixed(0) : "—"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function TempChart({ rows }) {
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
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: MODEL_COLORS[m] }} />{m}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── RQ2: Prompt comparison ────────────────────────────────────────────────────

function PromptCompare({ rows, arch }) {
    const models = MODELS.filter(m => rows.some(r => r["LLM model"] === m));
    const bySrs = groupBy(rows.filter(r => r["Prompt type"] === "srs"), "LLM model");
    const byFrnfr = groupBy(rows.filter(r => r["Prompt type"] === "frnfr"), "LLM model");

    // metric selector
    const [metric, setMetric] = useState("violations");
    const metricFn = (group) => {
        if (metric === "violations") return avg((group || []).map(r => getViolCol(r)));
        if (metric === "cohesion") return avg((group || []).map(r => getCohesion(r, arch)));
        if (metric === "services") return avg((group || []).map(r => Number(r["# Namespaces"] || 0)));
        return null;
    };
    const metricLabel = { violations: "Avg Violations", cohesion: "Avg Cohesion", services: "Avg # Services" };
    const maxV = Math.max(
        ...models.map(m => metricFn(bySrs[m]) || 0),
        ...models.map(m => metricFn(byFrnfr[m]) || 0),
        0.001
    ) * 1.1;

    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={styles.chartTitle}>SRS vs FR-NFR — {metricLabel[metric]}</div>
                <div style={styles.promptToggle}>
                    {["violations", "cohesion", ...(arch === "microservices" ? ["services"] : [])].map(k => (
                        <button key={k}
                            style={{ ...styles.promptBtn, ...(metric === k ? styles.promptBtnActive : {}) }}
                            onClick={() => setMetric(k)}>
                            {k}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
                {models.map(m => {
                    const sv = metricFn(bySrs[m]);
                    const fv = metricFn(byFrnfr[m]);
                    return (
                        <div key={m}>
                            <div style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#8b93b8", marginBottom: 6 }}>{m}</div>
                            {[{ label: "SRS", val: sv, color: "#6c8cff" }, { label: "FR-NFR", val: fv, color: "#ff6b8a" }].map(({ label, val, color }) => (
                                <div key={label} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                    <span style={{ width: 45, fontSize: 10, color, fontFamily: "JetBrains Mono,monospace" }}>{label}</span>
                                    <div style={{ flex: 1, height: 14, background: "#232736", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ width: `${val != null ? Math.min((val / maxV) * 100, 100) : 0}%`, height: "100%", background: color, opacity: 0.85, borderRadius: 3, transition: "width 0.6s" }} />
                                    </div>
                                    <span style={{ width: 36, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                                        {val != null ? val.toFixed(2) : "—"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── RQ3: Variance heatmap ─────────────────────────────────────────────────────

function VarianceHeatmap({ aggData, arch }) {
    const cfg = ARCH_CONFIG[arch];
    const models = MODELS.filter(m => aggData.some(r => r["LLM model"] === m));

    // Build metric columns to show
    let metricCols = [];
    if (cfg.namespaces) {
        cfg.namespaces.forEach(ns => {
            metricCols.push({ key: `STD ${ns} I`, label: `${ns} I` });
            metricCols.push({ key: `STD ${ns} Cohesion`, label: `${ns} Coh` });
        });
    } else {
        metricCols = [
            { key: "STD Avg I", label: "Avg I" },
            { key: "STD Avg Cohesion", label: "Avg Coh" },
            { key: "STD # Namespaces", label: "# Svc" },
        ];
    }
    metricCols.push({ key: "STD Arch Violations", label: "Violations" });

    // avg STD per model across all conditions
    const byModel = groupBy(aggData, "LLM model");
    const cells = models.map(m => ({
        m,
        vals: metricCols.map(col => avg((byModel[m] || []).map(r => Number(r[col.key] || 0))))
    }));
    const allVals = cells.flatMap(c => c.vals.filter(v => v != null));
    const maxVal = Math.max(...allVals, 0.001);

    const heatColor = (v) => {
        if (v == null) return "#1a1d27";
        const pct = Math.min(v / maxVal, 1);
        return `hsl(${(1 - pct) * 60},70%,${15 + pct * 25}%)`;
    };

    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={styles.chartTitle}>Output Variance (STD) per Model — averaged across all conditions</div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                    <thead>
                        <tr>
                            <th style={{ padding: "6px 10px", color: "#5a6285", textAlign: "right" }} />
                            {metricCols.map(col => (
                                <th key={col.key} style={{ padding: "6px 10px", color: "#8b93b8", fontFamily: "JetBrains Mono,monospace", fontWeight: 500, fontSize: 10 }}>{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cells.map(({ m, vals }) => (
                            <tr key={m}>
                                <td style={{ padding: "6px 10px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#8b93b8", textAlign: "right" }}>{m}</td>
                                {vals.map((v, i) => (
                                    <td key={i} style={{
                                        padding: "7px 10px", textAlign: "center",
                                        background: heatColor(v),
                                        border: "1px solid #2d3148",
                                        fontFamily: "JetBrains Mono,monospace", fontSize: 11,
                                        color: v != null && v / maxVal > 0.4 ? "#fff" : "#aaa"
                                    }}>
                                        {v != null ? v.toFixed(3) : "—"}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                Yellow = high variance · Dark = low variance · Values are avg STD across all prompt/temperature conditions
            </div>
        </div>
    );
}

// ── RQ4: DCC vs MyCharts ──────────────────────────────────────────────────────

function ComplexityCompare({ rawDataAll, arch }) {
    const cfg = ARCH_CONFIG[arch];
    const [metric, setMetric] = useState("violations");

    const getVal = (rows, m) => {
        const sub = (rows || []).filter(r => r["LLM model"] === m);
        if (!sub.length) return null;
        if (metric === "violations") return avg(sub.map(r => getViolCol(r)));
        if (metric === "cohesion") return avg(sub.map(r => getCohesion(r, arch)));
        if (metric === "services") return avg(sub.map(r => Number(r["# Namespaces"] || 0)));
        if (metric === "weightedce") return avg(sub.map(r => getWeightedCe(r, arch)));
        return null;
    };

    const dccRows = (rawDataAll[arch] || []).filter(r => r["Experiment"] === "DCC");
    const mychartsRows = (rawDataAll[arch] || []).filter(r => r["Experiment"] === "MYCHARTS");
    const models = MODELS.filter(m => dccRows.some(r => r["LLM model"] === m) || mychartsRows.some(r => r["LLM model"] === m));

    const maxV = Math.max(
        ...models.map(m => getVal(dccRows, m) || 0),
        ...models.map(m => getVal(mychartsRows, m) || 0),
        0.001
    ) * 1.1;

    const metricOptions = ["violations", "cohesion", "weightedce", ...(arch === "microservices" ? ["services"] : [])];
    const metricLabel = { violations: "Avg Violations", cohesion: "Avg Cohesion", services: "Avg # Services", weightedce: "Avg Weighted Ce" };

    if (!mychartsRows.length) {
        return (
            <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
                <div style={styles.chartTitle}>DCC vs MyCharts</div>
                <div style={{ color: "#5a6285", fontSize: 12, fontFamily: "JetBrains Mono,monospace" }}>
                    MyCharts data not available for this architecture
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.chartCard, gridColumn: "1/-1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={styles.chartTitle}>DCC vs MyCharts — {metricLabel[metric]}</div>
                <div style={styles.promptToggle}>
                    {metricOptions.map(k => (
                        <button key={k}
                            style={{ ...styles.promptBtn, ...(metric === k ? styles.promptBtnActive : {}) }}
                            onClick={() => setMetric(k)}>
                            {k}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {models.map(m => {
                    const dv = getVal(dccRows, m);
                    const mv = getVal(mychartsRows, m);
                    const diff = (dv != null && mv != null) ? mv - dv : null;
                    const diffColor = diff == null ? "#5a6285" : diff > 0 ? "#ff6b8a" : "#52d9a4";
                    return (
                        <div key={m}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: MODEL_COLORS[m] }}>{m}</span>
                                {diff != null && (
                                    <span style={{ fontSize: 10, fontFamily: "JetBrains Mono,monospace", color: diffColor }}>
                                        {diff > 0 ? "+" : ""}{diff.toFixed(2)} MyCharts
                                    </span>
                                )}
                            </div>
                            {[{ label: "DCC", val: dv, color: "#4C72B0" }, { label: "MYCHARTS", val: mv, color: "#55A868" }].map(({ label, val, color }) => (
                                <div key={label} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                                    <span style={{ width: 68, fontSize: 10, color, fontFamily: "JetBrains Mono,monospace" }}>{label}</span>
                                    <div style={{ flex: 1, height: 13, background: "#232736", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ width: `${val != null ? Math.min((val / maxV) * 100, 100) : 0}%`, height: "100%", background: color, opacity: 0.85, borderRadius: 3, transition: "width 0.6s" }} />
                                    </div>
                                    <span style={{ width: 36, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                                        {val != null ? val.toFixed(2) : "—"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "#5a6285", fontFamily: "JetBrains Mono,monospace" }}>
                Diff = MyCharts − DCC · Red = worse in MyCharts · Green = better in MyCharts
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsPage() {
    const [currentArch, setCurrentArch] = useState("3tier");
    const [experiment, setExperiment] = useState("DCC");
    const [temperature, setTemperature] = useState("all");
    const [promptType, setPromptType] = useState("all");
    const [rawData, setRawData] = useState({});     // raw CSVs per arch
    const [aggData, setAggData] = useState({});     // aggregated CSVs per arch
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadAll() {
            setLoading(true);
            const raw = {}, agg = {};
            for (const key of Object.keys(ARCH_CONFIG)) {
                const apiKey = ARCH_CONFIG[key].apiKey;
                try {
                    const r1 = await fetch(`${API}/api/export-csv?architecture=${apiKey}`);
                    if (r1.ok) raw[key] = parseCSV(await r1.text());
                } catch { }
                try {
                    const r2 = await fetch(`${API}/api/export-csv-aggregated?architecture=${apiKey}`);
                    if (r2.ok) agg[key] = parseCSV(await r2.text());
                } catch { }
            }
            setRawData(raw);
            setAggData(agg);
            setLoading(false);
        }
        loadAll();
    }, []);

    // Filtered rows for current selection
    const rows = (rawData[currentArch] || []).filter(r => {
        if (r["Experiment"] !== experiment) return false;
        if (temperature !== "all" && String(r["Temperature"]) !== temperature) return false;
        if (promptType !== "all" && r["Prompt type"] !== promptType) return false;
        return true;
    });

    // Aggregated rows filtered (for variance heatmap — all experiments, all temps, all prompts for current arch)
    const aggRows = (aggData[currentArch] || []).filter(r => r["Experiment"] === experiment);

    const cfg = ARCH_CONFIG[currentArch];
    const byModel = groupBy(rows, "LLM model");
    const models = MODELS.filter(m => byModel[m]);

    const allViols = rows.map(r => getViolCol(r));
    const allCoh = rows.map(r => getCohesion(r, currentArch));
    const allWCe = rows.map(r => getWeightedCe(r, currentArch));
    const bestModel = [...models.map(m => ({ m, v: avg((byModel[m] || []).map(r => getViolCol(r))) })).filter(x => x.v != null)].sort((a, b) => a.v - b.v)[0]?.m ?? "—";

    const handleDownload = (type) => {
        const url = `${API}/api/${type === "raw" ? "export-csv" : "export-csv-aggregated"}?architecture=${cfg.apiKey}`;
        window.open(url, "_blank");
    };

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.h1}>LLM Architecture Benchmark <span style={{ color: "#6c8cff" }}> / Results</span></h1>
                <span style={styles.badge}>DCC + MyCharts · 1260 runs</span>
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
                    { label: "Experiment", value: experiment, opts: [["DCC", "DCC"], ["MYCHARTS", "MyCharts"]], set: setExperiment },
                    { label: "Temperature", value: temperature, opts: [["all", "All"], ["0", "0.0"], ["0.2", "0.2"], ["0.5", "0.5"]], set: setTemperature },
                ].map(({ label, value, opts, set }) => (
                    <div key={label} style={styles.controlGroup}>
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
                            onClick={() => setPromptType(v)}>{l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Downloads */}
            <div style={styles.downloadBar}>
                <button style={styles.dlBtn} onClick={() => handleDownload("raw")}>↓ Raw CSV ({cfg.apiKey})</button>
                <button style={styles.dlBtn} onClick={() => handleDownload("agg")}>↓ Aggregated CSV ({cfg.apiKey})</button>
            </div>

            {/* Stats */}
            <div style={styles.statsRow}>
                {[
                    { val: rows.length, label: "Total Runs" },
                    { val: avg(allViols)?.toFixed(2) ?? "—", label: "Avg Violations" },
                    { val: avg(allCoh)?.toFixed(2) ?? "—", label: "Avg Cohesion" },
                    { val: avg(allWCe)?.toFixed(1) ?? "—", label: "Avg Weighted Ce" },
                    { val: bestModel, label: "Best Model" },
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

                    {/* ── RQ1: Model comparison ── */}
                    <SectionHeader rq="RQ1" title="Model Comparison" subtitle="Which LLM produces the best architectural designs?" />

                    <BarChart title="Arch Violations per Model" models={models} valFn={m => avg((byModel[m] || []).map(r => getViolCol(r)))} />
                    <BarChart title="Avg Cohesion per Model" models={models} valFn={m => avg((byModel[m] || []).map(r => getCohesion(r, currentArch)))} />

                    {cfg.namespaces ? (
                        <>
                            <InstabilityHeatmap byModel={byModel} namespaces={cfg.namespaces} />
                            <DistanceChart byModel={byModel} namespaces={cfg.namespaces} />
                        </>
                    ) : (
                        <>
                            <BarChart title="Avg # Services per Model" models={models} valFn={m => avg((byModel[m] || []).map(r => Number(r["# Namespaces"] || 0)))} />
                            <BarChart title="Avg Weighted Ce (coupling strength)" models={models} valFn={m => avg((byModel[m] || []).map(r => getWeightedCe(r, currentArch)))} />
                        </>
                    )}
                    <WeightedCouplingChart byModel={byModel} namespaces={cfg.namespaces} />

                    {/* ── RQ2: Prompt type ── */}
                    <SectionHeader rq="RQ2" title="Prompt Type Effect" subtitle="Does SRS vs FR-NFR affect conformance and quality?" />
                    <PromptCompare rows={rows} arch={currentArch} />

                    {/* ── RQ3: Variance ── */}
                    <SectionHeader rq="RQ3" title="Output Variance" subtitle="How consistent is each model across repeated runs?" />
                    <TempChart rows={rows} />
                    {aggRows.length > 0 && <VarianceHeatmap aggData={aggRows} arch={currentArch} />}

                    {/* ── RQ4: Complexity ── */}
                    <SectionHeader rq="RQ4" title="Project Complexity Effect" subtitle="How does system complexity (DCC → MyCharts) affect results?" />
                    <ComplexityCompare rawDataAll={rawData} arch={currentArch} />

                </div>
            )}
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
    statsRow: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 },
    statCard: { background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 10, padding: 16, textAlign: "center" },
    statValue: { fontFamily: "JetBrains Mono,monospace", fontSize: 22, fontWeight: 700, color: "#6c8cff", marginBottom: 4 },
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