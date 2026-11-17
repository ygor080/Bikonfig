const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString.includes('COLE_A_')) {
    throw new Error('Configure DATABASE_URL no arquivo .env.');
}

if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
    throw new Error('DATABASE_URL inválida. Use a Connection string URI do Supabase.');
}

const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    ssl: { rejectUnauthorized: false }
});

module.exports = { pool };
