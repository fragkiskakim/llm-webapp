import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ── helpers ──────────────────────────────────────────────────────────────────

function getNamespaces(results) {
  // collect unique namespace names from all results
  const ns = new Set();
  results.forEach((r) => {
    const mm = r.architecture_analysis?.martin_metrics || {};
    Object.keys(mm).forEach((n) => ns.add(n));
  });
  return Array.from(ns).sort();
}

function getMetrics(result, ns) {
  const mm = result.architecture_analysis?.martin_metrics?.[ns] || {};
  const cohesion = result.architecture_analysis?.cohesion?.[ns];
  return {
    Ca: mm.ca ?? "-",
    Ce: mm.ce ?? "-",
    I: mm.instability != null ? mm.instability.toFixed(3) : "-",
    D: mm.distance != null ? Math.abs(mm.distance).toFixed(3) : "-",
    Cohesion: cohesion != null ? cohesion.toFixed(3) : "-",
  };
}

function avg(vals) {
  const nums = vals.filter((v) => v !== "-").map(Number);
  if (!nums.length) return "-";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
}

function stddev(vals) {
  const nums = vals.filter((v) => v !== "-").map(Number);
  if (nums.length < 2) return "-";
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance).toFixed(3);
}

// For D and Cohesion: lower D is better, higher Cohesion is better
// For I: context-dependent — we just highlight min/max
function extremes(vals) {
  const nums = vals.map((v) => (v === "-" ? null : Number(v)));
  const valid = nums.filter((v) => v !== null);
  if (!valid.length) return { min: null, max: null };
  return { min: Math.min(...valid), max: Math.max(...valid) };
}

// ── styles ───────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0f172a",
  surface: "#1e293b",
  border: "#334155",
  text: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#38bdf8",
  good: "#4ade80",
  bad: "#f87171",
  mid: "#fbbf24",
  header: "#0ea5e9",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  backdropFilter: "blur(4px)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modal = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
  width: "95vw",
  maxWidth: 1200,
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
};

const th = (extra = {}) => ({
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: COLORS.muted,
  borderBottom: `1px solid ${COLORS.border}`,
  whiteSpace: "nowrap",
  ...extra,
});

const td = (extra = {}) => ({
  padding: "8px 12px",
  fontSize: 13,
  color: COLORS.text,
  borderBottom: `1px solid ${COLORS.border}`,
  textAlign: "center",
  ...extra,
});

// ── main component ────────────────────────────────────────────────────────────

export default function ComparisonModal({ category, rows, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const fetched = await Promise.all(
          rows.map((r) =>
            fetch(`${API}/api/run-experiments/${r.id}`).then((res) => res.json())
          )
        );
        setResults(fetched);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [rows]);

  const namespaces = results.length ? getNamespaces(results) : [];
  const METRIC_KEYS = ["Ca", "Ce", "I", "D", "Cohesion"];

  // Build column groups: one group per namespace × metric
  // columns: [{ ns, metric, label }]
  const columns = namespaces.flatMap((ns) =>
    METRIC_KEYS.map((m) => ({ ns, metric: m, key: `${ns}.${m}` }))
  );

  // Build rows data
  const dataRows = results.map((r, i) => {
    const row = { label: `${r.category}_${r.id}`, id: r.id };
    namespaces.forEach((ns) => {
      const m = getMetrics(r, ns);
      METRIC_KEYS.forEach((k) => {
        row[`${ns}.${k}`] = m[k];
      });
    });
    return row;
  });

  // Compute summary row
  const summaryAvg = { label: "Average", id: "avg" };
  const summaryStd = { label: "Std Dev (variability)", id: "std" };
  columns.forEach(({ key }) => {
    const vals = dataRows.map((r) => r[key]);
    summaryAvg[key] = avg(vals);
    summaryStd[key] = stddev(vals);
  });

  // Compute extremes per column
  const colExtremes = {};
  columns.forEach(({ key, metric }) => {
    const vals = dataRows.map((r) => r[key]);
    colExtremes[key] = extremes(vals);
  });

  function cellColor(key, val, metric) {
    if (val === "-") return COLORS.text;
    const { min, max } = colExtremes[key] || {};
    const num = Number(val);
    if (metric === "D") {
      // lower D is better
      if (num === min) return COLORS.good;
      if (num === max) return COLORS.bad;
    } else if (metric === "Cohesion") {
      // higher cohesion is better
      if (num === max) return COLORS.good;
      if (num === min) return COLORS.bad;
    }
    return COLORS.text;
  }

  // Best experiment = lowest avg D + highest avg Cohesion → score
  function score(row) {
    let s = 0;
    namespaces.forEach((ns) => {
      const d = Number(row[`${ns}.D`]);
      const c = Number(row[`${ns}.Cohesion`]);
      if (!isNaN(d)) s -= d;
      if (!isNaN(c)) s += c;
    });
    return s;
  }

  const scores = dataRows.map((r) => ({ id: r.id, s: score(r) }));
  const bestId = scores.length ? scores.reduce((a, b) => (b.s > a.s ? b : a)).id : null;
  const worstId = scores.length ? scores.reduce((a, b) => (b.s < a.s ? b : a)).id : null;

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Comparison
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.accent, marginTop: 2 }}>
              {category}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Legend */}
            {[
              { color: COLORS.good, label: "Best" },
              { color: COLORS.bad, label: "Worst" },
              { color: COLORS.mid, label: "Experiment row" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, color: COLORS.muted }}>{label}</span>
              </div>
            ))}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                color: COLORS.muted,
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: COLORS.muted }}>
              Loading experiments…
            </div>
          )}
          {error && (
            <div style={{ padding: 40, textAlign: "center", color: COLORS.bad }}>
              {error}
            </div>
          )}
          {!loading && !error && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                {/* Namespace header row */}
                <tr style={{ background: "#0c1830" }}>
                  <th style={th({ textAlign: "left", minWidth: 180 })} rowSpan={2}>
                    Experiment
                  </th>
                  {namespaces.map((ns) => (
                    <th
                      key={ns}
                      colSpan={METRIC_KEYS.length}
                      style={{
                        ...th({ textAlign: "center" }),
                        color: COLORS.accent,
                        borderLeft: `2px solid ${COLORS.border}`,
                      }}
                    >
                      {ns}
                    </th>
                  ))}
                </tr>
                {/* Metric header row */}
                <tr style={{ background: "#0c1830" }}>
                  {namespaces.flatMap((ns) =>
                    METRIC_KEYS.map((m, i) => (
                      <th
                        key={`${ns}-${m}`}
                        style={{
                          ...th({ textAlign: "center" }),
                          borderLeft: i === 0 ? `2px solid ${COLORS.border}` : undefined,
                        }}
                      >
                        {m}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row) => {
                  const isBest = row.id === bestId;
                  const isWorst = row.id === worstId;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: isBest
                          ? "rgba(74,222,128,0.07)"
                          : isWorst
                          ? "rgba(248,113,113,0.07)"
                          : "transparent",
                        borderLeft: isBest
                          ? `3px solid ${COLORS.good}`
                          : isWorst
                          ? `3px solid ${COLORS.bad}`
                          : "3px solid transparent",
                      }}
                    >
                      <td style={{ ...td({ textAlign: "left" }), color: COLORS.mid, fontWeight: 600 }}>
                        {row.label}
                        {isBest && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.good, fontWeight: 700 }}>
                            ★ BEST
                          </span>
                        )}
                        {isWorst && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.bad, fontWeight: 700 }}>
                            ↓ WORST
                          </span>
                        )}
                      </td>
                      {namespaces.flatMap((ns, nsi) =>
                        METRIC_KEYS.map((m, mi) => {
                          const key = `${ns}.${m}`;
                          const val = row[key];
                          return (
                            <td
                              key={key}
                              style={{
                                ...td({
                                  borderLeft: mi === 0 ? `2px solid ${COLORS.border}` : undefined,
                                }),
                                color: cellColor(key, val, m),
                                fontWeight: cellColor(key, val, m) !== COLORS.text ? 700 : 400,
                              }}
                            >
                              {val}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}

                {/* Divider */}
                <tr>
                  <td
                    colSpan={1 + columns.length}
                    style={{ padding: 0, borderBottom: `2px solid ${COLORS.accent}` }}
                  />
                </tr>

                {/* Average row */}
                <tr style={{ background: "rgba(14,165,233,0.08)" }}>
                  <td style={{ ...td({ textAlign: "left" }), color: COLORS.accent, fontWeight: 700 }}>
                    Average
                  </td>
                  {columns.map(({ key, metric }, i) => (
                    <td
                      key={key}
                      style={{
                        ...td({ borderLeft: i % METRIC_KEYS.length === 0 ? `2px solid ${COLORS.border}` : undefined }),
                        color: COLORS.accent,
                        fontWeight: 600,
                      }}
                    >
                      {summaryAvg[key]}
                    </td>
                  ))}
                </tr>

                {/* Std Dev row */}
                <tr style={{ background: "rgba(14,165,233,0.04)" }}>
                  <td style={{ ...td({ textAlign: "left" }), color: COLORS.muted, fontStyle: "italic" }}>
                    Std Dev (variability)
                  </td>
                  {columns.map(({ key }, i) => (
                    <td
                      key={key}
                      style={{
                        ...td({ borderLeft: i % METRIC_KEYS.length === 0 ? `2px solid ${COLORS.border}` : undefined }),
                        color: COLORS.muted,
                        fontStyle: "italic",
                      }}
                    >
                      {summaryStd[key]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}