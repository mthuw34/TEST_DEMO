const MiniApp = require('./services/MiniApp');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const initDatabase = require('./database/init');
const { run, get, all } = require('./database/db');
const state = require('./services/ClinicState');
const { evaluateUnitAvailability, isDoctorOnShift } = require('./services/ScheduleService');
const { QUALIFICATION_RULES, allowedQualifications, validateDoctorProfile } = require('./services/DoctorQualificationPolicy');
const {
  RECENT_PATIENT_LIMIT,
  AGING_AFTER_SERVED,
  AGING_AFTER_MINUTES,
  RECORD_PAGE_SIZE
} = require('./config');

const app = new MiniApp(path.join(__dirname, 'public'));
const PORT = process.env.PORT || 3000;
const RECORD_DIR = path.join(__dirname, 'Bệnh án');


// -----------------------------------------------------------------------------
// HÀM TIỆN ÍCH
// -----------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function sendError(res, status, message, extra = {}) {
  res.status(status).json({ ok: false, message, ...extra });
}

function safeText(value, fallback = 'Chưa ghi nhận') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function calculateBMI(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm) / 100;
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null;
  return Number((weight / (height * height)).toFixed(2));
}

function isValidDoctorPhone(phone) {
  return /^0\d{9}$/.test(String(phone || '').trim());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

async function validateDoctorShift(doctorId, day, startTime, endTime, excludeShiftId = 0) {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { ok: false, message: 'Ngày trực không hợp lệ.' };
  }
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start >= end) {
    return { ok: false, message: 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc.' };
  }
  if (end - start > 12 * 60) {
    return { ok: false, message: 'Một ca trực demo không được dài quá 12 giờ.' };
  }

  const shifts = await all(
    'SELECT id, start_time, end_time FROM doctor_shifts WHERE doctor_id = ? AND day_of_week = ? AND active = 1',
    [doctorId, day]
  );
  for (const shift of shifts) {
    if (Number(shift.id) === Number(excludeShiftId)) continue;
    const existingStart = timeToMinutes(shift.start_time);
    const existingEnd = timeToMinutes(shift.end_time);
    if (start < existingEnd && end > existingStart) {
      return { ok: false, message: `Ca trực bị trùng với ${shift.start_time}-${shift.end_time}.` };
    }
  }
  return { ok: true };
}

function toQueueItem(row) {
  return {
    visitId: row.id,
    patientCode: row.patient_code,
    patientName: row.full_name,
    doctorId: String(row.doctor_id),
    doctorName: row.doctor_name,
    unitId: String(row.unit_id),
    departmentName: row.department_name,
    unitName: row.specialty_name,
    roomCode: row.room_code,
    basePriority: row.base_priority,
    priority: row.priority,
    checkInAt: row.check_in_at,
    agingPromotions: row.aging_promotions || 0,
    servedCounterAtCheckin: row.served_counter_at_checkin || 0,
    status: row.status
  };
}

function vitalSignsFromVisit(visit) {
  return {
    heightCm: visit.height_cm ?? null,
    weightKg: visit.weight_kg ?? null,
    bmi: visit.bmi ?? null,
    bloodPressure: visit.blood_pressure ?? null,
    pulse: visit.pulse ?? null,
    temperature: visit.temperature ?? null,
    respiratoryRate: visit.respiratory_rate ?? null,
    spo2: visit.spo2 ?? null
  };
}

// -----------------------------------------------------------------------------
// DỰNG LẠI CẤU TRÚC DSA TRONG RAM TỪ SQLITE
// -----------------------------------------------------------------------------
async function rebuildState() {
  state.clear();

  const patients = await all('SELECT * FROM patients');
  for (const patient of patients) state.patientByCode.set(patient.patient_code, patient);

  const records = await all('SELECT * FROM medical_records');
  for (const record of records) state.recordByCode.set(record.record_code, record);

  const activeVisits = await all(`
    SELECT v.*, p.full_name, d.full_name AS doctor_name,
           u.department_name, u.specialty_name
    FROM visits v
    JOIN patients p ON p.patient_code = v.patient_code
    JOIN doctors d ON d.id = v.doctor_id
    JOIN hospital_units u ON u.id = v.unit_id
    WHERE v.status IN ('WAITING', 'CALLED', 'EXAMINING')
    ORDER BY v.id ASC
  `);

  for (const visit of activeVisits) {
    state.activePatient.set(visit.patient_code, visit.id);
    if (visit.status === 'WAITING') state.queueManager.add(toQueueItem(visit));
  }

  const recent = await all(`
    SELECT v.*, p.full_name, d.full_name AS doctor_name,
           u.department_name, u.specialty_name, mr.record_code
    FROM visits v
    JOIN patients p ON p.patient_code = v.patient_code
    JOIN doctors d ON d.id = v.doctor_id
    JOIN hospital_units u ON u.id = v.unit_id
    LEFT JOIN medical_records mr ON mr.visit_id = v.id
    WHERE v.status = 'COMPLETED'
    ORDER BY datetime(v.completed_at) DESC
    LIMIT ?
  `, [RECENT_PATIENT_LIMIT]);

  for (const visit of recent.reverse()) {
    const item = toQueueItem(visit);
    item.completedAt = visit.completed_at;
    item.recordCode = visit.record_code || null;
    state.recentCompleted.pushFront(item);
  }
}

// -----------------------------------------------------------------------------
// AGING - chống bệnh nhân ưu tiên thấp phải chờ vô thời hạn.
// Đây là quy tắc demo DSA, KHÔNG phải quy tắc phân loại y khoa.
// -----------------------------------------------------------------------------
async function applyAgingForDoctor(doctorId) {
  const stats = await get('SELECT served_count FROM doctor_stats WHERE doctor_id = ?', [doctorId]);
  const servedCount = stats?.served_count || 0;
  const items = state.queueManager.list(doctorId);
  const now = Date.now();

  for (const item of items) {
    const passedPatients = Math.max(0, servedCount - (item.servedCounterAtCheckin || 0));
    const waitedMinutes = Math.max(0, Math.floor((now - new Date(item.checkInAt).getTime()) / 60000));
    const byServed = Math.floor(passedPatients / AGING_AFTER_SERVED);
    const byTime = Math.floor(waitedMinutes / AGING_AFTER_MINUTES);
    const targetPromotions = Math.max(byServed, byTime, item.agingPromotions || 0);
    const targetPriority = Math.max(1, item.basePriority - targetPromotions);

    if (targetPriority !== item.priority || targetPromotions !== (item.agingPromotions || 0)) {
      await run(
        `UPDATE visits SET priority = ?, aging_promotions = ? WHERE id = ? AND status = 'WAITING'`,
        [targetPriority, targetPromotions, item.visitId]
      );
      state.queueManager.updateItem(item.visitId, {
        priority: targetPriority,
        agingPromotions: targetPromotions
      });
    }
  }
}

// -----------------------------------------------------------------------------
// LỊCH TRỰC + PHÂN BÁC SĨ TỰ ĐỘNG
// -----------------------------------------------------------------------------
async function doctorIsOnShift(doctorId, date = new Date()) {
  const shifts = await all(
    'SELECT * FROM doctor_shifts WHERE doctor_id = ? AND active = 1',
    [doctorId]
  );
  return isDoctorOnShift(shifts, date);
}

async function getDoctorLoad(doctorId) {
  const rows = await all(`
    SELECT status, COUNT(*) AS count
    FROM visits
    WHERE doctor_id = ? AND status IN ('WAITING', 'CALLED', 'EXAMINING')
    GROUP BY status
  `, [doctorId]);

  const result = { waiting: 0, called: 0, examining: 0, total: 0 };
  for (const row of rows) {
    const key = String(row.status).toLowerCase();
    if (key in result) result[key] = row.count;
    result.total += row.count;
  }
  return result;
}

// Chọn bác sĩ phù hợp nhất trong chuyên ngành đã chọn.
// Tiêu chí:
// 1) đúng chuyên ngành;
// 2) đang trong ca trực;
// 3) không BẬN/nghỉ;
// 4) chưa vượt max_queue;
// 5) ưu tiên bác sĩ có tổng tải thấp nhất.
async function autoAssignDoctor(unitId, excludeDoctorIds = []) {
  const excluded = new Set(excludeDoctorIds.map(String));
  const doctors = await all(`
    SELECT d.*, u.department_name, u.specialty_name, u.is_24_7
    FROM doctors d
    JOIN hospital_units u ON u.id = d.unit_id
    WHERE d.unit_id = ? AND d.active = 1
    ORDER BY d.id ASC
  `, [unitId]);

  const candidates = [];
  for (const doctor of doctors) {
    if (excluded.has(String(doctor.id))) continue;
    if (doctor.status === 'BUSY') continue;
    if (!(await doctorIsOnShift(doctor.id))) continue;

    const load = await getDoctorLoad(doctor.id);
    if (load.total >= doctor.max_queue) continue;

    candidates.push({
      ...doctor,
      load,
      // Bác sĩ đang rảnh được ưu tiên hơn bác sĩ đang có người trong phòng.
      score: load.total
    });
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.load.waiting !== b.load.waiting) return a.load.waiting - b.load.waiting;
    return a.id - b.id;
  });

  return candidates[0] || null;
}

// -----------------------------------------------------------------------------
// AUTO CALL
// Sau khi bệnh nhân khám xong / NO_SHOW / bác sĩ quay lại AVAILABLE,
// hệ thống tự lấy bệnh nhân ưu tiên nhất từ Heap. Không có nút "Gọi tiếp".
// -----------------------------------------------------------------------------
async function autoCallNext(doctorId) {
  const doctor = await get('SELECT * FROM doctors WHERE id = ?', [doctorId]);
  if (!doctor || !doctor.active || doctor.status === 'BUSY') return null;
  if (!(await doctorIsOnShift(doctorId))) return null;

  const current = await get(`
    SELECT id FROM visits
    WHERE doctor_id = ? AND status IN ('CALLED', 'EXAMINING')
    ORDER BY id DESC LIMIT 1
  `, [doctorId]);
  if (current) return null;

  await applyAgingForDoctor(doctorId);
  const next = state.queueManager.pop(doctorId);
  if (!next) return null;

  const calledAt = nowIso();
  await run(
    `UPDATE visits SET status = 'CALLED', called_at = ? WHERE id = ? AND status = 'WAITING'`,
    [calledAt, next.visitId]
  );

  return {
    ...next,
    status: 'CALLED',
    calledAt
  };
}

async function autoCallIdleDoctors() {
  const doctors = await all("SELECT id FROM doctors WHERE active = 1 AND status != 'BUSY'");
  for (const doctor of doctors) {
    await autoCallNext(doctor.id);
  }
}

// -----------------------------------------------------------------------------
// XUẤT BỆNH ÁN CHI TIẾT
// Dấu hiệu sinh tồn lấy từ visit (được đo trước khi bác sĩ khám),
// bác sĩ chỉ nhập nội dung chuyên môn.
// -----------------------------------------------------------------------------
async function exportMedicalRecord({ visit, patient, doctor, unit, payload, completedAt }) {
  await fsp.mkdir(RECORD_DIR, { recursive: true });

  const recordCode = `BA-${new Date(completedAt).toISOString().slice(0, 10).replaceAll('-', '')}-${String(visit.id).padStart(6, '0')}`;
  const vitalSigns = vitalSignsFromVisit(visit);

  const record = {
    recordCode,
    visitId: visit.id,
    createdAt: completedAt,
    patient: {
      code: patient.patient_code,
      fullName: patient.full_name,
      birthYear: patient.birth_year,
      gender: patient.gender,
      phone: patient.phone,
      address: patient.address
    },
    routing: {
      department: unit.department_name,
      specialty: unit.specialty_name,
      room: visit.room_code,
      doctorCode: doctor.doctor_code,
      doctorName: doctor.full_name,
      qualification: doctor.qualification
    },
    visit: {
      checkInAt: visit.check_in_at,
      calledAt: visit.called_at,
      startedAt: visit.started_at,
      completedAt,
      basePriority: visit.base_priority,
      priorityAtCompletion: visit.priority
    },
    preExamMeasurements: vitalSigns,
    clinical: {
      chiefComplaint: safeText(payload.chiefComplaint),
      history: safeText(payload.history),
      allergies: safeText(payload.allergies),
      clinicalExam: safeText(payload.clinicalExam),
      diagnosis: safeText(payload.diagnosis),
      icdCode: safeText(payload.icdCode),
      labSummary: safeText(payload.labSummary),
      imagingSummary: safeText(payload.imagingSummary),
      treatment: safeText(payload.treatment),
      prescription: safeText(payload.prescription),
      advice: safeText(payload.advice),
      followUp: safeText(payload.followUp)
    },
    note: 'Dữ liệu y khoa thực tế phải do nhân viên y tế có thẩm quyền nhập và xác nhận.'
  };

  const baseName = `${recordCode}_${patient.patient_code}`;
  const jsonPath = path.join(RECORD_DIR, `${baseName}.json`);
  const mdPath = path.join(RECORD_DIR, `${baseName}.md`);

  const md = `# BỆNH ÁN CHI TIẾT\n\n` +
`**Mã bệnh án:** ${recordCode}  \n` +
`**Mã lượt khám:** ${visit.id}  \n` +
`**Ngày lập:** ${new Date(completedAt).toLocaleString('vi-VN')}\n\n` +
`## 1. Thông tin bệnh nhân\n` +
`- Mã bệnh nhân: ${patient.patient_code}\n` +
`- Họ tên: ${patient.full_name}\n` +
`- Năm sinh: ${patient.birth_year ?? 'Chưa ghi nhận'}\n` +
`- Giới tính: ${patient.gender ?? 'Chưa ghi nhận'}\n` +
`- Số điện thoại: ${patient.phone ?? 'Chưa ghi nhận'}\n` +
`- Địa chỉ: ${patient.address ?? 'Chưa ghi nhận'}\n\n` +
`## 2. Điều phối khám\n` +
`- Khoa: ${unit.department_name}\n` +
`- Chuyên ngành: ${unit.specialty_name}\n` +
`- Phòng hệ thống phân: ${visit.room_code}\n` +
`- Bác sĩ: ${doctor.full_name} (${doctor.doctor_code})\n` +
`- Trình độ: ${doctor.qualification ?? 'Chưa ghi nhận'}\n` +
`- Check-in: ${visit.check_in_at}\n` +
`- Được gọi: ${visit.called_at ?? 'Chưa ghi nhận'}\n` +
`- Bắt đầu khám: ${visit.started_at ?? 'Chưa ghi nhận'}\n` +
`- Hoàn thành: ${completedAt}\n` +
`- Mức ưu tiên ban đầu: ${visit.base_priority}\n` +
`- Mức ưu tiên khi hoàn thành: ${visit.priority}\n\n` +
`## 3. Chỉ số đo trước khi vào phòng khám\n` +
`- Chiều cao: ${vitalSigns.heightCm ?? 'Chưa ghi nhận'} cm\n` +
`- Cân nặng: ${vitalSigns.weightKg ?? 'Chưa ghi nhận'} kg\n` +
`- BMI: ${vitalSigns.bmi ?? 'Chưa ghi nhận'}\n` +
`- Huyết áp: ${vitalSigns.bloodPressure ?? 'Chưa ghi nhận'}\n` +
`- Mạch: ${vitalSigns.pulse ?? 'Chưa ghi nhận'}\n` +
`- Nhiệt độ: ${vitalSigns.temperature ?? 'Chưa ghi nhận'} °C\n` +
`- Nhịp thở: ${vitalSigns.respiratoryRate ?? 'Chưa ghi nhận'}\n` +
`- SpO₂: ${vitalSigns.spo2 ?? 'Chưa ghi nhận'} %\n\n` +
`## 4. Nội dung chuyên môn\n` +
`- Lý do khám: ${record.clinical.chiefComplaint}\n` +
`- Bệnh sử / tiền sử: ${record.clinical.history}\n` +
`- Dị ứng: ${record.clinical.allergies}\n` +
`- Khám lâm sàng: ${record.clinical.clinicalExam}\n` +
`- Chẩn đoán: ${record.clinical.diagnosis}\n` +
`- ICD: ${record.clinical.icdCode}\n` +
`- Xét nghiệm: ${record.clinical.labSummary}\n` +
`- Chẩn đoán hình ảnh: ${record.clinical.imagingSummary}\n` +
`- Điều trị / xử trí: ${record.clinical.treatment}\n` +
`- Đơn thuốc: ${record.clinical.prescription}\n` +
`- Dặn dò: ${record.clinical.advice}\n` +
`- Hẹn tái khám: ${record.clinical.followUp}\n`;

  await fsp.writeFile(jsonPath, JSON.stringify(record, null, 2), 'utf8');
  await fsp.writeFile(mdPath, md, 'utf8');

  return { recordCode, record, jsonPath, mdPath };
}

// -----------------------------------------------------------------------------
// API: DASHBOARD / DANH MỤC
// -----------------------------------------------------------------------------
app.get('/api/metrics', async (req, res) => {
  try {
    const patients = await get('SELECT COUNT(*) AS count FROM patients');
    const doctors = await get('SELECT COUNT(*) AS count FROM doctors WHERE active = 1');
    const waiting = await get("SELECT COUNT(*) AS count FROM visits WHERE status = 'WAITING'");
    const called = await get("SELECT COUNT(*) AS count FROM visits WHERE status = 'CALLED'");
    const examining = await get("SELECT COUNT(*) AS count FROM visits WHERE status = 'EXAMINING'");
    const completed = await get("SELECT COUNT(*) AS count FROM visits WHERE status = 'COMPLETED'");
    res.json({ ok: true, patients: patients.count, doctors: doctors.count, waiting: waiting.count, called: called.count, examining: examining.count, completed: completed.count });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/catalog/departments', async (req, res) => {
  try {
    const rows = await all(`
      SELECT DISTINCT department_name
      FROM hospital_units
      WHERE queue_enabled = 1 AND active = 1
      ORDER BY department_name
    `);
    res.json({ ok: true, items: rows.map((r) => r.department_name) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/catalog/specialties', async (req, res) => {
  try {
    const department = String(req.query.department || '').trim();
    if (!department) return sendError(res, 400, 'Thiếu khoa.');
    const rows = await all(`
      SELECT * FROM hospital_units
      WHERE queue_enabled = 1 AND active = 1 AND department_name = ?
      ORDER BY specialty_name
    `, [department]);
    res.json({ ok: true, items: rows.map((u) => ({ ...u, availability: evaluateUnitAvailability(u) })) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/catalog/qualification-rules', (req, res) => {
  res.json({ ok: true, items: QUALIFICATION_RULES });
});

app.get('/api/units/:id/status', async (req, res) => {
  try {
    const unit = await get('SELECT * FROM hospital_units WHERE id = ?', [req.params.id]);
    if (!unit) return sendError(res, 404, 'Không tìm thấy chuyên ngành.');
    res.json({ ok: true, unit, availability: evaluateUnitAvailability(unit) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// -----------------------------------------------------------------------------
// API: MC1 - TRA CỨU BỆNH NHÂN
// -----------------------------------------------------------------------------
app.get('/api/patients/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const patient = state.patientByCode.get(code);
  if (!patient) return sendError(res, 404, `Không tìm thấy bệnh nhân ${code}.`);
  res.json({ ok: true, patient, activeVisitId: state.activePatient.get(code) || null });
});

// -----------------------------------------------------------------------------
// API: CHECK-IN - BỆNH NHÂN CHỈ CHỌN KHOA + CHUYÊN NGÀNH
// HỆ THỐNG TỰ PHÂN PHÒNG + BÁC SĨ.
// -----------------------------------------------------------------------------
app.post('/api/checkin', async (req, res) => {
  try {
    const patientCode = String(req.body.patientCode || '').trim().toUpperCase();
    const unitId = Number(req.body.unitId);
    const priority = Number(req.body.priority);

    const patient = state.patientByCode.get(patientCode);
    if (!patient) return sendError(res, 404, 'Không tìm thấy bệnh nhân.');
    if (state.activePatient.has(patientCode)) {
      return sendError(res, 409, 'Bệnh nhân đang có một lượt khám hoạt động. Không thể check-in trùng.');
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return sendError(res, 400, 'Mức ưu tiên phải từ 1 đến 5.');
    }

    const unit = await get('SELECT * FROM hospital_units WHERE id = ? AND queue_enabled = 1 AND active = 1', [unitId]);
    if (!unit) return sendError(res, 404, 'Khoa/chuyên ngành không hợp lệ.');

    const availability = evaluateUnitAvailability(unit);
    if (!availability.ok) {
      return sendError(res, 409, availability.message, { availability });
    }

    const heightCm = Number(req.body.heightCm);
    const weightKg = Number(req.body.weightKg);
    const bmi = calculateBMI(weightKg, heightCm);
    if (!bmi) return sendError(res, 400, 'Chiều cao và cân nặng phải là số hợp lệ để tính BMI.');

    // Bệnh nhân KHÔNG chọn bác sĩ. Hệ thống tự tìm bác sĩ đang trực và nhẹ tải nhất.
    const doctor = await autoAssignDoctor(unitId);
    if (!doctor) {
      return sendError(res, 409, 'Hiện không có bác sĩ phù hợp đang trong ca trực và có khả năng tiếp nhận.');
    }

    const stats = await get('SELECT served_count FROM doctor_stats WHERE doctor_id = ?', [doctor.id]);
    const checkInAt = nowIso();
    const result = await run(`
      INSERT INTO visits (
        patient_code, doctor_id, unit_id, room_code,
        base_priority, priority, check_in_at, status,
        served_counter_at_checkin,
        height_cm, weight_kg, bmi, blood_pressure, pulse,
        temperature, respiratory_rate, spo2
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patientCode,
      doctor.id,
      unitId,
      doctor.room_code,
      priority,
      priority,
      checkInAt,
      stats?.served_count || 0,
      heightCm,
      weightKg,
      bmi,
      safeText(req.body.bloodPressure, ''),
      req.body.pulse ? Number(req.body.pulse) : null,
      req.body.temperature ? Number(req.body.temperature) : null,
      req.body.respiratoryRate ? Number(req.body.respiratoryRate) : null,
      req.body.spo2 ? Number(req.body.spo2) : null
    ]);

    const item = {
      visitId: result.id,
      patientCode,
      patientName: patient.full_name,
      doctorId: String(doctor.id),
      doctorName: doctor.full_name,
      unitId: String(unit.id),
      departmentName: unit.department_name,
      unitName: unit.specialty_name,
      roomCode: doctor.room_code,
      basePriority: priority,
      priority,
      checkInAt,
      agingPromotions: 0,
      servedCounterAtCheckin: stats?.served_count || 0,
      status: 'WAITING'
    };

    state.activePatient.set(patientCode, result.id);
    state.queueManager.add(item);

    // Nếu bác sĩ đang rảnh, hệ thống có thể tự gọi luôn người ưu tiên nhất.
    const autoCalled = await autoCallNext(doctor.id);

    res.json({
      ok: true,
      message: 'Check-in thành công. Phòng và bác sĩ đã được hệ thống tự động phân công.',
      visitId: result.id,
      patient,
      unit,
      assigned: {
        doctorId: doctor.id,
        doctorCode: doctor.doctor_code,
        doctorName: doctor.full_name,
        roomCode: doctor.room_code
      },
      bmi,
      autoCalled
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// -----------------------------------------------------------------------------
// API: HÀNG ĐỢI + CALLED
// -----------------------------------------------------------------------------
app.get('/api/queue', async (req, res) => {
  try {
    const unitId = Number(req.query.unitId || 0);
    const params = [];
    let where = "v.status IN ('WAITING', 'CALLED')";
    if (unitId) {
      where += ' AND v.unit_id = ?';
      params.push(unitId);
    }

    const rows = await all(`
      SELECT v.*, p.full_name, p.birth_year,
             d.doctor_code, d.full_name AS doctor_name,
             u.department_name, u.specialty_name
      FROM visits v
      JOIN patients p ON p.patient_code = v.patient_code
      JOIN doctors d ON d.id = v.doctor_id
      JOIN hospital_units u ON u.id = v.unit_id
      WHERE ${where}
      ORDER BY CASE WHEN v.status = 'CALLED' THEN 0 ELSE 1 END,
               v.priority ASC, datetime(v.check_in_at) ASC
    `, params);

    res.json({ ok: true, items: rows });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// TP1: cập nhật lại mức ưu tiên của bệnh nhân đang WAITING.
app.patch('/api/visits/:id/priority', async (req, res) => {
  try {
    const visitId = Number(req.params.id);
    const newPriority = Number(req.body.priority);
    if (!Number.isInteger(newPriority) || newPriority < 1 || newPriority > 5) {
      return sendError(res, 400, 'Mức ưu tiên phải từ 1 đến 5.');
    }

    const visit = await get('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (visit.status !== 'WAITING') return sendError(res, 409, 'Chỉ có thể đổi ưu tiên khi bệnh nhân đang chờ.');

    await run(
      'UPDATE visits SET base_priority = ?, priority = ?, aging_promotions = 0 WHERE id = ?',
      [newPriority, newPriority, visitId]
    );
    state.queueManager.updateItem(visitId, {
      basePriority: newPriority,
      priority: newPriority,
      agingPromotions: 0
    });

    // Nếu bác sĩ đang rảnh thì gọi lại phần tử ưu tiên nhất sau khi Heap tái định vị.
    const autoCalled = await autoCallNext(visit.doctor_id);
    res.json({ ok: true, message: 'Đã cập nhật mức ưu tiên và tái định vị trong hàng đợi.', autoCalled });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// TP3: hủy/rút lượt ở bất kỳ vị trí nào.
app.post('/api/visits/:id/cancel', async (req, res) => {
  try {
    const visitId = Number(req.params.id);
    const visit = await get('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (!['WAITING', 'CALLED'].includes(visit.status)) {
      return sendError(res, 409, 'Chỉ có thể hủy lượt đang chờ hoặc đang được gọi.');
    }

    if (visit.status === 'WAITING') state.queueManager.remove(visitId);
    await run(
      "UPDATE visits SET status = 'CANCELLED', cancel_reason = ? WHERE id = ?",
      [safeText(req.body.reason, 'Bệnh nhân rút/hủy lượt khám'), visitId]
    );
    state.activePatient.delete(visit.patient_code);

    // Nếu đang được gọi mà hủy, bác sĩ lập tức gọi người tiếp theo.
    const autoCalled = visit.status === 'CALLED' ? await autoCallNext(visit.doctor_id) : null;
    res.json({ ok: true, message: 'Đã hủy lượt khám.', autoCalled });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// TP2: đổi bác sĩ, nhưng bệnh nhân vẫn KHÔNG tự chọn bác sĩ.
// Hệ thống tự tìm bác sĩ khác cùng chuyên ngành, giữ nguyên check-in + priority.
app.post('/api/visits/:id/transfer', async (req, res) => {
  try {
    const visitId = Number(req.params.id);
    const visit = await get('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (visit.status !== 'WAITING') return sendError(res, 409, 'Chỉ chuyển bác sĩ khi bệnh nhân đang chờ.');

    const newDoctor = await autoAssignDoctor(visit.unit_id, [visit.doctor_id]);
    if (!newDoctor) return sendError(res, 409, 'Không có bác sĩ thay thế phù hợp đang trực.');

    const oldDoctorId = visit.doctor_id;
    const removed = state.queueManager.remove(visitId);
    if (!removed) return sendError(res, 409, 'Lượt khám không còn trong hàng đợi RAM.');

    const stats = await get('SELECT served_count FROM doctor_stats WHERE doctor_id = ?', [newDoctor.id]);
    await run(`
      UPDATE visits
      SET doctor_id = ?, room_code = ?, served_counter_at_checkin = ?
      WHERE id = ?
    `, [newDoctor.id, newDoctor.room_code, stats?.served_count || 0, visitId]);

    removed.doctorId = String(newDoctor.id);
    removed.doctorName = newDoctor.full_name;
    removed.roomCode = newDoctor.room_code;
    removed.servedCounterAtCheckin = stats?.served_count || 0;
    state.queueManager.add(removed);

    const newDoctorCalled = await autoCallNext(newDoctor.id);
    const oldDoctorCalled = await autoCallNext(oldDoctorId);

    res.json({
      ok: true,
      message: 'Đã tự động chuyển sang bác sĩ thay thế, giữ nguyên mức ưu tiên và thời gian check-in.',
      assigned: { doctorId: newDoctor.id, doctorName: newDoctor.full_name, roomCode: newDoctor.room_code },
      newDoctorCalled,
      oldDoctorCalled
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// Bệnh nhân đã được gọi và thực sự bước vào phòng.
app.post('/api/visits/:id/enter', async (req, res) => {
  try {
    const visit = await get('SELECT * FROM visits WHERE id = ?', [Number(req.params.id)]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (visit.status !== 'CALLED') return sendError(res, 409, 'Lượt khám không ở trạng thái đang gọi.');

    const startedAt = nowIso();
    await run("UPDATE visits SET status = 'EXAMINING', started_at = ? WHERE id = ?", [startedAt, visit.id]);
    res.json({ ok: true, message: 'Bệnh nhân đã vào phòng khám.', startedAt });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// Không có mặt -> loại trực tiếp. Muốn khám lại phải check-in lại từ đầu.
app.post('/api/visits/:id/no-show', async (req, res) => {
  try {
    const visit = await get('SELECT * FROM visits WHERE id = ?', [Number(req.params.id)]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (visit.status !== 'CALLED') return sendError(res, 409, 'Lượt khám không ở trạng thái đang gọi.');

    await run(
      "UPDATE visits SET status = 'NO_SHOW', no_show_at = ?, cancel_reason = 'Không có mặt khi được gọi - phải check-in lại' WHERE id = ?",
      [nowIso(), visit.id]
    );
    state.activePatient.delete(visit.patient_code);

    const autoCalled = await autoCallNext(visit.doctor_id);
    res.json({ ok: true, message: 'Đã loại bệnh nhân khỏi lượt khám. Nếu quay lại phải check-in lại.', autoCalled });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// -----------------------------------------------------------------------------
// API: QUẢN LÝ BÁC SĨ
// -----------------------------------------------------------------------------
app.get('/api/doctors', async (req, res) => {
  try {
    const unitId = Number(req.query.unitId || 0);
    const department = String(req.query.department || '').trim();
    const params = [];
    const where = ['d.active = 1'];
    if (unitId) { where.push('d.unit_id = ?'); params.push(unitId); }
    if (department) { where.push('u.department_name = ?'); params.push(department); }

    const doctors = await all(`
      SELECT d.*, u.department_name, u.specialty_name, u.is_24_7,
             u.open_time, u.lunch_start, u.lunch_end, u.close_time
      FROM doctors d
      JOIN hospital_units u ON u.id = d.unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.department_name, u.specialty_name, d.full_name
    `, params);

    const items = [];
    for (const doctor of doctors) {
      const shifts = await all(
        'SELECT * FROM doctor_shifts WHERE doctor_id = ? AND active = 1 ORDER BY day_of_week, start_time',
        [doctor.id]
      );
      const load = await getDoctorLoad(doctor.id);
      const current = await get(`
        SELECT v.id, v.status, v.patient_code, p.full_name, v.started_at, v.called_at
        FROM visits v JOIN patients p ON p.patient_code = v.patient_code
        WHERE v.doctor_id = ? AND v.status IN ('CALLED', 'EXAMINING')
        ORDER BY v.id DESC LIMIT 1
      `, [doctor.id]);
      const onShift = isDoctorOnShift(shifts);
      let computedStatus = doctor.status;
      if (doctor.status === 'BUSY') computedStatus = 'BUSY';
      else if (!onShift) computedStatus = 'OFF_SHIFT';
      else if (current?.status === 'EXAMINING') computedStatus = 'EXAMINING';
      else if (current?.status === 'CALLED') computedStatus = 'CALLING';
      else computedStatus = 'AVAILABLE';

      items.push({
        ...doctor,
        age: doctor.birth_year ? new Date().getFullYear() - doctor.birth_year : null,
        onShift,
        computedStatus,
        load,
        currentPatient: current,
        shifts
      });
    }

    res.json({ ok: true, items });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.patch('/api/doctors/:id/status', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const status = String(req.body.status || '').toUpperCase();
    if (!['AVAILABLE', 'BUSY'].includes(status)) return sendError(res, 400, 'Trạng thái phải là AVAILABLE hoặc BUSY.');

    const doctor = await get('SELECT * FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) return sendError(res, 404, 'Không tìm thấy bác sĩ.');

    await run('UPDATE doctors SET status = ?, status_note = ? WHERE id = ?', [status, safeText(req.body.note, ''), doctorId]);

    // Khi bác sĩ trở lại AVAILABLE, hệ thống tự gọi người tiếp theo nếu bác sĩ đang rảnh.
    const autoCalled = status === 'AVAILABLE' ? await autoCallNext(doctorId) : null;
    res.json({ ok: true, message: status === 'BUSY' ? 'Đã đánh dấu bác sĩ bận.' : 'Bác sĩ đã trở lại trạng thái nhận bệnh.', autoCalled });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.patch('/api/doctors/:id/profile', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const doctor = await get('SELECT * FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) return sendError(res, 404, 'Không tìm thấy bác sĩ.');

    const fullName = safeText(req.body.fullName, doctor.full_name);
    const birthYear = Number(req.body.birthYear ?? doctor.birth_year);
    const gender = safeText(req.body.gender, doctor.gender);
    const phone = safeText(req.body.phone, doctor.phone);
    const email = safeText(req.body.email, doctor.email);
    const yearsExperience = Number(req.body.yearsExperience ?? doctor.years_experience);
    const qualification = safeText(req.body.qualification, doctor.qualification);

    if (fullName.length < 5 || fullName.length > 100) {
      return sendError(res, 400, 'Họ tên bác sĩ phải từ 5 đến 100 ký tự.');
    }
    if (!['Nam', 'Nữ', 'Khác'].includes(gender)) {
      return sendError(res, 400, 'Giới tính bác sĩ không hợp lệ.');
    }
    if (!isValidDoctorPhone(phone)) {
      return sendError(res, 400, 'Số điện thoại bác sĩ phải gồm 10 chữ số và bắt đầu bằng 0.');
    }
    if (!isValidEmail(email)) {
      return sendError(res, 400, 'Email bác sĩ không hợp lệ.');
    }

    // Kiểm tra đồng thời tuổi + kinh nghiệm + trình độ.
    // Ví dụ: 3 năm kinh nghiệm tuyệt đối không thể lưu trình độ Tiến sĩ trong dữ liệu demo.
    const validation = validateDoctorProfile({ birthYear, yearsExperience, qualification });
    if (!validation.ok) return sendError(res, 400, validation.message);

    await run(`
      UPDATE doctors
      SET full_name = ?, birth_year = ?, gender = ?, phone = ?, email = ?,
          qualification = ?, years_experience = ?
      WHERE id = ?
    `, [
      fullName, birthYear, gender, phone, email,
      qualification, yearsExperience, doctorId
    ]);

    res.json({ ok: true, message: 'Đã cập nhật thông tin bác sĩ.' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.post('/api/doctors/:id/shifts', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const doctor = await get('SELECT id FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) return sendError(res, 404, 'Không tìm thấy bác sĩ.');

    const day = Number(req.body.dayOfWeek);
    const startTime = String(req.body.startTime || '');
    const endTime = String(req.body.endTime || '');
    const shiftValidation = await validateDoctorShift(doctorId, day, startTime, endTime);
    if (!shiftValidation.ok) return sendError(res, 400, shiftValidation.message);

    const result = await run(
      'INSERT INTO doctor_shifts (doctor_id, day_of_week, start_time, end_time, active) VALUES (?, ?, ?, ?, 1)',
      [doctorId, day, startTime, endTime]
    );
    res.json({ ok: true, message: 'Đã thêm ca trực.', shiftId: result.id });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.patch('/api/doctors/:doctorId/shifts/:shiftId', async (req, res) => {
  try {
    const doctorId = Number(req.params.doctorId);
    const shiftId = Number(req.params.shiftId);
    const day = Number(req.body.dayOfWeek);
    const startTime = String(req.body.startTime || '');
    const endTime = String(req.body.endTime || '');
    const shiftValidation = await validateDoctorShift(doctorId, day, startTime, endTime, shiftId);
    if (!shiftValidation.ok) return sendError(res, 400, shiftValidation.message);
    await run(
      'UPDATE doctor_shifts SET day_of_week = ?, start_time = ?, end_time = ? WHERE id = ? AND doctor_id = ?',
      [day, startTime, endTime, shiftId, doctorId]
    );
    res.json({ ok: true, message: 'Đã cập nhật ca trực.' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.delete('/api/doctors/:doctorId/shifts/:shiftId', async (req, res) => {
  try {
    await run('DELETE FROM doctor_shifts WHERE id = ? AND doctor_id = ?', [Number(req.params.shiftId), Number(req.params.doctorId)]);
    res.json({ ok: true, message: 'Đã xóa ca trực.' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// -----------------------------------------------------------------------------
// API: BỆNH NHÂN ĐANG KHÁM
// -----------------------------------------------------------------------------
app.get('/api/examining', async (req, res) => {
  try {
    const rows = await all(`
      SELECT v.*, p.full_name, p.birth_year, p.gender, p.phone,
             d.doctor_code, d.full_name AS doctor_name, d.qualification,
             u.department_name, u.specialty_name
      FROM visits v
      JOIN patients p ON p.patient_code = v.patient_code
      JOIN doctors d ON d.id = v.doctor_id
      JOIN hospital_units u ON u.id = v.unit_id
      WHERE v.status = 'EXAMINING'
      ORDER BY datetime(v.started_at) ASC
    `);
    res.json({ ok: true, items: rows.map((r) => ({ ...r, vitalSigns: vitalSignsFromVisit(r) })) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/visits/:id', async (req, res) => {
  try {
    const row = await get(`
      SELECT v.*, p.full_name, p.birth_year, p.gender, p.phone, p.address,
             d.doctor_code, d.full_name AS doctor_name, d.qualification,
             u.department_name, u.specialty_name
      FROM visits v
      JOIN patients p ON p.patient_code = v.patient_code
      JOIN doctors d ON d.id = v.doctor_id
      JOIN hospital_units u ON u.id = v.unit_id
      WHERE v.id = ?
    `, [Number(req.params.id)]);
    if (!row) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    res.json({ ok: true, visit: { ...row, vitalSigns: vitalSignsFromVisit(row) } });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.post('/api/visits/:id/complete', async (req, res) => {
  try {
    const visitId = Number(req.params.id);
    const visit = await get('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!visit) return sendError(res, 404, 'Không tìm thấy lượt khám.');
    if (visit.status !== 'EXAMINING') return sendError(res, 409, 'Chỉ hoàn thành bệnh nhân đang khám.');

    const patient = await get('SELECT * FROM patients WHERE patient_code = ?', [visit.patient_code]);
    const doctor = await get('SELECT * FROM doctors WHERE id = ?', [visit.doctor_id]);
    const unit = await get('SELECT * FROM hospital_units WHERE id = ?', [visit.unit_id]);
    const completedAt = nowIso();

    // 1) Kết thúc lượt khám.
    await run("UPDATE visits SET status = 'COMPLETED', completed_at = ? WHERE id = ?", [completedAt, visitId]);
    await run('UPDATE doctor_stats SET served_count = served_count + 1 WHERE doctor_id = ?', [visit.doctor_id]);

    // 2) Xuất bệnh án chi tiết. Dấu hiệu sinh tồn lấy từ visit, bác sĩ không nhập lại.
    const exported = await exportMedicalRecord({ visit, patient, doctor, unit, payload: req.body, completedAt });
    await run(`
      INSERT INTO medical_records (
        record_code, visit_id, patient_code, doctor_id, unit_id,
        chief_complaint, history, allergies, vital_signs_json,
        clinical_exam, diagnosis, icd_code, lab_summary, imaging_summary,
        treatment, prescription, advice, follow_up, created_at,
        markdown_path, json_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      exported.recordCode, visitId, patient.patient_code, doctor.id, unit.id,
      safeText(req.body.chiefComplaint), safeText(req.body.history), safeText(req.body.allergies),
      JSON.stringify(vitalSignsFromVisit(visit)),
      safeText(req.body.clinicalExam), safeText(req.body.diagnosis), safeText(req.body.icdCode),
      safeText(req.body.labSummary), safeText(req.body.imagingSummary), safeText(req.body.treatment),
      safeText(req.body.prescription), safeText(req.body.advice), safeText(req.body.followUp),
      completedAt, exported.mdPath, exported.jsonPath
    ]);

    const recordRow = await get('SELECT * FROM medical_records WHERE record_code = ?', [exported.recordCode]);
    state.recordByCode.set(exported.recordCode, recordRow);
    state.activePatient.delete(patient.patient_code);

    const recentItem = {
      visitId,
      patientCode: patient.patient_code,
      patientName: patient.full_name,
      doctorId: String(doctor.id),
      doctorName: doctor.full_name,
      unitId: String(unit.id),
      departmentName: unit.department_name,
      unitName: unit.specialty_name,
      roomCode: visit.room_code,
      priority: visit.priority,
      checkInAt: visit.check_in_at,
      completedAt,
      recordCode: exported.recordCode
    };
    state.recentCompleted.pushFront(recentItem);

    // 3) Sau khi khám xong, tự động gọi bệnh nhân tiếp theo.
    await applyAgingForDoctor(doctor.id);
    const nextCalled = await autoCallNext(doctor.id);

    res.json({
      ok: true,
      message: 'Đã hoàn thành khám, xuất bệnh án và tự động xử lý người tiếp theo.',
      recordCode: exported.recordCode,
      nextCalled
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// -----------------------------------------------------------------------------
// API: HỒ SƠ ĐÃ KHÁM
// -----------------------------------------------------------------------------
app.get('/api/records', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const query = String(req.query.query || '').trim();
    const department = String(req.query.department || '').trim();
    const unitId = Number(req.query.unitId || 0);

    const where = [];
    const params = [];
    if (query) {
      where.push('(mr.record_code LIKE ? OR mr.patient_code LIKE ? OR p.full_name LIKE ?)');
      const q = `%${query}%`;
      params.push(q, q, q);
    }
    if (department) { where.push('u.department_name = ?'); params.push(department); }
    if (unitId) { where.push('u.id = ?'); params.push(unitId); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRow = await get(`
      SELECT COUNT(*) AS count
      FROM medical_records mr
      JOIN patients p ON p.patient_code = mr.patient_code
      JOIN hospital_units u ON u.id = mr.unit_id
      ${whereSql}
    `, params);

    const items = await all(`
      SELECT mr.*, p.full_name, p.birth_year,
             d.doctor_code, d.full_name AS doctor_name,
             u.department_name, u.specialty_name,
             v.room_code, v.completed_at
      FROM medical_records mr
      JOIN patients p ON p.patient_code = mr.patient_code
      LEFT JOIN doctors d ON d.id = mr.doctor_id
      LEFT JOIN hospital_units u ON u.id = mr.unit_id
      LEFT JOIN visits v ON v.id = mr.visit_id
      ${whereSql}
      ORDER BY datetime(mr.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...params, RECORD_PAGE_SIZE, (page - 1) * RECORD_PAGE_SIZE]);

    res.json({ ok: true, page, pageSize: RECORD_PAGE_SIZE, total: countRow.count, items });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/records/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    const row = await get(`
      SELECT mr.*, p.full_name, p.birth_year, p.gender, p.phone, p.address,
             d.doctor_code, d.full_name AS doctor_name, d.qualification,
             u.department_name, u.specialty_name,
             v.room_code, v.check_in_at, v.called_at, v.started_at, v.completed_at,
             v.base_priority, v.priority
      FROM medical_records mr
      JOIN patients p ON p.patient_code = mr.patient_code
      LEFT JOIN doctors d ON d.id = mr.doctor_id
      LEFT JOIN hospital_units u ON u.id = mr.unit_id
      LEFT JOIN visits v ON v.id = mr.visit_id
      WHERE mr.record_code = ?
    `, [code]);
    if (!row) return sendError(res, 404, 'Không tìm thấy bệnh án.');
    let vitals = {};
    try { vitals = JSON.parse(row.vital_signs_json || '{}'); } catch (_) { vitals = {}; }
    res.json({ ok: true, record: { ...row, vitalSigns: vitals } });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get('/api/recent', (req, res) => {
  res.json({ ok: true, items: state.recentCompleted.toArray() });
});

// Trang gốc chuyển thẳng tới Trang 1 - Hàng đợi & Check-in.
app.get('/', (req, res) => res.redirect('/queue.html'));

// -----------------------------------------------------------------------------
// KHỞI ĐỘNG SERVER
// -----------------------------------------------------------------------------
(async () => {
  try {
    await initDatabase();
    await rebuildState();
    await autoCallIdleDoctors();

    app.listen(PORT, () => {
      console.log('='.repeat(68));
      console.log(`Hospital Queue DSA V3 đang chạy: http://localhost:${PORT}`);
      console.log(`Trang 1 - Hàng đợi: http://localhost:${PORT}/queue.html`);
      console.log(`Trang 2 - Bác sĩ:    http://localhost:${PORT}/doctors.html`);
      console.log(`Trang 3 - Đang khám: http://localhost:${PORT}/examining.html`);
      console.log(`Trang 4 - Hồ sơ:     http://localhost:${PORT}/records.html`);
      console.log(`Đã nạp ${state.patientByCode.size.toLocaleString('vi-VN')} bệnh nhân vào Hash Map.`);
      console.log('='.repeat(68));
    });
  } catch (error) {
    console.error('Không thể khởi động hệ thống:', error);
    process.exitCode = 1;
  }
})();
