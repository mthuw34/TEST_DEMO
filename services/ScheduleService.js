const { LAST_CHECKIN_MINUTES_BEFORE_CLOSE } = require('../config');

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(hhmm) {
  return String(hhmm || '').slice(0, 5);
}

// Kiểm tra giờ hoạt động của KHOA/CHUYÊN NGÀNH khi bệnh nhân check-in.
// Đây là quy tắc vận hành demo, không phải quy tắc y khoa.
function evaluateUnitAvailability(unit, date = new Date()) {
  if (Number(unit.is_24_7) === 1) {
    return { ok: true, code: 'OPEN_24_7', message: 'Chuyên ngành hoạt động 24/7.' };
  }

  const current = nowMinutes(date);
  const open = toMinutes(unit.open_time);
  const lunchStart = toMinutes(unit.lunch_start);
  const lunchEnd = toMinutes(unit.lunch_end);
  const close = toMinutes(unit.close_time);

  if (current < open) {
    return {
      ok: false,
      code: 'NOT_OPEN_YET',
      message: `Chuyên ngành chưa làm việc. Giờ mở cửa: ${formatTime(unit.open_time)}.`
    };
  }

  if (current >= lunchStart && current < lunchEnd) {
    return {
      ok: false,
      code: 'LUNCH_BREAK',
      message: `Chuyên ngành đang nghỉ trưa (${formatTime(unit.lunch_start)}–${formatTime(unit.lunch_end)}). Vui lòng quay lại sau ${formatTime(unit.lunch_end)}.`
    };
  }

  if (current >= close) {
    return {
      ok: false,
      code: 'CLOSED',
      message: `Chuyên ngành đã hết giờ làm việc lúc ${formatTime(unit.close_time)}.`
    };
  }

  if (close - current <= LAST_CHECKIN_MINUTES_BEFORE_CLOSE) {
    return {
      ok: false,
      code: 'NEAR_CLOSING',
      message: `Chuyên ngành sắp hết giờ làm việc lúc ${formatTime(unit.close_time)} và hiện ngừng nhận check-in mới.`
    };
  }

  return {
    ok: true,
    code: 'OPEN',
    message: `Đang hoạt động: ${formatTime(unit.open_time)}–${formatTime(unit.lunch_start)} và ${formatTime(unit.lunch_end)}–${formatTime(unit.close_time)}.`
  };
}

function isTimeInsideShift(currentMinutes, startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return currentMinutes >= start && currentMinutes < end;
}

function isDoctorOnShift(shifts, date = new Date()) {
  const day = date.getDay();
  const current = nowMinutes(date);
  return shifts.some((shift) => (
    Number(shift.active) === 1 &&
    Number(shift.day_of_week) === day &&
    isTimeInsideShift(current, shift.start_time, shift.end_time)
  ));
}

module.exports = {
  toMinutes,
  nowMinutes,
  evaluateUnitAvailability,
  isDoctorOnShift
};
