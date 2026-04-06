export default function AnalysisPanel({ analysis }) {
  if (!analysis) return null;

  const { architecture, martin_metrics, cohesion, warnings, summary } = analysis;

  return (
    <div style={{ fontFamily: "sans-serif", fontSize: 14, width: "100%" }}>

      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={metricCard}>
          <div style={metricLabel}>Architecture</div>
          <div style={metricValue}>{architecture}</div>
        </div>
        <div style={metricCard}>
          <div style={metricLabel}>Total Warnings</div>
          <div style={{ ...metricValue, color: summary.total_warnings > 0 ? "#c0392b" : "#27ae60" }}>
            {summary.total_warnings}
          </div>
        </div>
        <div style={metricCard}>
          <div style={metricLabel}>Arch Violations</div>
          <div style={{ ...metricValue, color: summary.arch_violations > 0 ? "#c0392b" : "#27ae60" }}>
            {summary.arch_violations}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {["architecture", "martin", "cohesion"].map((key) => (
        warnings[key]?.length > 0 && (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={sectionTitle}>
              {key === "architecture" ? "Architecture Warnings" :
                key === "martin" ? "Main Sequence Warnings" :
                  "Cohesion Warnings"}
            </div>
            {warnings[key].map((w, i) => (
              <div key={i} style={{
                ...warningBox,
                background: w.startsWith("❌") ? "#fdecea" : "#fff8e1",
                borderLeft: `4px solid ${w.startsWith("❌") ? "#c0392b" : "#f39c12"}`,
              }}>
                {w}
              </div>
            ))}
          </div>
        )
      ))}

      {/* Martin Metrics Table */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Martin Metrics per Namespace</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              {["Namespace", "Ca", "Ce", "Instability (I)", "Abstractness (A)", "Distance (D)", "Classes"].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(martin_metrics).map(([ns, m]) => (
              <tr key={ns} style={{ borderBottom: "1px solid #eee" }}>
                <td style={td}><b>{ns}</b></td>
                <td style={td}>{m.ca}</td>
                <td style={td}>{m.ce}</td>
                <td style={td}>{m.instability}</td>
                <td style={td}>{m.abstractness}</td>
                <td style={{
                  ...td,
                  color: m.distance > 0.3 ? "#c0392b" : "#27ae60",
                  fontWeight: 500
                }}>
                  {m.distance}
                </td>
                <td style={td}>{m.total_classes} ({m.abstract_classes} abstract)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cohesion Table */}
      <div>
        <div style={sectionTitle}>Cohesion per Namespace</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={th}>Namespace</th>
              <th style={th}>Cohesion</th>
              <th style={th}>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(cohesion).map(([ns, c]) => (
              <tr key={ns} style={{ borderBottom: "1px solid #eee" }}>
                <td style={td}><b>{ns}</b></td>
                <td style={td}>{c}</td>
                <td style={{
                  ...td,
                  color: c < 0.3 ? "#c0392b" : c < 0.6 ? "#f39c12" : "#27ae60",
                  fontWeight: 500
                }}>
                  {c < 0.3 ? "Low" : c < 0.6 ? "Medium" : "High"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

const metricCard = {
  background: "#f5f5f5",
  borderRadius: 8,
  padding: "10px 20px",
  minWidth: 120,
  textAlign: "center",
};

const metricLabel = {
  fontSize: 11,
  color: "#888",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const metricValue = {
  fontSize: 22,
  fontWeight: 600,
};

const sectionTitle = {
  fontWeight: 600,
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#555",
  marginBottom: 8,
};

const warningBox = {
  padding: "8px 12px",
  borderRadius: 4,
  marginBottom: 6,
  fontSize: 13,
};

const th = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "#555",
};

const td = {
  padding: "7px 10px",
  color: "#333",
};