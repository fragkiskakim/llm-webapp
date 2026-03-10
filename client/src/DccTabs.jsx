import { NavLink } from "react-router-dom";

export default function DccTabs() {

  const tabStyle = ({ isActive }) => ({
    padding: "8px 14px",
    textDecoration: "none",
    color: "#333",
    borderBottom: isActive ? "2px solid #555" : "2px solid #ccc",
    fontWeight: isActive ? "600" : "400",
    transition: "all 0.2s"
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
      <NavLink to="/dcc_project/run" style={tabStyle}>
        Run experiment
      </NavLink>

      <NavLink to="/dcc_project/repeated" style={tabStyle}>
        Repeated Analysis
      </NavLink>

      <NavLink to="/dcc_project/multiturn" style={tabStyle}>
        Multi-Turn Analysis
      </NavLink>
    </div>
  );
}