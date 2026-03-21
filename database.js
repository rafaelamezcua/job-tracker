const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function init() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            name TEXT
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            userId INTEGER NOT NULL,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL,
            date TEXT NOT NULL
        )
    `);
    await pool.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS url TEXT`);
    await pool.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_date TEXT`);
    await pool.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS tags TEXT`);
    await pool.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS salary TEXT`);
}

init();

module.exports = pool;