import { NavLink } from "react-router-dom";

export default function RepeatedTabs() {

  const tabStyle = ({ isActive }) => ({
    padding: "8px 16px",
    textDecoration: "none",
    color: "#333",
    borderBottom: isActive ? "2px solid #555" : "2px solid #ccc",
    fontWeight: isActive ? "600" : "400"
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 40,
        marginTop: 30
      }}
    >
      <NavLink to="/dcc_project/repeated/results" style={tabStyle}>
        Results
      </NavLink>

      <NavLink to="/dcc_project/repeated/visualizations" style={tabStyle}>
        Visualizations
      </NavLink>
    </div>
  );
}