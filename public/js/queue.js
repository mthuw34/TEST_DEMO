const { api, toast, fmtDate, escapeHtml, statusBadge, loadDepartments, loadSpecialties, loadMetrics } = window.App;

const els = {
  lookupCode: document.getElementById('lookupCode'),
  lookupBtn: document.getElementById('lookupBtn'),
  patientInfo: document.getElementById('patientInfo'),
  patientCode: document.getElementById('patientCode'),
  department: document.getElementById('department'),
  specialty: document.getElementById('specialty'),
  scheduleNotice: document.getElementById('scheduleNotice'),
  heightCm: document.getElementById('heightCm'),
  weightKg: document.getElementById('weightKg'),
  bmi: document.getElementById('bmi'),
  priority: document.getElementById('priority'),
  bloodPressure: document.getElementById('bloodPressure'),
  pulse: document.getElementById('pulse'),
  temperature: document.getElementById('temperature'),
  respiratoryRate: document.getElementById('respiratoryRate'),
  spo2: document.getElementById('spo2'),
  checkinBtn: document.getElementById('checkinBtn'),
  checkinResult: document.getElementById('checkinResult'),
  queueDepartment: document.getElementById('queueDepartment'),
  queueSpecialty: document.getElementById('queueSpecialty'),
  refreshQueueBtn: document.getElementById('refreshQueueBtn'),
  queueBody: document.getElementById('queueBody')
};

function computeBMI() {
  const h = Number(els.heightCm.value) / 100;
  const w = Number(els.weightKg.value);
  els.bmi.value = h > 0 && w > 0 ? (w / (h * h)).toFixed(2) : '';
}

async function lookupPatient() {
  const code = els.lookupCode.value.trim().toUpperCase();
  if (!code) return;
  try {
    const data = await api(`/api/patients/${encodeURIComponent(code)}`);
    const p = data.patient;
    els.patientCode.value = p.patient_code;
    els.patientInfo.className = 'notice success';
    els.patientInfo.innerHTML = `<strong>${escapeHtml(p.patient_code)} · ${escapeHtml(p.full_name)}</strong><br>` +
      `Năm sinh: ${escapeHtml(p.birth_year)} · Giới tính: ${escapeHtml(p.gender)} · SĐT: ${escapeHtml(p.phone)}<br>` +
      `Địa chỉ: ${escapeHtml(p.address)}${data.activeVisitId ? '<br><strong>⚠ Bệnh nhân đang có lượt khám hoạt động.</strong>' : ''}`;
  } catch (error) {
    els.patientInfo.className = 'notice error';
    els.patientInfo.textContent = error.message;
  }
}

async function onDepartmentChange() {
  await loadSpecialties(els.department.value, els.specialty, false);
  updateScheduleNotice();
}

function updateScheduleNotice() {
  const option = els.specialty.selectedOptions[0];
  if (!option || !option.value) {
    els.scheduleNotice.className = 'notice';
    els.scheduleNotice.textContent = 'Chọn khoa và chuyên ngành để xem giờ hoạt động.';
    return;
  }
  try {
    const availability = JSON.parse(option.dataset.availability || '{}');
    els.scheduleNotice.className = `notice ${availability.ok ? 'success' : 'error'}`;
    els.scheduleNotice.textContent = availability.message || 'Đã chọn chuyên ngành.';
  } catch (_) {
    els.scheduleNotice.className = 'notice';
  }
}

async function checkin() {
  const unitId = Number(els.specialty.value);
  if (!unitId) return toast('Hãy chọn khoa và chuyên ngành.', true);

  const payload = {
    patientCode: els.patientCode.value.trim().toUpperCase(),
    unitId,
    priority: Number(els.priority.value),
    heightCm: Number(els.heightCm.value),
    weightKg: Number(els.weightKg.value),
    bloodPressure: els.bloodPressure.value.trim(),
    pulse: Number(els.pulse.value),
    temperature: Number(els.temperature.value),
    respiratoryRate: Number(els.respiratoryRate.value),
    spo2: Number(els.spo2.value)
  };

  els.checkinBtn.disabled = true;
  try {
    const data = await api('/api/checkin', { method: 'POST', body: JSON.stringify(payload) });
    const a = data.assigned;
    els.checkinResult.className = 'notice success';
    els.checkinResult.innerHTML = `<strong>Check-in thành công.</strong><br>` +
      `Bác sĩ hệ thống phân: <strong>${escapeHtml(a.doctorName)}</strong><br>` +
      `Phòng hệ thống phân: <strong>${escapeHtml(a.roomCode)}</strong><br>` +
      `BMI: <strong>${escapeHtml(data.bmi)}</strong>` +
      (data.autoCalled ? `<br>🔊 Hệ thống vừa tự động gọi: <strong>${escapeHtml(data.autoCalled.patientCode)} - ${escapeHtml(data.autoCalled.patientName)}</strong>` : '');
    toast('Check-in thành công.');
    await Promise.all([loadMetrics(), loadQueue()]);
  } catch (error) {
    els.checkinResult.className = 'notice error';
    els.checkinResult.textContent = error.message;
    toast(error.message, true);
  } finally {
    els.checkinBtn.disabled = false;
  }
}

async function loadQueue() {
  const unitId = Number(els.queueSpecialty.value || 0);
  const data = await api(`/api/queue${unitId ? `?unitId=${unitId}` : ''}`);
  if (!data.items.length) {
    els.queueBody.innerHTML = '<tr><td colspan="7"><div class="empty">Không có bệnh nhân đang chờ hoặc đang được gọi.</div></td></tr>';
    return;
  }

  els.queueBody.innerHTML = data.items.map((v) => {
    const waitingActions = v.status === 'WAITING' ? `
      <button class="warning" onclick="changePriority(${v.id}, ${v.priority})">Đổi ưu tiên</button>
      <button onclick="transferVisit(${v.id})">Đổi BS tự động</button>
      <button class="danger" onclick="cancelVisit(${v.id})">Hủy lượt</button>` : '';
    const calledActions = v.status === 'CALLED' ? `
      <button class="success" onclick="patientEntered(${v.id})">Đã vào phòng</button>
      <button class="danger" onclick="noShow(${v.id})">Không có mặt</button>` : '';
    return `<tr>
      <td>${statusBadge(v.status)}</td>
      <td><strong>${escapeHtml(v.patient_code)}</strong><br>${escapeHtml(v.full_name)}</td>
      <td><strong>${v.priority}</strong>${v.priority !== v.base_priority ? `<br><span class="muted small">gốc ${v.base_priority}</span>` : ''}</td>
      <td>${fmtDate(v.check_in_at)}</td>
      <td>${escapeHtml(v.doctor_name)}<br><span class="muted small">${escapeHtml(v.doctor_code)}</span></td>
      <td>${escapeHtml(v.room_code)}</td>
      <td><div class="row">${waitingActions}${calledActions}</div></td>
    </tr>`;
  }).join('');
}

window.changePriority = async function (visitId, current) {
  const value = prompt('Nhập mức ưu tiên mới (1 cao nhất → 5 thấp nhất):', String(current));
  if (value === null) return;
  try {
    const data = await api(`/api/visits/${visitId}/priority`, { method: 'PATCH', body: JSON.stringify({ priority: Number(value) }) });
    toast(data.message);
    await loadQueue();
  } catch (error) { toast(error.message, true); }
};

window.transferVisit = async function (visitId) {
  if (!confirm('Hệ thống sẽ tự tìm bác sĩ khác cùng chuyên ngành. Tiếp tục?')) return;
  try {
    const data = await api(`/api/visits/${visitId}/transfer`, { method: 'POST', body: '{}' });
    toast(`${data.message} → ${data.assigned.doctorName} / ${data.assigned.roomCode}`);
    await loadQueue();
  } catch (error) { toast(error.message, true); }
};

window.cancelVisit = async function (visitId) {
  const reason = prompt('Lý do hủy/rút lượt:', 'Bệnh nhân xin rút lượt khám');
  if (reason === null) return;
  try {
    const data = await api(`/api/visits/${visitId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
    toast(data.message);
    await Promise.all([loadMetrics(), loadQueue()]);
  } catch (error) { toast(error.message, true); }
};

window.patientEntered = async function (visitId) {
  try {
    const data = await api(`/api/visits/${visitId}/enter`, { method: 'POST', body: '{}' });
    toast(data.message);
    await Promise.all([loadMetrics(), loadQueue()]);
  } catch (error) { toast(error.message, true); }
};

window.noShow = async function (visitId) {
  if (!confirm('Bệnh nhân không có mặt sẽ bị loại khỏi lượt hiện tại và muốn khám lại phải check-in lại. Xác nhận?')) return;
  try {
    const data = await api(`/api/visits/${visitId}/no-show`, { method: 'POST', body: '{}' });
    toast(data.message);
    await Promise.all([loadMetrics(), loadQueue()]);
  } catch (error) { toast(error.message, true); }
};

async function init() {
  // Nếu BMI không hiện sau khi tải trang thì queue.js chưa chạy.
  // Việc tính ngay ở đây cũng là dấu hiệu kiểm tra nhanh cho người dùng.
  computeBMI();

  // Không dùng Promise.all ở bước khởi tạo danh mục.
  // Nếu một API phụ bị lỗi, dropdown Khoa vẫn phải cố tải độc lập.
  try {
    await loadDepartments(els.department, false);
  } catch (error) {
    els.department.innerHTML = '<option value="">Không tải được danh sách khoa</option>';
    els.scheduleNotice.className = 'notice error';
    els.scheduleNotice.textContent = `Lỗi tải khoa: ${error.message}`;
    toast(`Lỗi tải khoa: ${error.message}`, true);
  }

  try {
    await loadDepartments(els.queueDepartment, true);
  } catch (error) {
    els.queueDepartment.innerHTML = '<option value="">Không tải được danh sách khoa</option>';
  }

  try { await loadMetrics(); } catch (error) { console.error('Metrics:', error); }
  try { await loadQueue(); } catch (error) { console.error('Queue:', error); }
}

els.lookupBtn.addEventListener('click', lookupPatient);
els.lookupCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupPatient(); });
els.heightCm.addEventListener('input', computeBMI);
els.weightKg.addEventListener('input', computeBMI);
els.department.addEventListener('change', onDepartmentChange);
els.specialty.addEventListener('change', updateScheduleNotice);
els.checkinBtn.addEventListener('click', checkin);
els.queueDepartment.addEventListener('change', async () => {
  await loadSpecialties(els.queueDepartment.value, els.queueSpecialty, true);
  await loadQueue();
});
els.queueSpecialty.addEventListener('change', loadQueue);
els.refreshQueueBtn.addEventListener('click', loadQueue);

init().catch((e) => toast(e.message, true));
setInterval(() => Promise.all([loadMetrics(), loadQueue()]).catch(() => {}), 7000);
