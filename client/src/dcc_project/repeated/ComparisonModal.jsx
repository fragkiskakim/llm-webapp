import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ── helpers ───────────────────────────────────────────────────────────────────

function getNamespaces(results) {
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

function getArchViolations(result) {
  const v = result.architecture_analysis?.summary?.arch_violations;
  return v != null ? v : "-";
}

function getAggregateMetrics(result) {
  const mm = result.architecture_analysis?.martin_metrics || {};
  const cohesion = result.architecture_analysis?.cohesion || {};
  const nsNames = Object.keys(mm);
  if (!nsNames.length) return { numNs: 0, Ca: "-", Ce: "-", I: "-", D: "-", Cohesion: "-" };

  const avgOf = (vals) => {
    const nums = vals.filter((v) => v != null);
    return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3) : "-";
  };

  return {
    numNs: nsNames.length,
    Ca: avgOf(nsNames.map((n) => mm[n]?.ca)),
    Ce: avgOf(nsNames.map((n) => mm[n]?.ce)),
    I: avgOf(nsNames.map((n) => mm[n]?.instability)),
    D: avgOf(nsNames.map((n) => mm[n]?.distance != null ? Math.abs(mm[n].distance) : null)),
    Cohesion: avgOf(nsNames.map((n) => cohesion[n])),
  };
}

function numOrDash(v) {
  return v === "-" ? null : Number(v);
}

function avg(vals) {
  const nums = vals.map(numOrDash).filter((v) => v !== null);
  if (!nums.length) return "-";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
}

function stddev(vals) {
  const nums = vals.map(numOrDash).filter((v) => v !== null);
  if (nums.length < 2) return "-";
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length).toFixed(3);
}

function extremes(vals) {
  const nums = vals.map(numOrDash).filter((v) => v !== null);
  if (!nums.length) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function scoreRow(row, metricKeys, violKey) {
  let s = 0;
  metricKeys.forEach((key) => {
    const v = numOrDash(row[key]);
    if (v === null) return;
    if (key.includes("D")) s -= v;
    if (key.includes("Cohesion")) s += v;
  });
  const viol = numOrDash(row[violKey]);
  if (viol !== null) s -= viol * 0.5;
  return s;
}

// ── styles ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#0f172a",
  border: "#334155",
  text: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#38bdf8",
  good: "#4ade80",
  bad: "#f87171",
  mid: "#fbbf24",
};

const overlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.72)",
  backdropFilter: "blur(4px)",
  zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};

const modal = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  width: "95vw", maxWidth: 1360,
  maxHeight: "90vh",
  display: "flex", flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
};

const TH = (extra = {}) => ({
  padding: "8px 12px", fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em",
  color: C.muted, borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap", background: "#0c1830",
  ...extra,
});

const TD = (extra = {}) => ({
  padding: "8px 12px", fontSize: 13,
  color: C.text, borderBottom: `1px solid ${C.border}`,
  textAlign: "center",
  ...extra,
});

// ── CellValue ─────────────────────────────────────────────────────────────────

function CellValue({ val, metric, ext }) {
  const { min, max } = ext || {};
  const num = numOrDash(val);
  let color = C.text, bold = false;

  if (num !== null && min !== null) {
    if (metric === "D" || metric === "Violations") {
      if (num === min) { color = C.good; bold = true; }
      else if (num === max) { color = C.bad; bold = true; }
    } else if (metric === "Cohesion") {
      if (num === max) { color = C.good; bold = true; }
      else if (num === min) { color = C.bad; bold = true; }
    }
  }
  return <span style={{ color, fontWeight: bold ? 700 : 400 }}>{val}</span>;
}

function RowLabel({ label, isBest, isWorst }) {
  return (
    <td style={{ ...TD({ textAlign: "left" }), color: C.mid, fontWeight: 600 }}>
      {label}
      {isBest && <span style={{ marginLeft: 6, fontSize: 10, color: C.good, fontWeight: 700 }}>★ BEST</span>}
      {isWorst && <span style={{ marginLeft: 6, fontSize: 10, color: C.bad, fontWeight: 700 }}>↓ WORST</span>}
    </td>
  );
}

function SummaryRows({ rows, keys, violKey, colSpanFill }) {
  return (
    <>
      <tr>
        <td colSpan={colSpanFill} style={{ padding: 0, borderBottom: `2px solid ${C.accent}` }} />
      </tr>
      {rows.map((summary, si) => (
        <tr key={si} style={{ background: si === 0 ? "rgba(14,165,233,0.08)" : "rgba(14,165,233,0.04)" }}>
          <td style={{ ...TD({ textAlign: "left" }), color: si === 0 ? C.accent : C.muted, fontWeight: si === 0 ? 700 : 400, fontStyle: si === 1 ? "italic" : "normal" }}>
            {summary.label}
          </td>
          {keys.map((k, i) => (
            <td key={k} style={{ ...TD(), color: si === 0 ? C.accent : C.muted, fontStyle: si === 1 ? "italic" : "normal", borderLeft: i === 0 ? `1px solid ${C.border}` : undefined }}>
              {summary[k]}
            </td>
          ))}
          <td style={{ ...TD(), borderLeft: `2px solid ${C.border}`, color: si === 0 ? C.accent : C.muted, fontStyle: si === 1 ? "italic" : "normal" }}>
            {summary[violKey]}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Namespace view ────────────────────────────────────────────────────────────

function NamespaceTable({ results }) {
  const METRIC_KEYS = ["Ca", "Ce", "I", "D", "Cohesion"];
  const namespaces = getNamespaces(results);
  const violKey = "Violations";

  // flat list of all data keys (for extremes / avg / std)
  const allKeys = namespaces.flatMap((ns) => METRIC_KEYS.map((m) => `${ns}.${m}`));

  const dataRows = results.map((r) => {
    const row = { label: `${r.category}_${r.id}`, id: r.id };
    namespaces.forEach((ns) => {
      const m = getMetrics(r, ns);
      METRIC_KEYS.forEach((k) => { row[`${ns}.${k}`] = m[k]; });
    });
    row[violKey] = getArchViolations(r);
    return row;
  });

  const ext = {};
  allKeys.forEach((k) => { ext[k] = extremes(dataRows.map((r) => r[k])); });
  ext[violKey] = extremes(dataRows.map((r) => r[violKey]));

  const summaryAvg = { label: "Average" };
  const summaryStd = { label: "Std Dev (variability)" };
  [...allKeys, violKey].forEach((k) => {
    const vals = dataRows.map((r) => r[k]);
    summaryAvg[k] = avg(vals);
    summaryStd[k] = stddev(vals);
  });

  const scores = dataRows.map((r) => ({ id: r.id, s: scoreRow(r, allKeys, violKey) }));
  const bestId = scores.length ? scores.reduce((a, b) => b.s > a.s ? b : a).id : null;
  const worstId = scores.length ? scores.reduce((a, b) => b.s < a.s ? b : a).id : null;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={TH({ textAlign: "left", minWidth: 210 })} rowSpan={2}>Experiment</th>
          {namespaces.map((ns) => (
            <th key={ns} colSpan={METRIC_KEYS.length}
              style={{ ...TH({ textAlign: "center" }), color: C.accent, borderLeft: `2px solid ${C.border}` }}>
              {ns}
            </th>
          ))}
          <th style={{ ...TH({ textAlign: "center" }), color: C.bad, borderLeft: `2px solid ${C.border}` }} rowSpan={2}>
            Arch Violations
          </th>
        </tr>
        <tr>
          {namespaces.flatMap((ns) =>
            METRIC_KEYS.map((m, i) => (
              <th key={`${ns}-${m}`} style={{ ...TH({ textAlign: "center" }), borderLeft: i === 0 ? `2px solid ${C.border}` : undefined }}>
                {m}
              </th>
            ))
          )}
        </tr>
      </thead>
      <tbody>
        {dataRows.map((row) => {
          const isBest = row.id === bestId, isWorst = row.id === worstId;
          return (
            <tr key={row.id} style={{
              background: isBest ? "rgba(74,222,128,0.07)" : isWorst ? "rgba(248,113,113,0.07)" : "transparent",
              borderLeft: isBest ? `3px solid ${C.good}` : isWorst ? `3px solid ${C.bad}` : "3px solid transparent",
            }}>
              <RowLabel label={row.label} isBest={isBest} isWorst={isWorst} />
              {namespaces.flatMap((ns) =>
                METRIC_KEYS.map((m, i) => {
                  const key = `${ns}.${m}`;
                  return (
                    <td key={key} style={{ ...TD(), borderLeft: i === 0 ? `2px solid ${C.border}` : undefined }}>
                      <CellValue val={row[key]} metric={m} ext={ext[key]} />
                    </td>
                  );
                })
              )}
              <td style={{ ...TD(), borderLeft: `2px solid ${C.border}` }}>
                <CellValue val={row[violKey]} metric="Violations" ext={ext[violKey]} />
              </td>
            </tr>
          );
        })}
        <SummaryRows
          rows={[summaryAvg, summaryStd]}
          keys={allKeys}
          violKey={violKey}
          colSpanFill={1 + allKeys.length + 1}
        />
      </tbody>
    </table>
  );
}

// ── Aggregate view (microservices) ────────────────────────────────────────────

function AggregateTable({ results }) {
  const AGG_KEYS = ["numNs", "Ca", "Ce", "I", "D", "Cohesion"];
  const AGG_LABELS = { numNs: "# Namespaces", Ca: "Avg Ca", Ce: "Avg Ce", I: "Avg I", D: "Avg D", Cohesion: "Avg Cohesion" };
  const violKey = "Violations";

  const dataRows = results.map((r) => {
    const agg = getAggregateMetrics(r);
    return { label: `${r.category}_${r.id}`, id: r.id, ...agg, [violKey]: getArchViolations(r) };
  });

  const ext = {};
  AGG_KEYS.forEach((k) => { ext[k] = extremes(dataRows.map((r) => r[k])); });
  ext[violKey] = extremes(dataRows.map((r) => r[violKey]));

  const summaryAvg = { label: "Average" };
  const summaryStd = { label: "Std Dev (variability)" };
  [...AGG_KEYS, violKey].forEach((k) => {
    const vals = dataRows.map((r) => r[k]);
    summaryAvg[k] = avg(vals);
    summaryStd[k] = stddev(vals);
  });

  const scores = dataRows.map((r) => ({ id: r.id, s: scoreRow(r, AGG_KEYS, violKey) }));
  const bestId = scores.length ? scores.reduce((a, b) => b.s > a.s ? b : a).id : null;
  const worstId = scores.length ? scores.reduce((a, b) => b.s < a.s ? b : a).id : null;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={TH({ textAlign: "left", minWidth: 230 })}>Experiment</th>
          {AGG_KEYS.map((k) => (
            <th key={k} style={{ ...TH({ textAlign: "center" }), color: C.accent, borderLeft: `1px solid ${C.border}` }}>
              {AGG_LABELS[k]}
            </th>
          ))}
          <th style={{ ...TH({ textAlign: "center" }), color: C.bad, borderLeft: `2px solid ${C.border}` }}>
            Arch Violations
          </th>
        </tr>
      </thead>
      <tbody>
        {dataRows.map((row) => {
          const isBest = row.id === bestId, isWorst = row.id === worstId;
          return (
            <tr key={row.id} style={{
              background: isBest ? "rgba(74,222,128,0.07)" : isWorst ? "rgba(248,113,113,0.07)" : "transparent",
              borderLeft: isBest ? `3px solid ${C.good}` : isWorst ? `3px solid ${C.bad}` : "3px solid transparent",
            }}>
              <RowLabel label={row.label} isBest={isBest} isWorst={isWorst} />
              {AGG_KEYS.map((k, i) => (
                <td key={k} style={{ ...TD(), borderLeft: `1px solid ${C.border}` }}>
                  <CellValue val={String(row[k])} metric={k === "D" ? "D" : k === "Cohesion" ? "Cohesion" : k} ext={ext[k]} />
                </td>
              ))}
              <td style={{ ...TD(), borderLeft: `2px solid ${C.border}` }}>
                <CellValue val={String(row[violKey])} metric="Violations" ext={ext[violKey]} />
              </td>
            </tr>
          );
        })}
        <SummaryRows
          rows={[summaryAvg, summaryStd]}
          keys={AGG_KEYS}
          violKey={violKey}
          colSpanFill={1 + AGG_KEYS.length + 1}
        />
      </tbody>
    </table>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ComparisonModal({ category, rows, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isMicroservices = rows[0]?.architecture === "microservices";

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

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isMicroservices ? "Aggregate Comparison · Microservices" : "Namespace Comparison"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, marginTop: 2 }}>{category}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {[{ color: C.good, label: "Best" }, { color: C.bad, label: "Worst" }, { color: C.mid, label: "Experiment" }]
              .map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                </div>
              ))}
            <button onClick={onClose} style={{
              background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.muted, cursor: "pointer", padding: "4px 10px", fontSize: 18, lineHeight: 1,
            }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: "auto", flex: 1 }}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading experiments…</div>}
          {error && <div style={{ padding: 40, textAlign: "center", color: C.bad }}>{error}</div>}
          {!loading && !error && (
            isMicroservices
              ? <AggregateTable results={results} />
              : <NamespaceTable results={results} />
          )}
        </div>
      </div>
    </div>
  );
}