const { api, toast, fmtDate, escapeHtml, loadMetrics } = window.App;
const grid = document.getElementById('examiningGrid');
const formCard = document.getElementById('examFormCard');
const title = document.getElementById('examTitle');
const routing = document.getElementById('examRouting');
const vitalGrid = document.getElementById('vitalGrid');
const visitIdInput = document.getElementById('examVisitId');

let currentItems = [];

async function loadExamining() {
  const data = await api('/api/examining');
  currentItems = data.items;
  if (!currentItems.length) {
    grid.innerHTML = '<div class="empty">Hiện không có bệnh nhân đang khám.</div>';
    formCard.classList.add('hidden');
    return;
  }

  grid.innerHTML = currentItems.map((v) => `
    <article class="patient-card">
      <h3>${escapeHtml(v.patient_code)} · ${escapeHtml(v.full_name)}</h3>
      <div>${escapeHtml(v.department_name)} → <strong>${escapeHtml(v.specialty_name)}</strong></div>
      <div class="muted">${escapeHtml(v.doctor_name)} · Phòng ${escapeHtml(v.room_code)}</div>
      <div class="muted small">Bắt đầu: ${fmtDate(v.started_at)}</div>
      <div style="margin-top:10px"><button class="primary" onclick="openExam(${v.id})">Mở bệnh án đang lập</button></div>
    </article>
  `).join('');
}

window.openExam = async function (visitId) {
  try {
    const data = await api(`/api/visits/${visitId}`);
    const v = data.visit;
    visitIdInput.value = v.id;
    title.textContent = `Lập bệnh án · ${v.patient_code} - ${v.full_name}`;
    routing.innerHTML = `<strong>${escapeHtml(v.department_name)} → ${escapeHtml(v.specialty_name)}</strong><br>` +
      `Bác sĩ: ${escapeHtml(v.doctor_name)} · Phòng: ${escapeHtml(v.room_code)} · Ưu tiên: ${v.priority}<br>` +
      `Check-in: ${fmtDate(v.check_in_at)} · Bắt đầu khám: ${fmtDate(v.started_at)}`;

    const x = v.vitalSigns || {};
    const cards = [
      ['Chiều cao', `${x.heightCm ?? '—'} cm`],
      ['Cân nặng', `${x.weightKg ?? '—'} kg`],
      ['BMI', x.bmi ?? '—'],
      ['Huyết áp', x.bloodPressure || '—'],
      ['Mạch', x.pulse ? `${x.pulse} lần/phút` : '—'],
      ['Nhiệt độ', x.temperature ? `${x.temperature} °C` : '—'],
      ['Nhịp thở', x.respiratoryRate ?? '—'],
      ['SpO₂', x.spo2 ? `${x.spo2}%` : '—']
    ];
    vitalGrid.innerHTML = cards.map(([k, value]) => `<div class="vital"><span>${k}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    formCard.classList.remove('hidden');
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { toast(error.message, true); }
};

function clinicalPayload() {
  const ids = ['chiefComplaint', 'history', 'allergies', 'clinicalExam', 'diagnosis', 'icdCode', 'labSummary', 'imagingSummary', 'treatment', 'prescription', 'advice', 'followUp'];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id).value]));
}

async function completeExam() {
  const visitId = Number(visitIdInput.value);
  if (!visitId) return;
  if (!confirm('Xác nhận hoàn thành khám? Hệ thống sẽ xuất bệnh án và tự gọi bệnh nhân tiếp theo.')) return;
  try {
    const data = await api(`/api/visits/${visitId}/complete`, {
      method: 'POST',
      body: JSON.stringify(clinicalPayload())
    });
    toast(`${data.message} Mã bệnh án: ${data.recordCode}`);
    if (data.nextCalled) {
      toast(`🔊 Đã tự gọi ${data.nextCalled.patientCode} - ${data.nextCalled.patientName}`);
    }
    formCard.classList.add('hidden');
    await Promise.all([loadExamining(), loadMetrics()]);
  } catch (error) { toast(error.message, true); }
}

document.getElementById('refreshExaminingBtn').addEventListener('click', loadExamining);
document.getElementById('completeExamBtn').addEventListener('click', completeExam);

Promise.all([loadMetrics(), loadExamining()]).catch((e) => toast(e.message, true));
setInterval(() => Promise.all([loadMetrics(), loadExamining()]).catch(() => {}), 8000);
