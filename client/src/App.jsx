import { Link, Routes, Route, Navigate } from "react-router-dom";
import PromptPage from "./PromptPage.jsx";
import HistoryPage from "./HistoryPage.jsx";
import DatabasePage from "./DatabasePage.jsx";

export default function App() {
  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Link to="/">Prompt</Link>
        <Link to="/history">History</Link>
        <Link to="/database">Database</Link>
      </div>

      <Routes>
        <Route path="/" element={<PromptPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/database" element={<DatabasePage/>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
