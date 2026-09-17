// ============================================================
// CẤU HÌNH CHUNG - HỆ THỐNG BỆNH VIỆN / HÀNG ĐỢI DSA
// ============================================================

module.exports = {
  // Số lượng bệnh nhân giả lập để demo MC1 ở quy mô lớn.
  DEFAULT_PATIENT_COUNT: Number(process.env.SEED_PATIENT_COUNT || 20000),

  // Số bệnh nhân vừa khám xong cần giữ để xem nhanh.
  RECENT_PATIENT_LIMIT: 10,

  // Aging: sau N lượt khác được phục vụ hoặc N phút chờ,
  // bệnh nhân mức ưu tiên thấp có thể được nâng dần.
  AGING_AFTER_SERVED: Number(process.env.AGING_AFTER_SERVED || 5),
  AGING_AFTER_MINUTES: Number(process.env.AGING_AFTER_MINUTES || 45),

  // Với khoa không hoạt động 24/7: ngừng nhận check-in mới
  // khi còn ít hơn số phút này tới giờ kết thúc buổi chiều.
  LAST_CHECKIN_MINUTES_BEFORE_CLOSE: 30,

  // Phân trang danh sách hồ sơ đã khám.
  RECORD_PAGE_SIZE: 30
};
