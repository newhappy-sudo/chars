// lib/db.js
// Shared PostgreSQL connection pool

import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false,
      max: 20, // Maximum number of clients
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err);
    });
    
    console.log('[DB] PostgreSQL pool created');
  }
  
  return pool;
}

export async function query(text, params) {
  const pool = getPool();
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.log('[DB] Slow query:', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('[DB] Query error:', { text, error: error.message });
    throw error;
  }
}

export default { getPool, query };