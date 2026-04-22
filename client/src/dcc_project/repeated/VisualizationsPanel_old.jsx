import React, { useEffect, useMemo, useState } from "react";
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

function ChartCard({ title, children }) {
  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>{title}</h3>
      <div style={styles.chartBody}>{children}</div>
    </div>
  );
}

export default function VisualizationsPanel() {
  const [summary, setSummary] = useState({
    byArchitecture: [],
    byModelWithinArchitecture: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSummary() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API}/api/chart-summary`);
        if (!res.ok) {
          throw new Error("Failed to fetch chart summary");
        }

        const data = await res.json();

        setSummary({
          byArchitecture: Array.isArray(data.byArchitecture)
            ? data.byArchitecture
            : [],
          byModelWithinArchitecture: Array.isArray(data.byModelWithinArchitecture)
            ? data.byModelWithinArchitecture
            : [],
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  const violationsData = useMemo(() => {
    return summary.byArchitecture.map((item) => ({
      architecture: item.architecture,
      value: item.avgArchViolations ?? 0,
      runs: item.runs ?? 0,
    }));
  }, [summary]);

  const cohesionData = useMemo(() => {
    return summary.byArchitecture.map((item) => ({
      architecture: item.architecture,
      value: item.avgCohesion ?? 0,
      runs: item.runs ?? 0,
    }));
  }, [summary]);

  const distanceData = useMemo(() => {
    return summary.byArchitecture.map((item) => ({
      architecture: item.architecture,
      value: item.avgDistance ?? 0,
      runs: item.runs ?? 0,
    }));
  }, [summary]);

  const modelComparisonData = useMemo(() => {
    return summary.byModelWithinArchitecture.map((item) => ({
      label: `${item.architecture} / ${item.model}`,
      architecture: item.architecture,
      model: item.model,
      cohesion: item.avgCohesion ?? 0,
      violations: item.avgArchViolations ?? 0,
      distance: item.avgDistance ?? 0,
      runs: item.runs ?? 0,
    }));
  }, [summary]);

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
        Summary charts based on aggregated architectural analysis results.
      </p>

      <div style={styles.grid}>
        <ChartCard title="Average Architecture Violations">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={violationsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="architecture" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Avg Violations" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average Cohesion">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cohesionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="architecture" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Avg Cohesion" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average Distance from Main Sequence">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="architecture" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Avg D" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Model Comparison: Average Cohesion">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={modelComparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="cohesion" name="Avg Cohesion" />
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
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
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
    marginBottom: "12px",
    fontSize: "16px",
    fontWeight: 600,
  },
  chartBody: {
    width: "100%",
    height: "280px",
  },
};