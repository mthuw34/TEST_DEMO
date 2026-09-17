// ============================================================
// QUY TẮC LOGIC THÔNG TIN BÁC SĨ - DỮ LIỆU DEMO ĐỒ ÁN
// ============================================================
// Mục tiêu: không sinh/lưu các hồ sơ vô lý, ví dụ:
// - 30 tuổi nhưng 15 năm kinh nghiệm
// - 3 năm kinh nghiệm nhưng đã là Tiến sĩ
// - Học vị/trình độ cao hơn mức tuổi + kinh nghiệm có thể giải thích được
//
// LƯU Ý:
// Đây là quy ước nhất quán cho DỮ LIỆU DEMO của đồ án, không phải
// quy định pháp lý về đào tạo/chức danh bác sĩ tại Việt Nam.
//
// Quy ước chung của nhóm:
// - Sớm nhất 28 tuổi mới bắt đầu tính kinh nghiệm hành nghề.
// - Kinh nghiệm tối đa = tuổi - 28.
// - Trình độ sau đại học chỉ được chọn khi đạt ngưỡng tuổi và
//   kinh nghiệm tối thiểu bên dưới.

const QUALIFICATION_RULES = [
  {
    value: 'Bác sĩ',
    label: 'Bác sĩ',
    minAge: 28,
    minExperience: 0,
    note: 'Trình độ cơ bản; phù hợp với bác sĩ mới bắt đầu hành nghề.'
  },
  {
    value: 'BS.CKI',
    label: 'Bác sĩ Chuyên khoa I (BS.CKI)',
    minAge: 32,
    minExperience: 4,
    note: 'Chỉ gán khi bác sĩ đã có ít nhất 4 năm kinh nghiệm theo quy ước demo.'
  },
  {
    value: 'Thạc sĩ - Bác sĩ',
    label: 'Thạc sĩ - Bác sĩ',
    minAge: 32,
    minExperience: 4,
    note: 'Không gán cho bác sĩ quá trẻ hoặc kinh nghiệm quá thấp.'
  },
  {
    value: 'BS.CKII',
    label: 'Bác sĩ Chuyên khoa II (BS.CKII)',
    minAge: 36,
    minExperience: 8,
    note: 'Ngưỡng cao hơn CKI để giữ dữ liệu demo hợp lý.'
  },
  {
    value: 'Tiến sĩ - Bác sĩ',
    label: 'Tiến sĩ - Bác sĩ',
    minAge: 38,
    minExperience: 10,
    note: 'Không cho phép trường hợp mới 2-3 năm kinh nghiệm đã là Tiến sĩ.'
  }
];

function currentYear() {
  return new Date().getFullYear();
}

function ageFromBirthYear(birthYear, year = currentYear()) {
  const y = Number(birthYear);
  if (!Number.isInteger(y)) return null;
  return year - y;
}

function maxExperienceForAge(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return 0;
  return Math.max(0, Math.floor(a - 28));
}

function normalizeExperience(age, yearsExperience) {
  const exp = Number(yearsExperience);
  const safeExp = Number.isFinite(exp) ? Math.max(0, Math.floor(exp)) : 0;
  return Math.min(safeExp, maxExperienceForAge(age));
}

function allowedQualifications(age, yearsExperience) {
  const a = Number(age);
  const e = Number(yearsExperience);
  return QUALIFICATION_RULES.filter((rule) => a >= rule.minAge && e >= rule.minExperience);
}

function isQualificationAllowed(age, yearsExperience, qualification) {
  const q = String(qualification || '').trim();
  return allowedQualifications(age, yearsExperience).some((rule) => rule.value === q);
}

function highestAllowedQualification(age, yearsExperience) {
  const allowed = allowedQualifications(age, yearsExperience);
  return allowed.length ? allowed[allowed.length - 1].value : 'Bác sĩ';
}

function normalizeQualification(age, yearsExperience, qualification) {
  const q = String(qualification || '').trim();
  if (q && isQualificationAllowed(age, yearsExperience, q)) return q;
  return highestAllowedQualification(age, yearsExperience);
}

// Sinh học vị demo tự nhiên hơn:
// - Không phải ai đủ tuổi/kinh nghiệm cũng tự động có học vị cao nhất.
// - Tuyệt đối không gán học vị vượt ngưỡng logic.
function qualificationForSeed(age, yearsExperience, serial = 1) {
  const e = Number(yearsExperience);
  const allowed = allowedQualifications(age, e);
  if (!allowed.length || e < 4) return 'Bác sĩ';

  if (e < 8) {
    return serial % 3 === 0 && allowed.some((r) => r.value === 'Thạc sĩ - Bác sĩ')
      ? 'Thạc sĩ - Bác sĩ'
      : 'BS.CKI';
  }

  if (e < 10) {
    return serial % 2 === 0 && allowed.some((r) => r.value === 'BS.CKII')
      ? 'BS.CKII'
      : (allowed.some((r) => r.value === 'Thạc sĩ - Bác sĩ') ? 'Thạc sĩ - Bác sĩ' : 'BS.CKI');
  }

  // Từ 10 năm trở lên: Tiến sĩ chỉ xuất hiện ở một tỷ lệ nhỏ.
  if (allowed.some((r) => r.value === 'Tiến sĩ - Bác sĩ') && serial % 5 === 0) {
    return 'Tiến sĩ - Bác sĩ';
  }
  if (allowed.some((r) => r.value === 'BS.CKII') && serial % 2 === 0) return 'BS.CKII';
  if (allowed.some((r) => r.value === 'Thạc sĩ - Bác sĩ')) return 'Thạc sĩ - Bác sĩ';
  return 'BS.CKI';
}

function validateDoctorProfile({ birthYear, yearsExperience, qualification }) {
  const age = ageFromBirthYear(birthYear);
  if (!Number.isInteger(Number(birthYear)) || age < 28 || age > 75) {
    return { ok: false, message: 'Tuổi bác sĩ phải từ 28 đến 75 trong dữ liệu demo.' };
  }

  const exp = Number(yearsExperience);
  const maxExp = maxExperienceForAge(age);
  if (!Number.isInteger(exp) || exp < 0 || exp > maxExp) {
    return {
      ok: false,
      message: `Bác sĩ ${age} tuổi chỉ có thể có tối đa ${maxExp} năm kinh nghiệm theo quy ước của đồ án.`
    };
  }

  if (!isQualificationAllowed(age, exp, qualification)) {
    const allowed = allowedQualifications(age, exp).map((rule) => rule.value).join(', ');
    return {
      ok: false,
      message: `Trình độ "${qualification || 'Chưa nhập'}" không phù hợp với bác sĩ ${age} tuổi, ${exp} năm kinh nghiệm. Có thể chọn: ${allowed || 'Bác sĩ'}.`
    };
  }

  return { ok: true, age, maxExperience: maxExp };
}

module.exports = {
  QUALIFICATION_RULES,
  ageFromBirthYear,
  maxExperienceForAge,
  normalizeExperience,
  allowedQualifications,
  isQualificationAllowed,
  highestAllowedQualification,
  normalizeQualification,
  qualificationForSeed,
  validateDoctorProfile
};
