// Chuẩn hóa logic tuổi - kinh nghiệm - trình độ cho database hiện tại.
// Không xóa bệnh nhân, lượt khám hay bệnh án.
const { all, run } = require('../database/db');
const {
  ageFromBirthYear,
  normalizeExperience,
  normalizeQualification,
  validateDoctorProfile
} = require('../services/DoctorQualificationPolicy');

(async () => {
  const doctors = await all('SELECT id, doctor_code, full_name, birth_year, years_experience, qualification FROM doctors');
  let changed = 0;
  const changes = [];

  for (const doctor of doctors) {
    const age = ageFromBirthYear(doctor.birth_year);
    if (age == null) continue;
    const safeExperience = normalizeExperience(age, doctor.years_experience);
    const safeQualification = normalizeQualification(age, safeExperience, doctor.qualification);

    if (safeExperience !== doctor.years_experience || safeQualification !== doctor.qualification) {
      await run(
        'UPDATE doctors SET years_experience = ?, qualification = ? WHERE id = ?',
        [safeExperience, safeQualification, doctor.id]
      );
      changed += 1;
      changes.push({
        doctor: doctor.doctor_code,
        oldExperience: doctor.years_experience,
        newExperience: safeExperience,
        oldQualification: doctor.qualification,
        newQualification: safeQualification
      });
    }
  }

  const after = await all('SELECT birth_year, years_experience, qualification FROM doctors');
  const invalid = after.filter((d) => !validateDoctorProfile({
    birthYear: d.birth_year,
    yearsExperience: d.years_experience,
    qualification: d.qualification
  }).ok);

  console.log(`Đã kiểm tra ${doctors.length} bác sĩ.`);
  console.log(`Đã sửa ${changed} hồ sơ bác sĩ chưa hợp logic.`);
  console.log(`Số hồ sơ còn vi phạm quy tắc: ${invalid.length}.`);
  if (changes.length) console.table(changes.slice(0, 20));
})();
