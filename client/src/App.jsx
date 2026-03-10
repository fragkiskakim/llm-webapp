import { Link, Routes, Route, Navigate } from "react-router-dom";
import PromptPage from "./PromptPage.jsx";
import HistoryPage from "./HistoryPage.jsx";
import DatabasePage from "./DatabasePage.jsx";
import NewProjectPage from "./NewProjectPage.jsx";
import NewPage from "./NewPage.jsx";
import Header from "./Header.jsx";
import RunPage from "./dcc_project/RunPage.jsx";
import RepeatedVisualizations from "./dcc_project/repeated/RepeatedVisualizations.jsx";
import RepeatedResults from "./dcc_project/repeated/RepeatedResults.jsx";
import MultiTurnPage from "./dcc_project/MultiTurnPage.jsx";






export default function App() {
  return (
    <div style={{ fontFamily: "system-ui" }}>

      {/* <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Link to="/">Prompt</Link>
        <Link to="/history">History</Link>
        <Link to="/database">Database</Link>
        <Link to="/new">New</Link>
      </div> */}

      <Header />

      <div style={{ maxWidth: 1100, margin: "40px auto" }}>
        <Routes>
          <Route path="/" element={<PromptPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/database" element={<DatabasePage />} />
          <Route path="/new" element={<NewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/new_project" element={<NewProjectPage />} />
          <Route path="/dcc_project" element={<Navigate to="/dcc_project/run" replace />} />
          <Route path="/dcc_project/run" element={<RunPage />} />
          <Route path="/dcc_project/repeated" element={<Navigate to="/dcc_project/repeated/results" replace />} />
          <Route path="/dcc_project/repeated/results" element={<RepeatedResults />} />
          <Route path="/dcc_project/repeated/visualizations" element={<RepeatedVisualizations />} />
          <Route path="/dcc_project/multiturn" element={<MultiTurnPage />} />
        </Routes>
      </div>

    </div>
  );
}


