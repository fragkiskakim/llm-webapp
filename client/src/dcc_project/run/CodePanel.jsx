export default function CodePanel({ code }) {
  return (
    <div
      style={{
        flex: 1,
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 10,
        background: "#fafafa",
        overflow: "auto",
        maxHeight: 350
      }}
    >
      <pre style={{ margin: 0 }}>{code}</pre>
    </div>
  );
}