import { encode } from "plantuml-encoder";

export default function VisualizationPanel({ uml }) {

  if (!uml) return <div>No diagram available</div>;

  const encoded = encode(uml);
  const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;

  return (
    <div
      style={{
        flex: 1,
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 10,
        background: "#fafafa",
        overflow: "auto",
        maxHeight: 400,
        display: "flex",
        justifyContent: "center"
      }}
    >
      <img src={url} alt="PlantUML Diagram" style={{ maxWidth: "100%" }} />
    </div>
  );
}