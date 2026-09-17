const { run, all } = require('../database/db');

(async () => {
  const currentYear = new Date().getFullYear();
  const result = await run(`
    UPDATE doctors
    SET years_experience = CASE
      WHEN birth_year IS NULL THEN years_experience
      WHEN (? - birth_year) < 28 THEN 0
      WHEN years_experience < 0 THEN 0
      WHEN years_experience > (? - birth_year - 28)
        THEN (? - birth_year - 28)
      ELSE years_experience
    END
  `, [currentYear, currentYear, currentYear]);

  const bad = await all(`
    SELECT doctor_code, full_name, birth_year, years_experience
    FROM doctors
    WHERE birth_year IS NOT NULL
      AND years_experience > MAX(0, ? - birth_year - 28)
  `, [currentYear]);

  console.log(`Đã cập nhật ${result.changes} bản ghi bác sĩ.`);
  console.log(`Số bản ghi còn sai sau kiểm tra: ${bad.length}`);
})();
