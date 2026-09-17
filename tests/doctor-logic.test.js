const assert = require('assert');
const {
  isQualificationAllowed,
  maxExperienceForAge,
  validateDoctorProfile
} = require('../services/DoctorQualificationPolicy');

assert.strictEqual(maxExperienceForAge(28), 0);
assert.strictEqual(maxExperienceForAge(30), 2);
assert.strictEqual(maxExperienceForAge(40), 12);

assert.strictEqual(isQualificationAllowed(31, 3, 'Tiến sĩ - Bác sĩ'), false);
assert.strictEqual(isQualificationAllowed(38, 10, 'Tiến sĩ - Bác sĩ'), true);
assert.strictEqual(isQualificationAllowed(35, 7, 'BS.CKII'), false);
assert.strictEqual(isQualificationAllowed(36, 8, 'BS.CKII'), true);

assert.strictEqual(validateDoctorProfile({ birthYear: new Date().getFullYear() - 31, yearsExperience: 3, qualification: 'Tiến sĩ - Bác sĩ' }).ok, false);
assert.strictEqual(validateDoctorProfile({ birthYear: new Date().getFullYear() - 38, yearsExperience: 10, qualification: 'Tiến sĩ - Bác sĩ' }).ok, true);

console.log('Doctor logic tests passed');
