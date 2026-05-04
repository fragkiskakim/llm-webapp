const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS run_experiments (
            id                    SERIAL PRIMARY KEY,
            created_at            TIMESTAMP DEFAULT NOW(),
            category              TEXT,
            architecture          TEXT NOT NULL,
            model                 TEXT NOT NULL,
            prompt_type           TEXT NOT NULL,
            temperature           TEXT NOT NULL,
            prompt                TEXT,
            response              TEXT,
            cpp_code              TEXT,
            uml_produced          TEXT,
            graph_json            JSONB,
            cpp_metrics           JSONB,
            architecture_analysis JSONB
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS prompt_experiment (
            name        TEXT PRIMARY KEY,
            prompt_part TEXT NOT NULL
        );
    `);
}

module.exports = { pool, initDb };