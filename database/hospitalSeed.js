// ============================================================
// DỮ LIỆU CẤU TRÚC BỆNH VIỆN
// ============================================================
// parentGroup = KHOA mà bệnh nhân được chọn.
// unitName    = CHUYÊN NGÀNH mà bệnh nhân được chọn.
// Người bệnh KHÔNG chọn phòng và KHÔNG chọn bác sĩ.
// Phòng + bác sĩ được hệ thống tự phân sau khi kiểm tra lịch trực.

const rawUnits = [
  // ---------------- KHỐI LÂM SÀNG ----------------
  ['LS', 'Khối Lâm sàng', 'Khoa Khám bệnh & Cấp cứu', 'LS001', 'Cấp cứu – Hồi sức tích cực & Chống độc (ICU)', 'CLINICAL', 1, 4, 1],
  ['LS', 'Khối Lâm sàng', 'Khoa Khám bệnh & Cấp cứu', 'LS002', 'Khám bệnh ngoại trú', 'CLINICAL', 1, 4, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS003', 'Nội Tim mạch & Can thiệp mạch', 'CLINICAL', 1, 3, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS004', 'Nội Hô hấp', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS005', 'Nội Tiêu hóa – Gan mật', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS006', 'Nội Thần kinh', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS007', 'Nội Tiết – Đái tháo đường', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS008', 'Nội Thận – Lọc máu', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS009', 'Cơ Xương Khớp', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS010', 'Huyết học truyền máu lâm sàng', 'CLINICAL', 1, 1, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nội', 'LS011', 'Truyền nhiễm (Bệnh nhiệt đới)', 'CLINICAL', 1, 2, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS012', 'Ngoại Chấn thương chỉnh hình', 'CLINICAL', 1, 3, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS013', 'Ngoại Thần kinh – Cột sống', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS014', 'Ngoại Tiêu hóa – Gan mật tụy', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS015', 'Ngoại Thận – Tiết niệu', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS016', 'Ngoại Lồng ngực – Mạch máu', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ngoại', 'LS017', 'Gây mê hồi sức', 'CLINICAL', 1, 2, 1],

  ['LS', 'Khối Lâm sàng', 'Khoa Sản – Phụ khoa', 'LS018', 'Sản khoa', 'CLINICAL', 1, 3, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Sản – Phụ khoa', 'LS019', 'Phụ khoa', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Sản – Phụ khoa', 'LS020', 'Hỗ trợ sinh sản', 'CLINICAL', 1, 1, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Nhi', 'LS021', 'Nhi sơ sinh', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Nhi', 'LS022', 'Hồi sức cấp cứu nhi', 'CLINICAL', 1, 3, 1],
  ['LS', 'Khối Lâm sàng', 'Khoa Nhi', 'LS023', 'Nhi tổng quát', 'CLINICAL', 1, 3, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Mắt', 'LS024', 'Nhãn khoa', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Tai Mũi Họng', 'LS025', 'Tai Mũi Họng', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Răng Hàm Mặt', 'LS026', 'Răng Hàm Mặt', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Da liễu', 'LS027', 'Da liễu', 'CLINICAL', 1, 2, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Ung bướu', 'LS028', 'Nội ung bướu', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ung bướu', 'LS029', 'Xạ trị', 'CLINICAL', 1, 1, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Ung bướu', 'LS030', 'Ngoại ung bướu', 'CLINICAL', 1, 2, 0],

  ['LS', 'Khối Lâm sàng', 'Khoa Phục hồi chức năng', 'LS031', 'Phục hồi chức năng – Vật lý trị liệu', 'CLINICAL', 1, 2, 0],
  ['LS', 'Khối Lâm sàng', 'Khoa Y học cổ truyền', 'LS032', 'Y học cổ truyền', 'CLINICAL', 1, 1, 0],

  // ---------------- KHỐI CẬN LÂM SÀNG ----------------
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Chẩn đoán hình ảnh', 'CLS001', 'X-quang thường quy', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Chẩn đoán hình ảnh', 'CLS002', 'Cắt lớp vi tính (CT Scanner)', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Chẩn đoán hình ảnh', 'CLS003', 'Cộng hưởng từ (MRI)', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Chẩn đoán hình ảnh', 'CLS004', 'Siêu âm tổng quát và Doppler', 'PARACLINICAL', 1, 3, 0],

  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS005', 'Điện tim (ECG)', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS006', 'Điện não (EEG)', 'PARACLINICAL', 1, 1, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS007', 'Đo chức năng hô hấp', 'PARACLINICAL', 1, 1, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS008', 'Nội soi dạ dày', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS009', 'Nội soi đại tràng', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Thăm dò chức năng & Nội soi', 'CLS010', 'Nội soi phế quản', 'PARACLINICAL', 1, 1, 0],

  ['CLS', 'Khối Cận lâm sàng', 'Khoa Xét nghiệm', 'CLS011', 'Huyết học', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Xét nghiệm', 'CLS012', 'Sinh hóa', 'PARACLINICAL', 1, 3, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Xét nghiệm', 'CLS013', 'Miễn dịch', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Xét nghiệm', 'CLS014', 'Vi sinh – Ký sinh trùng', 'PARACLINICAL', 1, 2, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Xét nghiệm', 'CLS015', 'Sinh học phân tử', 'PARACLINICAL', 1, 2, 0],

  ['CLS', 'Khối Cận lâm sàng', 'Khoa Giải phẫu bệnh', 'CLS016', 'Sinh thiết mô bệnh học & tế bào học', 'PARACLINICAL', 1, 1, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Dược & Kiểm soát nhiễm khuẩn', 'CLS017', 'Dược lâm sàng', 'PARACLINICAL', 0, 1, 0],
  ['CLS', 'Khối Cận lâm sàng', 'Khoa Dược & Kiểm soát nhiễm khuẩn', 'CLS018', 'Kiểm soát nhiễm khuẩn', 'PARACLINICAL', 0, 1, 0],

  // ---------------- KHỐI HÀNH CHÍNH ----------------
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC001', 'Phòng Kế hoạch tổng hợp', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC002', 'Phòng Quản lý chất lượng & Công tác xã hội', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC003', 'Phòng Điều dưỡng', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC004', 'Phòng Tổ chức cán bộ', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC005', 'Phòng Tài chính kế toán', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC006', 'Phòng Hành chính quản trị', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC007', 'Phòng Vật tư – Thiết bị y tế', 'ADMIN', 0, 1, 0],
  ['HC', 'Khối Quản trị & Hỗ trợ', 'Hành chính', 'HC008', 'Phòng Công nghệ thông tin', 'ADMIN', 0, 1, 0]
];

const units = rawUnits.map(([
  blockCode, blockName, parentGroup, unitCode, unitName,
  unitType, queueEnabled, busyLevel, is24Hours
]) => ({
  blockCode,
  blockName,
  parentGroup,
  unitCode,
  unitName,
  unitType,
  queueEnabled,
  busyLevel,
  is24Hours,
  // Giờ hoạt động chuẩn cho các khoa không chạy 24/7.
  openTime: '07:30',
  lunchStart: '11:30',
  lunchEnd: '13:00',
  closeTime: '17:00'
}));

const firstNames = ['An', 'Anh', 'Binh', 'Chau', 'Cuong', 'Dung', 'Duy', 'Giang', 'Ha', 'Hai', 'Hanh', 'Hieu', 'Hoa', 'Hoang', 'Hung', 'Huy', 'Khanh', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'Nam', 'Nga', 'Ngoc', 'Nhi', 'Phong', 'Phuc', 'Quan', 'Quynh', 'Son', 'Trang', 'Trinh', 'Tuan', 'Vy'];
const middleNames = ['Van', 'Thi', 'Duc', 'Minh', 'Gia', 'Thanh', 'Quoc', 'Ngoc', 'Hoai', 'Xuan'];
const lastNames = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Huynh', 'Phan', 'Vu', 'Vo', 'Dang', 'Bui', 'Do'];
const provinces = ['Ha Noi', 'TP Ho Chi Minh', 'Hai Phong', 'Da Nang', 'Can Tho', 'Bac Ninh', 'Hung Yen', 'Hai Duong', 'Ha Nam', 'Nam Dinh', 'Thanh Hoa', 'Nghe An'];
const qualifications = ['Bác sĩ', 'BS.CKI', 'BS.CKII', 'Thạc sĩ - Bác sĩ', 'Tiến sĩ - Bác sĩ'];

function seededName(index) {
  return `${lastNames[index % lastNames.length]} ${middleNames[(index * 7) % middleNames.length]} ${firstNames[(index * 13) % firstNames.length]}`;
}

function doctorCountForUnit(unit) {
  if (!unit.queueEnabled) return 0;
  if (unit.busyLevel === 4) return 20;
  if (unit.busyLevel === 3) return 15;
  if (unit.busyLevel === 2) return 10;
  return 5;
}

module.exports = {
  units,
  provinces,
  qualifications,
  seededName,
  doctorCountForUnit
};
