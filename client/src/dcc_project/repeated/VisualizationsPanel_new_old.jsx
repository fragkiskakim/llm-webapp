import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const COLORS = {
  client: "#4E79A7",
  server: "#F28E2B",

  business: "#4E79A7",
  data: "#59A14F",
  presentation: "#E15759",

  model: "#4E79A7",
  view: "#F28E2B",
  controller: "#76B7B2",

  avg: "#B07AA1",
};

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>{title}</h3>
      {subtitle ? <p style={styles.chartSubtitle}>{subtitle}</p> : null}
      <div style={styles.chartBody}>{children}</div>
    </div>
  );
}

export default function VisualizationsPanel() {
  const [data, setData] = useState({
    "client-server": [],
    "3tier": [],
    mvc: [],
    microservices: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API}/api/chart-cohesion-by-model`);
        if (!res.ok) {
          throw new Error("Failed to fetch cohesion chart data");
        }

        const json = await res.json();
        setData({
          "client-server": Array.isArray(json["client-server"]) ? json["client-server"] : [],
          "3tier": Array.isArray(json["3tier"]) ? json["3tier"] : [],
          mvc: Array.isArray(json["mvc"]) ? json["mvc"] : [],
          microservices: Array.isArray(json["microservices"]) ? json["microservices"] : [],
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={styles.panel}>
        <h2 style={styles.title}>Comparative Visualizations</h2>
        <p style={styles.subtitle}>Loading chart data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.panel}>
        <h2 style={styles.title}>Comparative Visualizations</h2>
        <p style={{ ...styles.subtitle, color: "#b00020" }}>
          Failed to load charts: {error}
        </p>
      </div>
    );
  }

   return (
    <div style={styles.panel}>
      <h2 style={styles.title}>Comparative Visualizations</h2>
      <p style={styles.subtitle}>
        Average cohesion per namespace, grouped by LLM model, separately for each architecture.
      </p>

      <div style={styles.grid}>
        <ChartCard
          title="Client-Server"
          subtitle="Average cohesion of Client and Server per LLM model"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data["client-server"]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Client" name="Client Cohesion" fill={COLORS.client} />
              <Bar dataKey="Server" name="Server Cohesion" fill={COLORS.server} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="3-Tier"
          subtitle="Average cohesion of Business, Data, and Presentation per LLM model"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data["3tier"]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Business" name="Business Cohesion" fill={COLORS.business} />
              <Bar dataKey="Data" name="Data Cohesion" fill={COLORS.data} />
              <Bar
                dataKey="Presentation"
                name="Presentation Cohesion"
                fill={COLORS.presentation}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="MVC"
          subtitle="Average cohesion of Model, View, and Controller per LLM model"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data["mvc"]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Model" name="Model Cohesion" fill={COLORS.model} />
              <Bar dataKey="View" name="View Cohesion" fill={COLORS.view} />
              <Bar
                dataKey="Controller"
                name="Controller Cohesion"
                fill={COLORS.controller}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Microservices"
          subtitle="Average of average namespace cohesion per LLM model"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data["microservices"]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="AvgCohesion" name="Average Cohesion" fill={COLORS.avg} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

const styles = {
  panel: {
    background: "#fff",
    border: "1px solid #d9d9d9",
    borderRadius: "12px",
    padding: "24px 28px",
    marginTop: "24px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  title: {
    margin: 0,
    marginBottom: "8px",
    fontSize: "20px",
    fontWeight: 700,
    color: "#111",
  },
  subtitle: {
    margin: 0,
    marginBottom: "20px",
    fontSize: "14px",
    color: "#555",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
    gap: "18px",
  },
  chartCard: {
    border: "1px solid #e3e3e3",
    borderRadius: "10px",
    background: "#fafafa",
    padding: "16px",
  },
  chartTitle: {
    margin: 0,
    marginBottom: "6px",
    fontSize: "16px",
    fontWeight: 600,
  },
  chartSubtitle: {
    margin: 0,
    marginBottom: "12px",
    fontSize: "13px",
    color: "#666",
  },
  chartBody: {
    width: "100%",
    height: "300px",
  },
};