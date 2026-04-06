import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function CodePanel({ code }) {
  return (
    <div style={{
      flex: 1,
      border: "1px solid #ddd",
      borderRadius: 6,
      overflow: "auto",
      maxHeight: 350,
    }}>
      <SyntaxHighlighter
        language="cpp"
        style={oneLight}
        customStyle={{ margin: 0, borderRadius: 6, fontSize: 13 }}
        showLineNumbers
      >
        {code || ""}
      </SyntaxHighlighter>
    </div>
  );
}