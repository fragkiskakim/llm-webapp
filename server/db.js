const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initDb() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id SERIAL PRIMARY KEY,
      prompt TEXT NOT NULL,
      response TEXT,
      cpp_code TEXT,
      uml_code TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

    await pool.query(`ALTER TABLE prompts ADD COLUMN IF NOT EXISTS cpp_code TEXT;`);
    await pool.query(`ALTER TABLE prompts ADD COLUMN IF NOT EXISTS uml_code TEXT;`);
}

module.exports = { pool, initDb };
