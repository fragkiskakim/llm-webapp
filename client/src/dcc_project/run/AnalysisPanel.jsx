export default function AnalysisPanel({ analysis }) {
  if (!analysis) return null;

  return (
    <div>

      <div style={{ marginBottom: 10 }}>
        <b>Total Score:</b>
        <div style={scoreBox}>{analysis.total}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <b>Maximum Score:</b>
        <div style={scoreBox}>{analysis.max}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <b>Minimum Score:</b>
        <div style={scoreBox}>{analysis.min}</div>
      </div>

      <div>
        <b>Basic Problems:</b>
        <div style={problemBox}>{analysis.problem}</div>
      </div>
    </div>
  );
}

const scoreBox = {
  background: "#eee",
  borderRadius: 10,
  padding: "6px 10px",
  marginTop: 5,
  width: 80,
  textAlign: "center"
};

const problemBox = {
  background: "#eee",
  borderRadius: 10,
  padding: 10,
  marginTop: 5
};