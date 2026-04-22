import React, { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter,
  XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Legend,
  ReferenceLine, ErrorBar,
  Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0f1117",
  surface: "#181c27",
  surfaceAlt: "#1e2336",
  border: "#2a3050",
  text: "#e8ecf4",
  muted: "#7b84a3",
  accent: "#5b8dee",
  // namespace / model palette
  palette: ["#5b8dee", "#f0a84e", "#4ecb8d", "#e05c6d", "#a78bfa", "#38bdf8"],
  // prompt type
  frnfr: "#5b8dee",
  srs: "#4ecb8d",
};

const ARCHITECTURES = ["client-server", "3tier", "mvc", "microservices"];
const ARCH_LABELS = {
  "client-server": "Client-Server",
  "3tier": "3-Tier",
  mvc: "MVC",
  microservices: "Microservices",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { fetch_(); }, [fetch_]);
  return { data, loading, error };
}

function Section({ title, description, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHeader}>
        <h3 style={s.sectionTitle}>{title}</h3>
        {description && <p style={s.sectionDesc}>{description}</p>}
      </div>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, wide }) {
  return (
    <div style={{ ...s.card, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{title}</span>
        {subtitle && <span style={s.cardSubtitle}>{subtitle}</span>}
      </div>
      <div style={s.cardBody}>{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={s.stateBox}>
      <div style={s.spinner} />
      <span style={{ color: C.muted, fontSize: 13 }}>Loading data…</span>
    </div>
  );
}

function ErrorState({ msg }) {
  return (
    <div style={{ ...s.stateBox, color: "#e05c6d" }}>
      ⚠ {msg}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={s.tooltip}>
      <div style={s.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={s.tooltipRow}>
          <span style={{ color: p.color || C.accent }}>{p.name}</span>
          <span style={{ color: C.text, fontWeight: 600, marginLeft: 8 }}>
            {typeof p.value === "number" ? p.value.toFixed(3) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
function ArchTabs({ active, onChange }) {
  return (
    <div style={s.tabs}>
      {ARCHITECTURES.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          style={{ ...s.tab, ...(active === a ? s.tabActive : {}) }}
        >
          {ARCH_LABELS[a]}
        </button>
      ))}
    </div>
  );
}

// ─── 1. Temperature Effect ────────────────────────────────────────────────────
function TemperatureSection() {
  const { data, loading, error } = useApi("/chart-temperature-effect");
  const [arch, setArch] = useState("client-server");

  const NS_KEYS = {
    "client-server": ["Client", "Server"],
    "3tier": ["Business", "Data", "Presentation"],
    mvc: ["Model", "View", "Controller"],
    microservices: ["AvgCohesion"],
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState msg={error} />;

  const rows = (data?.[arch] || []).sort((a, b) => a.temperature - b.temperature);
  const models = [...new Set(rows.map((r) => r.model))];
  const namespaces = NS_KEYS[arch];

  // Pivot: one series per model+namespace
  const series = [];
  for (const model of models) {
    for (const ns of namespaces) {
      series.push({ key: `${model}__${ns}`, model, ns });
    }
  }

  // Build chart data: x = temperature, one line per model
  // Regroup: { temperature → { model → { ns → value } } }
  const byTemp = {};
  for (const row of rows) {
    const t = row.temperature;
    if (!byTemp[t]) byTemp[t] = { temperature: t };
    for (const ns of namespaces) {
      const k = `${row.model} / ${ns}`;
      byTemp[t][k] = row[ns];
    }
  }
  const chartData = Object.values(byTemp).sort((a, b) => a.temperature - b.temperature);

  return (
    <Section
      title="Temperature Effect on Cohesion"
      description="How LLM sampling temperature affects the average cohesion per namespace. Lower variance and higher cohesion at low temperatures indicates deterministic, well-structured output."
    >
      <ArchTabs active={arch} onChange={setArch} />
      <ChartCard
        title={ARCH_LABELS[arch]}
        subtitle="Avg cohesion vs temperature, per model & namespace"
        wide
      >
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis
              dataKey="temperature"
              stroke={C.muted}
              tick={{ fill: C.muted, fontSize: 12 }}
              label={{ value: "Temperature", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }}
            />
            <YAxis domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 12 }} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
            {series.map(({ key, model, ns }, i) => (
              <Line
                key={key}
                dataKey={`${model} / ${ns}`}
                stroke={C.palette[i % C.palette.length]}
                strokeWidth={2}
                dot={{ r: 4, fill: C.palette[i % C.palette.length] }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </Section>
  );
}

// ─── 2. Coupling & Instability ────────────────────────────────────────────────
function CouplingSection() {
  const { data, loading, error } = useApi("/chart-coupling-instability");
  const [arch, setArch] = useState("client-server");
  const [view, setView] = useState("bar"); // bar | scatter

  if (loading) return <LoadingState />;
  if (error) return <ErrorState msg={error} />;

  const rows = data?.[arch] || [];
  const namespaces = [...new Set(rows.map((r) => r.namespace))];
  const models = [...new Set(rows.map((r) => r.model))];

  // For bar chart: group by model, bars = namespaces
  const barData = models.map((model) => {
    const entry = { model };
    for (const ns of namespaces) {
      const row = rows.find((r) => r.model === model && r.namespace === ns);
      entry[`${ns}_ca`] = row?.ca ?? null;
      entry[`${ns}_ce`] = row?.ce ?? null;
      entry[`${ns}_instability`] = row?.instability ?? null;
    }
    return entry;
  });

  // For scatter (Main Sequence): instability vs distance, one point per (model, namespace)
  const scatterData = rows.map((r, i) => ({
    ...r,
    label: `${r.model} / ${r.namespace}`,
    color: C.palette[models.indexOf(r.model) % C.palette.length],
  }));

  return (
    <Section
      title="Coupling & Instability (Martin Metrics)"
      description="Ca (afferent) and Ce (efferent) coupling, instability I = Ce/(Ca+Ce), and Main Sequence distance D = |A + I − 1| per namespace. Low distance = well-balanced module."
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <ArchTabs active={arch} onChange={setArch} />
        <div style={s.viewToggle}>
          {["bar", "scatter"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ ...s.viewBtn, ...(view === v ? s.viewBtnActive : {}) }}
            >
              {v === "bar" ? "Bar" : "Main Sequence"}
            </button>
          ))}
        </div>
      </div>

      {view === "bar" ? (
        <div style={s.grid2}>
          <ChartCard title="Ca & Ce per namespace" subtitle="Afferent vs efferent coupling">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
                {namespaces.map((ns, i) => (
                  <Bar key={`${ns}_ca`} dataKey={`${ns}_ca`} name={`${ns} Ca`}
                    fill={C.palette[i % C.palette.length]} opacity={0.9} />
                ))}
                {namespaces.map((ns, i) => (
                  <Bar key={`${ns}_ce`} dataKey={`${ns}_ce`} name={`${ns} Ce`}
                    fill={C.palette[i % C.palette.length]} opacity={0.45} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Instability per namespace" subtitle="I = Ce / (Ca+Ce), range [0,1]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
                {namespaces.map((ns, i) => (
                  <Bar key={`${ns}_instability`} dataKey={`${ns}_instability`}
                    name={`${ns} Instability`} fill={C.palette[i % C.palette.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : (
        <ChartCard
          title="Main Sequence — Instability vs Distance"
          subtitle="Ideal zone: low distance (D<0.3). Points near origin = stable & concrete (good for data layers). Points at (1,0) = instable & concrete."
          wide
        >
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                type="number" dataKey="instability" name="Instability"
                domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }}
                label={{ value: "Instability (I)", position: "insideBottom", offset: -10, fill: C.muted, fontSize: 12 }}
              />
              <YAxis
                type="number" dataKey="distance" name="Distance"
                domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }}
                label={{ value: "Distance (D)", angle: -90, position: "insideLeft", fill: C.muted, fontSize: 12 }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={s.tooltip}>
                      <div style={{ ...s.tooltipLabel, color: d.color }}>{d.label}</div>
                      <div style={s.tooltipRow}>Instability <b>{d.instability?.toFixed(3)}</b></div>
                      <div style={s.tooltipRow}>Distance <b>{d.distance?.toFixed(3)}</b></div>
                      <div style={s.tooltipRow}>Ca <b>{d.ca}</b> · Ce <b>{d.ce}</b></div>
                    </div>
                  );
                }}
              />
              {/* Main Sequence ideal line: D=0 → 1-I=1-I, i.e. D+I=1 → two points (0,1) and (1,0) */}
              <ReferenceLine
                segment={[{ x: 0, y: 1 }, { x: 1, y: 0 }]}
                stroke={C.accent} strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: "Main Sequence", fill: C.accent, fontSize: 11, position: "insideTopRight" }}
              />
              <Scatter data={scatterData} isAnimationActive={false}>
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div style={s.legend}>
            {models.map((m, i) => (
              <span key={m} style={{ color: C.palette[i % C.palette.length], fontSize: 12, marginRight: 16 }}>
                ● {m}
              </span>
            ))}
          </div>
        </ChartCard>
      )}
    </Section>
  );
}

// ─── 3. Prompt Type Comparison ────────────────────────────────────────────────
function PromptComparisonSection() {
  const { data, loading, error } = useApi("/chart-prompt-comparison");
  const [arch, setArch] = useState("client-server");
  const [metric, setMetric] = useState("cohesion");

  if (loading) return <LoadingState />;
  if (error) return <ErrorState msg={error} />;

  const rows = data?.[arch] || [];

  const chartData = rows.map((r) => ({
    model: r.model,
    frnfr: r[`frnfr_${metric}`],
    srs: r[`srs_${metric}`],
  }));

  return (
    <Section
      title="Prompt Type Comparison"
      description="frnfr (free-form natural language) vs srs (structured requirement spec) prompts. Differences reveal how prompt structure affects code architecture quality."
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <ArchTabs active={arch} onChange={setArch} />
        <div style={s.viewToggle}>
          {["cohesion", "violations"].map((v) => (
            <button
              key={v}
              onClick={() => setMetric(v)}
              style={{ ...s.viewBtn, ...(metric === v ? s.viewBtnActive : {}) }}
            >
              {v === "cohesion" ? "Cohesion" : "Violations"}
            </button>
          ))}
        </div>
      </div>

      <ChartCard
        title={`${ARCH_LABELS[arch]} — ${metric === "cohesion" ? "Average Cohesion" : "Arch Violations"}`}
        subtitle="frnfr vs srs per LLM model"
        wide
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 12 }} />
            <YAxis
              domain={metric === "cohesion" ? [0, 1] : [0, "auto"]}
              stroke={C.muted} tick={{ fill: C.muted, fontSize: 12 }}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
            <Bar dataKey="frnfr" name="frnfr" fill={C.frnfr} radius={[3, 3, 0, 0]} />
            <Bar dataKey="srs" name="srs" fill={C.srs} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </Section>
  );
}

// ─── 4. Variance / STD Analysis ───────────────────────────────────────────────
function VarianceSection() {
  const { data, loading, error } = useApi("/chart-variance-analysis");
  const [arch, setArch] = useState("client-server");

  if (loading) return <LoadingState />;
  if (error) return <ErrorState msg={error} />;

  const rows = data?.[arch] || [];

  // Build error bar data: mean ± std for each model
  const cohesionData = rows.map((r) => ({
    model: r.model,
    cohesion: r.mean_cohesion,
    errorVal: r.std_cohesion,
    n: r.n,
  }));

  const violationsData = rows.map((r) => ({
    model: r.model,
    violations: r.mean_violations,
    errorVal: r.std_violations,
  }));

  // Per-namespace mean/std if available
  const NS_KEYS = {
    "client-server": ["client", "server"],
    "3tier": ["business", "data", "presentation"],
    mvc: ["model", "view", "controller"],
    microservices: [],
  };
  const nsKeys = NS_KEYS[arch] || [];

  const nsData = nsKeys.length
    ? rows.map((r) => {
        const entry = { model: r.model };
        for (const ns of nsKeys) {
          entry[`${ns}_mean`] = r[`mean_${ns}`];
          entry[`${ns}_std`] = r[`std_${ns}`];
        }
        return entry;
      })
    : [];

  return (
    <Section
      title="Consistency & Variance Analysis"
      description="Standard deviation of cohesion per LLM model shows how reproducible the output is. Low STD = consistent architecture regardless of run. High STD = unpredictable, temperature-sensitive output."
    >
      <ArchTabs active={arch} onChange={setArch} />

      <div style={s.grid2}>
        <ChartCard title="Cohesion: Mean ± Std" subtitle="Error bars show standard deviation across runs">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cohesionData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="cohesion" name="Mean Cohesion" fill={C.accent} radius={[3, 3, 0, 0]}>
                <ErrorBar dataKey="errorVal" width={6} strokeWidth={2} stroke={C.palette[2]} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Violations: Mean ± Std" subtitle="Architectural violations — ideally 0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={violationsData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="violations" name="Mean Violations" fill={C.palette[3]} radius={[3, 3, 0, 0]}>
                <ErrorBar dataKey="errorVal" width={6} strokeWidth={2} stroke={C.palette[4]} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {nsKeys.length > 0 && (
          <ChartCard title="Per-namespace STD" subtitle="Which namespace is least consistent?" wide>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={nsData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="model" stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis domain={[0, 1]} stroke={C.muted} tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
                {nsKeys.map((ns, i) => (
                  <Bar
                    key={ns}
                    dataKey={`${ns}_std`}
                    name={`${ns.charAt(0).toUpperCase() + ns.slice(1)} STD`}
                    fill={C.palette[i % C.palette.length]}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </Section>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "temperature", label: "Temperature Effect", Component: TemperatureSection },
  { id: "coupling", label: "Coupling & Instability", Component: CouplingSection },
  { id: "prompt", label: "Prompt Comparison", Component: PromptComparisonSection },
  { id: "variance", label: "Variance & STD", Component: VarianceSection },
];

export default function AdvancedAnalysisPanel() {
  const [tab, setTab] = useState("temperature");
  const { Component } = TABS.find((t) => t.id === tab);

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h2 style={s.title}>Advanced Analysis</h2>
        <p style={s.subtitle}>
          Deep-dive into coupling, instability, prompt sensitivity, and output consistency across LLM models and architectures.
        </p>
      </div>

      <div style={s.mainTabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...s.mainTab, ...(tab === t.id ? s.mainTabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={s.content}>
        <Component />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "28px 32px",
    marginTop: 24,
    fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    color: C.text,
  },
  header: { marginBottom: 24 },
  title: { margin: 0, marginBottom: 6, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.5px" },
  subtitle: { margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 },

  mainTabs: {
    display: "flex",
    gap: 4,
    borderBottom: `1px solid ${C.border}`,
    marginBottom: 28,
    flexWrap: "wrap",
  },
  mainTab: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: C.muted,
    fontSize: 13,
    fontFamily: "inherit",
    padding: "10px 18px",
    cursor: "pointer",
    marginBottom: -1,
    transition: "color 0.15s",
  },
  mainTabActive: {
    color: C.accent,
    borderBottomColor: C.accent,
  },

  section: { },
  sectionHeader: { marginBottom: 20 },
  sectionTitle: { margin: 0, marginBottom: 6, fontSize: 16, fontWeight: 600, color: C.text },
  sectionDesc: { margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6, maxWidth: 700 },
  sectionBody: { },

  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: {
    background: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.muted,
    fontSize: 12,
    fontFamily: "inherit",
    padding: "5px 12px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    background: C.accent,
    borderColor: C.accent,
    color: "#fff",
  },

  viewToggle: { display: "flex", gap: 4, marginLeft: "auto" },
  viewBtn: {
    background: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.muted,
    fontSize: 12,
    fontFamily: "inherit",
    padding: "5px 12px",
    cursor: "pointer",
  },
  viewBtnActive: {
    background: "#2a3050",
    borderColor: C.accent,
    color: C.accent,
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 16,
    marginTop: 16,
  },

  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "12px 16px",
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  cardTitle: { fontSize: 13, fontWeight: 600, color: C.text },
  cardSubtitle: { fontSize: 11, color: C.muted },
  cardBody: { padding: "16px 12px 12px 4px" },

  tooltip: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12,
    fontFamily: "inherit",
  },
  tooltipLabel: { color: C.muted, marginBottom: 6, fontSize: 11 },
  tooltipRow: { display: "flex", justifyContent: "space-between", marginBottom: 2, color: C.muted },

  legend: { padding: "8px 16px 12px", borderTop: `1px solid ${C.border}` },

  stateBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    padding: "60px 0",
    color: C.muted,
  },
  spinner: {
    width: 18,
    height: 18,
    border: `2px solid ${C.border}`,
    borderTopColor: C.accent,
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
};

// inject keyframe
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}