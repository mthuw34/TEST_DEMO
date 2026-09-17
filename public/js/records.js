const { api, toast, fmtDate, escapeHtml, loadDepartments, loadSpecialties, loadMetrics } = window.App;
const els = {
  query: document.getElementById('recordQuery'),
  department: document.getElementById('recordDepartment'),
  specialty: document.getElementById('recordSpecialty'),
  body: document.getElementById('recordBody'),
  pageInfo: document.getElementById('pageInfo'),
  detailCard: document.getElementById('recordDetailCard'),
  detailTitle: document.getElementById('recordDetailTitle'),
  detail: document.getElementById('recordDetail')
};
let page = 1;
let total = 0;
let pageSize = 30;

async function loadRecords() {
  const qs = new URLSearchParams({ page: String(page) });
  if (els.query.value.trim()) qs.set('query', els.query.value.trim());
  if (els.department.value) qs.set('department', els.department.value);
  if (els.specialty.value) qs.set('unitId', els.specialty.value);
  const data = await api(`/api/records?${qs.toString()}`);
  total = data.total;
  pageSize = data.pageSize;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  els.pageInfo.textContent = `Trang ${page}/${maxPage} · ${total.toLocaleString('vi-VN')} hồ sơ`;
  document.getElementById('prevPageBtn').disabled = page <= 1;
  document.getElementById('nextPageBtn').disabled = page >= maxPage;

  if (!data.items.length) {
    els.body.innerHTML = '<tr><td colspan="7"><div class="empty">Chưa có bệnh án phù hợp.</div></td></tr>';
    return;
  }

  els.body.innerHTML = data.items.map((r) => `<tr>
    <td><strong>${escapeHtml(r.record_code)}</strong></td>
    <td>${escapeHtml(r.patient_code)}<br>${escapeHtml(r.full_name)}</td>
    <td>${escapeHtml(r.department_name)}<br><span class="muted small">${escapeHtml(r.specialty_name)}</span></td>
    <td>${escapeHtml(r.doctor_name || '—')}</td>
    <td>${escapeHtml(r.room_code || '—')}</td>
    <td>${fmtDate(r.completed_at || r.created_at)}</td>
    <td><button class="primary" onclick="openRecord('${escapeHtml(r.record_code)}')">Xem</button></td>
  </tr>`).join('');
}

window.openRecord = async function (code) {
  try {
    const data = await api(`/api/records/${encodeURIComponent(code)}`);
    const r = data.record;
    const v = r.vitalSigns || {};
    els.detailTitle.textContent = `Bệnh án ${r.record_code}`;
    els.detail.innerHTML = `
      <div class="grid two">
        <div class="detail-panel">
          <h3>1. Bệnh nhân</h3>
          <p><strong>${escapeHtml(r.patient_code)} · ${escapeHtml(r.full_name)}</strong></p>
          <p>Năm sinh: ${escapeHtml(r.birth_year)} · ${escapeHtml(r.gender)}<br>SĐT: ${escapeHtml(r.phone)}<br>Địa chỉ: ${escapeHtml(r.address)}</p>
        </div>
        <div class="detail-panel">
          <h3>2. Điều phối khám</h3>
          <p>Khoa: <strong>${escapeHtml(r.department_name)}</strong><br>Chuyên ngành: ${escapeHtml(r.specialty_name)}<br>Bác sĩ: ${escapeHtml(r.doctor_name)}<br>Phòng: ${escapeHtml(r.room_code)}</p>
          <p>Check-in: ${fmtDate(r.check_in_at)}<br>Bắt đầu: ${fmtDate(r.started_at)}<br>Hoàn thành: ${fmtDate(r.completed_at)}</p>
        </div>
      </div>
      <h3>3. Chỉ số đo trước</h3>
      <div class="vital-grid">
        ${[['Chiều cao', `${v.heightCm ?? '—'} cm`], ['Cân nặng', `${v.weightKg ?? '—'} kg`], ['BMI', v.bmi ?? '—'], ['Huyết áp', v.bloodPressure || '—'], ['Mạch', v.pulse ?? '—'], ['Nhiệt độ', v.temperature ?? '—'], ['Nhịp thở', v.respiratoryRate ?? '—'], ['SpO₂', v.spo2 ? `${v.spo2}%` : '—']].map(([k, x]) => `<div class="vital"><span>${k}</span><strong>${escapeHtml(x)}</strong></div>`).join('')}
      </div>
      <h3>4. Nội dung chuyên môn</h3>
      <div class="grid two">
        ${[['Lý do khám', r.chief_complaint], ['Bệnh sử / tiền sử', r.history], ['Dị ứng', r.allergies], ['Khám lâm sàng', r.clinical_exam], ['Chẩn đoán', r.diagnosis], ['Mã ICD', r.icd_code], ['Xét nghiệm', r.lab_summary], ['Chẩn đoán hình ảnh', r.imaging_summary], ['Điều trị', r.treatment], ['Đơn thuốc', r.prescription], ['Dặn dò', r.advice], ['Hẹn tái khám', r.follow_up]].map(([k, x]) => `<div class="detail-panel"><strong>${k}</strong><p>${escapeHtml(x || 'Chưa ghi nhận')}</p></div>`).join('')}
      </div>
      `;
    els.detailCard.classList.remove('hidden');
    els.detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { toast(error.message, true); }
};



async function init() {
  await Promise.all([loadMetrics(), loadDepartments(els.department, true)]);
  await loadRecords();
}

document.getElementById('searchRecordsBtn').addEventListener('click', () => { page = 1; loadRecords(); });
els.query.addEventListener('keydown', (e) => { if (e.key === 'Enter') { page = 1; loadRecords(); } });
els.department.addEventListener('change', async () => {
  await loadSpecialties(els.department.value, els.specialty, true);
  page = 1;
  await loadRecords();
});
els.specialty.addEventListener('change', () => { page = 1; loadRecords(); });
document.getElementById('prevPageBtn').addEventListener('click', () => { if (page > 1) { page -= 1; loadRecords(); } });
document.getElementById('nextPageBtn').addEventListener('click', () => { if (page * pageSize < total) { page += 1; loadRecords(); } });

init().catch((e) => toast(e.message, true));
