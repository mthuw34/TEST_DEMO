const assert = require('assert');
const { evaluateUnitAvailability, isDoctorOnShift } = require('../services/ScheduleService');

function localDate(hour, minute) {
  const d = new Date(2026, 8, 16, hour, minute, 0, 0);
  return d;
}

const regular = {
  is_24_7: 0,
  open_time: '07:30',
  lunch_start: '11:30',
  lunch_end: '13:00',
  close_time: '17:00'
};
const emergency = { ...regular, is_24_7: 1 };

assert.equal(evaluateUnitAvailability(regular, localDate(10, 0)).ok, true);
assert.equal(evaluateUnitAvailability(regular, localDate(12, 0)).code, 'LUNCH_BREAK');
assert.equal(evaluateUnitAvailability(regular, localDate(16, 45)).code, 'NEAR_CLOSING');
assert.equal(evaluateUnitAvailability(emergency, localDate(2, 0)).ok, true);

const day = localDate(10, 0).getDay();
assert.equal(isDoctorOnShift([{ day_of_week: day, start_time: '07:30', end_time: '11:30', active: 1 }], localDate(10, 0)), true);
assert.equal(isDoctorOnShift([{ day_of_week: day, start_time: '13:00', end_time: '17:00', active: 1 }], localDate(10, 0)), false);

console.log('Schedule tests passed');
