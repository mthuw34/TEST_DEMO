const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Node 22+ có SQLite tích hợp sẵn qua node:sqlite.
// Vì vậy project KHÔNG cần cài package sqlite3 native nữa.
const dbPath = path.join(__dirname, 'hospital.db');
const db = new DatabaseSync(dbPath);

// Giữ API async giống bản cũ để server.js dễ đọc.
async function run(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return {
    id: Number(result.lastInsertRowid || 0),
    changes: Number(result.changes || 0)
  };
}

async function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params) || null;
}

async function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params) || [];
}

async function exec(sql) {
  db.exec(sql);
}

module.exports = { db, dbPath, run, get, all, exec };
