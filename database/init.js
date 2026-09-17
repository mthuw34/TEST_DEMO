const { run, get, all, exec } = require('./db');
const { units, seededName, provinces, doctorCountForUnit } = require('./hospitalSeed');
const { normalizeExperience, normalizeQualification, qualificationForSeed } = require('../services/DoctorQualificationPolicy');
const { DEFAULT_PATIENT_COUNT } = require('../config');

// Chèn dữ liệu theo lô để seed nhanh hàng chục nghìn bệnh nhân.
async function bulkInsert(table, columns, rows, batchSize = 100) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const oneRow = `(${columns.map(() => '?').join(',')})`;
    const placeholders = batch.map(() => oneRow).join(',');
    await run(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      batch.flat()
    );
  }
}

function regularShiftRows(doctorId, doctorIndex) {
  const rows = [];
  // Mỗi bác sĩ demo làm 5 ngày/tuần, nghỉ 2 ngày luân phiên.
  // Nhờ lệch ngày nghỉ theo doctorIndex nên mỗi chuyên ngành vẫn có người trực hằng ngày.
  const offDay1 = (doctorIndex * 2) % 7;
  const offDay2 = (offDay1 + 1) % 7;
  for (let day = 0; day <= 6; day += 1) {
    if (day === offDay1 || day === offDay2) continue;
    rows.push([doctorId, day, '07:30', '11:30', 1]);
    rows.push([doctorId, day, '13:00', '17:00', 1]);
  }
  return rows;
}

function twentyFourHourShiftRows(doctorId, doctorIndex) {
  const rows = [];
  // Khoa 24/7 chia 3 ca 8 tiếng; mỗi bác sĩ làm 5 ngày/tuần.
  const shiftNo = doctorIndex % 3;
  const ranges = [
    ['00:00', '08:00'],
    ['08:00', '16:00'],
    ['16:00', '23:59']
  ];
  const offDay1 = (doctorIndex * 2) % 7;
  const offDay2 = (offDay1 + 1) % 7;
  const [start, end] = ranges[shiftNo];
  for (let day = 0; day <= 6; day += 1) {
    if (day === offDay1 || day === offDay2) continue;
    rows.push([doctorId, day, start, end, 1]);
  }
  return rows;
}

async function initDatabase() {
  await exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  // ---------------------------------------------------------------------------
  // KHOA / CHUYÊN NGÀNH
  // ---------------------------------------------------------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS hospital_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_code TEXT NOT NULL,
      block_name TEXT NOT NULL,
      department_name TEXT NOT NULL,
      unit_code TEXT UNIQUE NOT NULL,
      specialty_name TEXT NOT NULL,
      unit_type TEXT NOT NULL,
      queue_enabled INTEGER NOT NULL DEFAULT 1,
      busy_level INTEGER NOT NULL DEFAULT 1,
      is_24_7 INTEGER NOT NULL DEFAULT 0,
      open_time TEXT NOT NULL DEFAULT '07:30',
      lunch_start TEXT NOT NULL DEFAULT '11:30',
      lunch_end TEXT NOT NULL DEFAULT '13:00',
      close_time TEXT NOT NULL DEFAULT '17:00',
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // ---------------------------------------------------------------------------
  // BÁC SĨ + LỊCH TRỰC
  // room_code là phòng hệ thống tự gán thông qua bác sĩ.
  // Người bệnh không được chọn doctor/room ở bước check-in.
  // ---------------------------------------------------------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      birth_year INTEGER,
      gender TEXT,
      phone TEXT,
      email TEXT,
      unit_id INTEGER NOT NULL,
      specialty TEXT NOT NULL,
      room_code TEXT NOT NULL,
      qualification TEXT,
      years_experience INTEGER NOT NULL DEFAULT 1,
      max_queue INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      status_note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(unit_id) REFERENCES hospital_units(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS doctor_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    )
  `);

  // ---------------------------------------------------------------------------
  // BỆNH NHÂN
  // ---------------------------------------------------------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      birth_year INTEGER,
      phone TEXT,
      gender TEXT,
      address TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // ---------------------------------------------------------------------------
  // LƯỢT KHÁM
  // Dấu hiệu sinh tồn được đo/nhập TRƯỚC khi vào phòng bác sĩ.
  // BMI được hệ thống tính từ cân nặng + chiều cao.
  // ---------------------------------------------------------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL,
      doctor_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      room_code TEXT NOT NULL,
      base_priority INTEGER NOT NULL CHECK(base_priority BETWEEN 1 AND 5),
      priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 5),
      check_in_at TEXT NOT NULL,
      status TEXT NOT NULL,
      aging_promotions INTEGER NOT NULL DEFAULT 0,
      served_counter_at_checkin INTEGER NOT NULL DEFAULT 0,
      called_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      no_show_at TEXT,
      cancel_reason TEXT,
      height_cm REAL,
      weight_kg REAL,
      bmi REAL,
      blood_pressure TEXT,
      pulse INTEGER,
      temperature REAL,
      respiratory_rate INTEGER,
      spo2 REAL,
      FOREIGN KEY(patient_code) REFERENCES patients(patient_code),
      FOREIGN KEY(doctor_id) REFERENCES doctors(id),
      FOREIGN KEY(unit_id) REFERENCES hospital_units(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS doctor_stats (
      doctor_id INTEGER PRIMARY KEY,
      served_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id)
    )
  `);

  // ---------------------------------------------------------------------------
  // BỆNH ÁN ĐÃ HOÀN THÀNH
  // ---------------------------------------------------------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_code TEXT UNIQUE NOT NULL,
      visit_id INTEGER UNIQUE,
      patient_code TEXT NOT NULL,
      doctor_id INTEGER,
      unit_id INTEGER,
      chief_complaint TEXT,
      history TEXT,
      allergies TEXT,
      vital_signs_json TEXT,
      clinical_exam TEXT,
      diagnosis TEXT,
      icd_code TEXT,
      lab_summary TEXT,
      imaging_summary TEXT,
      treatment TEXT,
      prescription TEXT,
      advice TEXT,
      follow_up TEXT,
      created_at TEXT NOT NULL,
      markdown_path TEXT,
      json_path TEXT,
      FOREIGN KEY(visit_id) REFERENCES visits(id),
      FOREIGN KEY(patient_code) REFERENCES patients(patient_code),
      FOREIGN KEY(doctor_id) REFERENCES doctors(id),
      FOREIGN KEY(unit_id) REFERENCES hospital_units(id)
    )
  `);

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code);
    CREATE INDEX IF NOT EXISTS idx_visits_doctor_status ON visits(doctor_id, status);
    CREATE INDEX IF NOT EXISTS idx_visits_unit_status ON visits(unit_id, status);
    CREATE INDEX IF NOT EXISTS idx_visits_patient_status ON visits(patient_code, status);
    CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient_code);
    CREATE INDEX IF NOT EXISTS idx_doctor_shifts_day ON doctor_shifts(doctor_id, day_of_week, active);
  `);

  // ---------------------------------------------------------------------------
  // SEED KHOA / CHUYÊN NGÀNH
  // ---------------------------------------------------------------------------
  const unitCount = await get('SELECT COUNT(*) AS count FROM hospital_units');
  if (!unitCount.count) {
    const rows = units.map((u) => [
      u.blockCode, u.blockName, u.parentGroup, u.unitCode, u.unitName,
      u.unitType, u.queueEnabled, u.busyLevel, u.is24Hours,
      u.openTime, u.lunchStart, u.lunchEnd, u.closeTime, 1
    ]);
    await bulkInsert('hospital_units', [
      'block_code', 'block_name', 'department_name', 'unit_code', 'specialty_name',
      'unit_type', 'queue_enabled', 'busy_level', 'is_24_7',
      'open_time', 'lunch_start', 'lunch_end', 'close_time', 'active'
    ], rows);
  }

  // ---------------------------------------------------------------------------
  // SEED BÁC SĨ
  // ---------------------------------------------------------------------------
  const doctorCount = await get('SELECT COUNT(*) AS count FROM doctors');
  if (!doctorCount.count) {
    const dbUnits = await all('SELECT * FROM hospital_units WHERE queue_enabled = 1 ORDER BY id');
    let serial = 1;
    const doctorRows = [];

    for (const unit of dbUnits) {
      const source = units.find((item) => item.unitCode === unit.unit_code);
      const count = doctorCountForUnit(source);
      for (let i = 1; i <= count; i += 1) {
        const code = `BS${String(serial).padStart(4, '0')}`;

        // Sinh tuổi đa dạng từ 28-61, sau đó suy ra kinh nghiệm.
        // Không sinh kinh nghiệm độc lập với tuổi để tránh dữ liệu vô lý.
        const currentYear = new Date().getFullYear();
        const age = 28 + ((serial * 7) % 34);
        const birthYear = currentYear - age;
        const maxExperience = Math.max(0, age - 28);

        // Giả định phần lớn bác sĩ bắt đầu hành nghề quanh 28 tuổi,
        // có thể gián đoạn 0-3 năm. Vì vậy kinh nghiệm gần với tuổi nghề thực tế.
        const gapYears = maxExperience > 0 ? (serial % Math.min(4, maxExperience + 1)) : 0;
        const yearsExperience = normalizeExperience(age, maxExperience - gapYears);
        const qualification = qualificationForSeed(age, yearsExperience, serial);

        const roomCode = `${unit.unit_code}-P${String(i).padStart(2, '0')}`;
        const maxQueue = unit.busy_level >= 3 ? 50 : unit.busy_level === 2 ? 40 : 30;
        doctorRows.push([
          code,
          `BS. ${seededName(serial + 500)}`,
          birthYear,
          serial % 2 ? 'Nam' : 'Nữ',
          `09${String(10000000 + serial).slice(-8)}`,
          `${code.toLowerCase()}@hospital.local`,
          unit.id,
          unit.specialty_name,
          roomCode,
          qualification,
          yearsExperience,
          maxQueue,
          'AVAILABLE',
          null,
          1
        ]);
        serial += 1;
      }
    }

    await bulkInsert('doctors', [
      'doctor_code', 'full_name', 'birth_year', 'gender', 'phone', 'email',
      'unit_id', 'specialty', 'room_code', 'qualification', 'years_experience',
      'max_queue', 'status', 'status_note', 'active'
    ], doctorRows, 80);
  }

  // Chuẩn hóa cả dữ liệu bác sĩ đã tồn tại trong hospital.db.
  // Không cần reset database; mỗi lần server khởi động, hệ thống tự sửa:
  // - kinh nghiệm vượt quá tuổi - 28;
  // - học vị quá cao so với tuổi/kinh nghiệm.
  const existingDoctors = await all('SELECT id, birth_year, qualification, years_experience FROM doctors');
  for (const doctor of existingDoctors) {
    const age = new Date().getFullYear() - Number(doctor.birth_year);
    const safeExperience = normalizeExperience(age, doctor.years_experience);
    const safeQualification = normalizeQualification(age, safeExperience, doctor.qualification);
    if (safeExperience !== doctor.years_experience || safeQualification !== doctor.qualification) {
      await run(
        'UPDATE doctors SET years_experience = ?, qualification = ? WHERE id = ?',
        [safeExperience, safeQualification, doctor.id]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // SEED LỊCH TRỰC
  // ---------------------------------------------------------------------------
  const shiftCount = await get('SELECT COUNT(*) AS count FROM doctor_shifts');
  if (!shiftCount.count) {
    const doctors = await all(`
      SELECT d.id, d.unit_id, u.is_24_7
      FROM doctors d
      JOIN hospital_units u ON u.id = d.unit_id
      ORDER BY d.unit_id, d.id
    `);

    const rows = [];
    const indexByUnit = new Map();
    for (const doctor of doctors) {
      const idx = indexByUnit.get(doctor.unit_id) || 0;
      indexByUnit.set(doctor.unit_id, idx + 1);
      rows.push(...(doctor.is_24_7 ? twentyFourHourShiftRows(doctor.id, idx) : regularShiftRows(doctor.id, idx)));
    }
    await bulkInsert('doctor_shifts', ['doctor_id', 'day_of_week', 'start_time', 'end_time', 'active'], rows, 100);
  }

  // ---------------------------------------------------------------------------
  // SEED 20.000 BỆNH NHÂN
  // ---------------------------------------------------------------------------
  const patientCount = await get('SELECT COUNT(*) AS count FROM patients');
  if (!patientCount.count) {
    console.log(`Đang tạo ${DEFAULT_PATIENT_COUNT.toLocaleString('vi-VN')} bệnh nhân mẫu...`);
    const now = new Date().toISOString();
    const rows = [];
    for (let i = 1; i <= DEFAULT_PATIENT_COUNT; i += 1) {
      rows.push([
        `BN${String(i).padStart(6, '0')}`,
        seededName(i),
        1945 + (i % 75),
        `0${String(900000000 + (i % 99999999)).slice(0, 9)}`,
        i % 2 === 0 ? 'Nam' : 'Nữ',
        provinces[i % provinces.length],
        now
      ]);
    }
    await bulkInsert('patients', [
      'patient_code', 'full_name', 'birth_year', 'phone', 'gender', 'address', 'created_at'
    ], rows, 100);
    console.log('Đã tạo xong dữ liệu bệnh nhân mẫu.');
  }

  await run(`
    INSERT OR IGNORE INTO doctor_stats (doctor_id, served_count)
    SELECT id, 0 FROM doctors
  `);
}

module.exports = initDatabase;
