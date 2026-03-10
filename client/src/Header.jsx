import { NavLink } from "react-router-dom";
import emp_logo from "./assets/emp_logo.png";

export default function Header() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        background: "#d9a1a1",
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 1000
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src={emp_logo} alt="logo" style={{ height: 30 }} />
        <b>LLM - Architecture</b>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <NavLink
          to="/new_project"
          style={({ isActive }) => ({
            textDecoration: "none",
            color: "black",
            fontWeight: isActive ? "bold" : "normal"
          })}
        >
          New Project
        </NavLink>

        <NavLink
          to="/dcc_project"
          style={({ isActive }) => ({
            textDecoration: "none",
            color: "black",
            fontWeight: isActive ? "bold" : "normal"
          })}
        >
          DCC Project
        </NavLink>
      </div>
    </div>
  );
}