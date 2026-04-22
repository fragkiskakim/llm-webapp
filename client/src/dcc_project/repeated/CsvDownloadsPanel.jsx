import React from "react";

const ARCHITECTURES = [
  { key: "client-server", label: "Client-Server" },
  { key: "3tier", label: "3-Tier" },
  { key: "microservices", label: "Microservices" },
  { key: "mvc", label: "MVC" },
];

export default function CsvDownloadsPanel() {
  const handleDownload = async (architecture, aggregated = false) => {
    try {
      const endpoint = aggregated
        ? `/api/export-csv-aggregated?architecture=${encodeURIComponent(architecture)}`
        : `/api/export-csv?architecture=${encodeURIComponent(architecture)}`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Failed to download CSV for ${architecture}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = aggregated
        ? `${architecture}_aggregated_export.csv`
        : `${architecture}_export.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(`Error downloading ${architecture} CSV.`);
    }
  };

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>CSV Exports</h2>
      <p style={styles.subtitle}>
        Download raw or aggregated CSV files for each architecture.
      </p>

      <div style={styles.grid}>
        {ARCHITECTURES.map((arch) => (
          <div key={arch.key} style={styles.card}>
            <div style={styles.cardTitle}>{arch.label}</div>

            <div style={styles.buttonRow}>
              <button
                style={styles.button}
                onClick={() => handleDownload(arch.key, false)}
              >
                Download Raw CSV
              </button>

              <button
                style={styles.secondaryButton}
                onClick={() => handleDownload(arch.key, true)}
              >
                Download Aggregated CSV
              </button>
            </div>
          </div>
        ))}
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
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  card: {
    border: "1px solid #e3e3e3",
    borderRadius: "10px",
    padding: "16px",
    background: "#fafafa",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    marginBottom: "14px",
    color: "#222",
  },
  buttonRow: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  button: {
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    background: "#222",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
  },
  secondaryButton: {
    border: "1px solid #bbb",
    borderRadius: "8px",
    padding: "10px 14px",
    background: "#fff",
    color: "#222",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
  },
};