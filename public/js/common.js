// ============================================================================
// COMMON.JS - CÁC HÀM DÙNG CHUNG CHO 4 TRANG
// ============================================================================
// QUAN TRỌNG:
// File này được bọc trong IIFE để KHÔNG tạo các biến/hàm global như `api`,
// `toast`, `loadDepartments`... Nếu khai báo function ở global rồi file trang
// lại dùng `const { api } = window.App`, trình duyệt sẽ báo:
//   SyntaxError: Identifier 'api' has already been declared
// Khi đó toàn bộ JS của trang không chạy => dropdown chỉ còn chữ "Đang tải...".
// ============================================================================
(() => {
  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });

    const data = await response
      .json()
      .catch(() => ({ ok: false, message: 'Phản hồi server không hợp lệ.' }));

    if (!response.ok || data.ok === false) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function toast(message, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show${isError ? ' error' : ''}`;
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      el.className = 'toast';
    }, 3300);
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('vi-VN');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function statusBadge(status) {
    const map = {
      WAITING: ['waiting', 'Đang chờ'],
      CALLED: ['called', 'Đang gọi'],
      EXAMINING: ['examining', 'Đang khám'],
      AVAILABLE: ['available', 'Sẵn sàng'],
      CALLING: ['called', 'Đang gọi BN'],
      BUSY: ['busy', 'Bận'],
      OFF_SHIFT: ['off', 'Ngoài ca']
    };
    const item = map[status] || ['off', status];
    return `<span class="badge ${item[0]}">${item[1]}</span>`;
  }

  // Nạp danh sách Khoa từ backend.
  async function loadDepartments(select, includeAll = false) {
    if (!select) throw new Error('Không tìm thấy ô chọn Khoa trên giao diện.');

    // Hiển thị trạng thái đang tải rõ ràng.
    select.disabled = true;
    select.innerHTML = '<option value="">Đang tải danh sách khoa...</option>';

    try {
      const data = await api('/api/catalog/departments');
      const items = Array.isArray(data.items) ? data.items : [];

      select.innerHTML = includeAll
        ? '<option value="">Tất cả khoa</option>'
        : '<option value="">-- Chọn khoa --</option>';

      for (const name of items) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }

      if (!items.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Không có khoa đang hoạt động';
        select.appendChild(option);
      }
    } finally {
      select.disabled = false;
    }
  }

  // Nạp chuyên ngành theo khoa đã chọn.
  async function loadSpecialties(department, select, includeAll = false) {
    if (!select) throw new Error('Không tìm thấy ô chọn Chuyên ngành trên giao diện.');

    select.disabled = true;
    select.innerHTML = includeAll
      ? '<option value="">Tất cả chuyên ngành</option>'
      : '<option value="">-- Chọn chuyên ngành --</option>';

    if (!department) {
      if (!includeAll) {
        select.innerHTML = '<option value="">-- Hãy chọn khoa trước --</option>';
      }
      select.disabled = false;
      return [];
    }

    try {
      const data = await api(`/api/catalog/specialties?department=${encodeURIComponent(department)}`);
      const items = Array.isArray(data.items) ? data.items : [];

      // Tạo lại option đầu tiên rồi mới thêm chuyên ngành.
      select.innerHTML = includeAll
        ? '<option value="">Tất cả chuyên ngành</option>'
        : '<option value="">-- Chọn chuyên ngành --</option>';

      for (const unit of items) {
        const option = document.createElement('option');
        option.value = unit.id;
        option.textContent = unit.specialty_name;
        option.dataset.availability = JSON.stringify(unit.availability || {});
        option.dataset.is247 = String(unit.is_24_7 ?? 0);
        select.appendChild(option);
      }

      return items;
    } finally {
      select.disabled = false;
    }
  }

  async function loadMetrics() {
    const host = document.getElementById('metrics');
    if (!host) return;

    const m = await api('/api/metrics');
    const cards = [
      ['Bệnh nhân', m.patients],
      ['Bác sĩ', m.doctors],
      ['Đang chờ', m.waiting],
      ['Đang gọi', m.called],
      ['Đang khám', m.examining],
      ['Đã khám', m.completed]
    ];

    host.innerHTML = cards
      .map(([label, value]) =>
        `<div class="metric"><span>${label}</span><strong>${Number(value).toLocaleString('vi-VN')}</strong></div>`
      )
      .join('');
  }

  // Chỉ public đúng 1 object toàn cục duy nhất.
  window.App = {
    api,
    toast,
    fmtDate,
    escapeHtml,
    statusBadge,
    loadDepartments,
    loadSpecialties,
    loadMetrics
  };
})();
