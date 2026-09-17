const { api, toast, escapeHtml, statusBadge, loadDepartments, loadSpecialties, loadMetrics } = window.App;
const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const els = {
  department: document.getElementById('doctorDepartment'),
  specialty: document.getElementById('doctorSpecialty'),
  loadBtn: document.getElementById('loadDoctorsBtn'),
  grid: document.getElementById('doctorGrid'),
  dialog: document.getElementById('doctorDialog'),
  dialogName: document.getElementById('dialogDoctorName'),
  id: document.getElementById('editDoctorId'),
  fullName: document.getElementById('editFullName'),
  birthYear: document.getElementById('editBirthYear'),
  gender: document.getElementById('editGender'),
  phone: document.getElementById('editPhone'),
  email: document.getElementById('editEmail'),
  qualification: document.getElementById('editQualification'),
  qualificationHint: document.getElementById('qualificationHint'),
  experience: document.getElementById('editExperience'),
  experienceHint: document.getElementById('experienceHint'),
  shiftList: document.getElementById('shiftList'),
  newShiftDay: document.getElementById('newShiftDay'),
  newShiftStart: document.getElementById('newShiftStart'),
  newShiftEnd: document.getElementById('newShiftEnd')
};

let currentDoctors = [];
let currentDoctor = null;
let qualificationRules = [];

// Tính giới hạn kinh nghiệm theo quy ước: 28 tuổi mới bắt đầu hành nghề.
function updateExperienceLimit() {
  const currentYear = new Date().getFullYear();
  const birthYear = Number(els.birthYear.value);
  const age = currentYear - birthYear;
  const maxExperience = Number.isFinite(age) && age >= 28
    ? Math.max(0, age - 28)
    : 0;

  els.experience.min = '0';
  els.experience.max = String(maxExperience);
  els.experience.title = Number.isFinite(age)
    ? `Bác sĩ ${age} tuổi: tối đa ${maxExperience} năm kinh nghiệm.`
    : '';
  els.experienceHint.textContent = Number.isFinite(age)
    ? `Tuổi hiện tại: ${age}. Kinh nghiệm tối đa theo quy ước đồ án: ${maxExperience} năm.`
    : '';

  if (Number(els.experience.value) > maxExperience) {
    els.experience.value = String(maxExperience);
  }
  return { age, maxExperience };
}

function updateQualificationOptions(preferredValue = '') {
  const { age } = updateExperienceLimit();
  const experience = Number(els.experience.value || 0);
  const allowed = qualificationRules.filter(
    (rule) => age >= Number(rule.minAge) && experience >= Number(rule.minExperience)
  );

  const previous = preferredValue || els.qualification.value;
  els.qualification.innerHTML = allowed.map((rule) =>
    `<option value="${escapeHtml(rule.value)}">${escapeHtml(rule.label || rule.value)}</option>`
  ).join('');

  if (allowed.some((rule) => rule.value === previous)) {
    els.qualification.value = previous;
  } else if (allowed.length) {
    // Không tự nâng lên học vị cao nhất. Khi dữ liệu cũ không hợp lệ,
    // chọn mức cơ bản nhất đang được phép để người dùng chủ động xác nhận.
    els.qualification.value = allowed[0].value;
  }

  els.qualificationHint.textContent = allowed.length
    ? `Với ${age} tuổi và ${experience} năm kinh nghiệm, có thể chọn: ${allowed.map((r) => r.value).join(', ')}.`
    : 'Chưa đủ điều kiện dữ liệu để chọn trình độ.';
}

async function loadQualificationRules() {
  const data = await api('/api/catalog/qualification-rules');
  qualificationRules = data.items || [];
}

async function loadDoctors() {
  const unitId = Number(els.specialty.value || 0);
  const department = els.department.value;
  const qs = new URLSearchParams();
  if (unitId) qs.set('unitId', unitId);
  else if (department) qs.set('department', department);
  const data = await api(`/api/doctors?${qs.toString()}`);
  currentDoctors = data.items;

  if (!currentDoctors.length) {
    els.grid.innerHTML = '<div class="empty">Không có bác sĩ theo bộ lọc.</div>';
    return;
  }

  els.grid.innerHTML = currentDoctors.map((d) => `
    <article class="doctor-card">
      <div class="row" style="justify-content:space-between">
        <h3>${escapeHtml(d.full_name)}</h3>
        ${statusBadge(d.computedStatus)}
      </div>
      <div class="muted small">${escapeHtml(d.doctor_code)} · ${escapeHtml(d.qualification || '')}</div>
      <div class="meta">
        <div><strong>Tuổi:</strong> ${escapeHtml(d.age ?? '—')}</div>
        <div><strong>Giới tính:</strong> ${escapeHtml(d.gender)}</div>
        <div><strong>Khoa:</strong> ${escapeHtml(d.department_name)}</div>
        <div><strong>Chuyên ngành:</strong> ${escapeHtml(d.specialty_name)}</div>
        <div><strong>Phòng:</strong> ${escapeHtml(d.room_code)}</div>
        <div><strong>Kinh nghiệm:</strong> ${d.years_experience} năm</div>
        <div><strong>Đang chờ:</strong> ${d.load.waiting}</div>
        <div><strong>Đang gọi/khám:</strong> ${d.load.called + d.load.examining}</div>
      </div>
      ${d.currentPatient ? `<div class="notice">Hiện tại: ${escapeHtml(d.currentPatient.patient_code)} - ${escapeHtml(d.currentPatient.full_name)}</div>` : ''}
      ${d.status_note ? `<div class="notice error">Ghi chú: ${escapeHtml(d.status_note)}</div>` : ''}
      <div class="actions" style="margin-top:10px">
        <button onclick="openDoctor(${d.id})">Chi tiết / lịch trực</button>
        ${d.status === 'BUSY'
          ? `<button class="success" onclick="setDoctorStatus(${d.id}, 'AVAILABLE')">Cho nhận bệnh lại</button>`
          : `<button class="danger" onclick="setDoctorStatus(${d.id}, 'BUSY')">Bận đột xuất</button>`}
      </div>
    </article>
  `).join('');
}

window.setDoctorStatus = async function (doctorId, status) {
  let note = '';
  if (status === 'BUSY') {
    note = prompt('Lý do bác sĩ bận/nghỉ đột xuất:', 'Có việc gấp') ?? '';
    if (!note) return;
  }
  try {
    const data = await api(`/api/doctors/${doctorId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note })
    });
    toast(data.message);
    await Promise.all([loadDoctors(), loadMetrics()]);
  } catch (error) { toast(error.message, true); }
};

window.openDoctor = function (doctorId) {
  currentDoctor = currentDoctors.find((d) => d.id === doctorId);
  if (!currentDoctor) return;
  els.dialogName.textContent = `${currentDoctor.doctor_code} · ${currentDoctor.full_name}`;
  els.id.value = currentDoctor.id;
  els.fullName.value = currentDoctor.full_name || '';
  els.birthYear.value = currentDoctor.birth_year || '';
  els.gender.value = currentDoctor.gender || '';
  els.phone.value = currentDoctor.phone || '';
  els.email.value = currentDoctor.email || '';
  els.experience.value = currentDoctor.years_experience || 0;
  updateQualificationOptions(currentDoctor.qualification || '');
  renderShifts();
  els.dialog.showModal();
};

function renderShifts() {
  const shifts = currentDoctor?.shifts || [];
  els.shiftList.innerHTML = shifts.length ? shifts.map((s) => `
    <div class="shift-row">
      <div><label>Thứ</label><select id="shiftDay${s.id}">${dayNames.map((name, i) => `<option value="${i}" ${i === s.day_of_week ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
      <div><label>Bắt đầu</label><input id="shiftStart${s.id}" type="time" value="${s.start_time}" /></div>
      <div><label>Kết thúc</label><input id="shiftEnd${s.id}" type="time" value="${s.end_time}" /></div>
      <div class="row"><button class="success" onclick="saveShift(${s.id})">Lưu</button><button class="danger" onclick="deleteShift(${s.id})">Xóa</button></div>
    </div>
  `).join('') : '<div class="empty">Bác sĩ chưa có ca trực.</div>';
}

window.saveShift = async function (shiftId) {
  try {
    await api(`/api/doctors/${currentDoctor.id}/shifts/${shiftId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        dayOfWeek: Number(document.getElementById(`shiftDay${shiftId}`).value),
        startTime: document.getElementById(`shiftStart${shiftId}`).value,
        endTime: document.getElementById(`shiftEnd${shiftId}`).value
      })
    });
    toast('Đã cập nhật ca trực.');
    await refreshCurrentDoctor();
  } catch (error) { toast(error.message, true); }
};

window.deleteShift = async function (shiftId) {
  if (!confirm('Xóa ca trực này?')) return;
  try {
    await api(`/api/doctors/${currentDoctor.id}/shifts/${shiftId}`, { method: 'DELETE' });
    toast('Đã xóa ca trực.');
    await refreshCurrentDoctor();
  } catch (error) { toast(error.message, true); }
};

async function refreshCurrentDoctor() {
  const id = currentDoctor.id;
  await loadDoctors();
  currentDoctor = currentDoctors.find((d) => d.id === id);
  if (currentDoctor) renderShifts();
}

async function saveProfile() {
  try {
    const currentYear = new Date().getFullYear();
    const birthYear = Number(els.birthYear.value);
    const age = currentYear - birthYear;
    const yearsExperience = Number(els.experience.value);
    const maxExperience = Math.max(0, age - 28);

    if (!Number.isInteger(birthYear) || age < 28 || age > 75) {
      throw new Error('Tuổi bác sĩ phải từ 28 đến 75 trong dữ liệu demo.');
    }
    if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > maxExperience) {
      throw new Error(`Bác sĩ ${age} tuổi chỉ có thể có tối đa ${maxExperience} năm kinh nghiệm.`);
    }

    const data = await api(`/api/doctors/${Number(els.id.value)}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: els.fullName.value,
        birthYear,
        gender: els.gender.value,
        phone: els.phone.value,
        email: els.email.value,
        qualification: els.qualification.value,
        yearsExperience
      })
    });
    toast(data.message);
    await refreshCurrentDoctor();
    els.dialogName.textContent = `${currentDoctor.doctor_code} · ${currentDoctor.full_name}`;
  } catch (error) { toast(error.message, true); }
}

async function addShift() {
  if (!currentDoctor) return;
  try {
    const data = await api(`/api/doctors/${currentDoctor.id}/shifts`, {
      method: 'POST',
      body: JSON.stringify({
        dayOfWeek: Number(els.newShiftDay.value),
        startTime: els.newShiftStart.value,
        endTime: els.newShiftEnd.value
      })
    });
    toast(data.message);
    await refreshCurrentDoctor();
  } catch (error) { toast(error.message, true); }
}

async function init() {
  await Promise.all([loadMetrics(), loadDepartments(els.department, true), loadQualificationRules()]);
  await loadDoctors();
}

els.department.addEventListener('change', async () => {
  await loadSpecialties(els.department.value, els.specialty, true);
  await loadDoctors();
});
els.specialty.addEventListener('change', loadDoctors);
els.loadBtn.addEventListener('click', loadDoctors);
els.birthYear.addEventListener('input', () => updateQualificationOptions());
els.experience.addEventListener('input', () => updateQualificationOptions());
document.getElementById('closeDoctorDialog').addEventListener('click', () => els.dialog.close());
document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
document.getElementById('addShiftBtn').addEventListener('click', addShift);

init().catch((e) => toast(e.message, true));
setInterval(() => Promise.all([loadMetrics(), loadDoctors()]).catch(() => {}), 10000);
