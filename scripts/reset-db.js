// Xóa database demo để lần chạy tiếp theo seed lại dữ liệu từ đầu.
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'hospital.db');
const walPath = `${dbPath}-wal`;
const shmPath = `${dbPath}-shm`;

for (const file of [dbPath, walPath, shmPath]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

console.log('Đã xóa database demo. Chạy "npm start" để tạo lại dữ liệu.');
