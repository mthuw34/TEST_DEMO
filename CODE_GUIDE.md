# CODE GUIDE - V3.6

## 1. Logic bác sĩ

File chính:

`services/DoctorQualificationPolicy.js`

Chứa một nguồn quy tắc duy nhất cho:

- tuổi tối thiểu;
- kinh nghiệm tối đa theo tuổi;
- mức tuổi/kinh nghiệm tối thiểu cho từng trình độ;
- chuẩn hóa dữ liệu cũ;
- validate khi người dùng sửa hồ sơ bác sĩ.

### Dữ liệu seed

`database/init.js`

- Tuổi bác sĩ demo: 28-61.
- Kinh nghiệm được suy ra từ tuổi, không sinh độc lập.
- `qualificationForSeed()` quyết định trình độ nhưng không vượt quy tắc.
- Bác sĩ khoa thường: 5 ngày làm việc/tuần.
- Khoa 24/7: chia 3 ca 8 tiếng, ngày nghỉ luân phiên.

### Giao diện chỉnh bác sĩ

`public/doctors.html`
`public/js/doctors.js`

- Ô trình độ là dropdown.
- Danh sách trình độ thay đổi theo tuổi + số năm kinh nghiệm.
- Hiện giới hạn kinh nghiệm ngay dưới form.

### Backend kiểm tra lần cuối

`server.js`

API `PATCH /api/doctors/:id/profile` kiểm tra:

- tên;
- tuổi;
- giới tính;
- điện thoại;
- email;
- kinh nghiệm;
- trình độ.

API ca trực còn kiểm tra trùng giờ.

## 3. Cấu trúc DSA giữ nguyên

- MC1: `Map` trong `services/ClinicState.js`.
- MC2/TP1/TP3: `services/IndexedPriorityQueue.js`.
- Quản lý nhiều hàng đợi bác sĩ: `services/QueueManager.js`.
- TP5: `services/RecentDeque.js`.
- Lịch hoạt động: `services/ScheduleService.js`.


## Hồ sơ đã khám ở V3.9

- `public/js/records.js`: chỉ tra cứu và hiển thị chi tiết bệnh án.
- Không có chức năng xuất/tải file bệnh án từ giao diện.
