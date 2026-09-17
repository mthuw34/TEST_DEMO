# Hospital Queue DSA V3.6

Bản V3.6 tập trung vào 2 thay đổi:

1. **Kiểm tra logic toàn bộ hồ sơ bác sĩ** (tuổi - kinh nghiệm - trình độ - liên hệ - ca trực).

## Chạy project

Yêu cầu: Node.js 22+.

```powershell
npm start
```

Mở:

- http://localhost:3000/queue.html
- http://localhost:3000/doctors.html
- http://localhost:3000/examining.html
- http://localhost:3000/records.html

Không cần `npm install` vì project chỉ dùng module tích hợp của Node.js.

## Quy tắc logic bác sĩ (dữ liệu demo)

> Đây là quy tắc nhất quán cho đồ án, không phải quy định pháp lý về đào tạo/chức danh bác sĩ.

- Bác sĩ bắt đầu tính kinh nghiệm sớm nhất từ **28 tuổi**.
- Kinh nghiệm tối đa = `tuổi - 28`.
- **Bác sĩ:** từ 28 tuổi, 0 năm kinh nghiệm.
- **BS.CKI:** tối thiểu 32 tuổi và 4 năm kinh nghiệm.
- **Thạc sĩ - Bác sĩ:** tối thiểu 32 tuổi và 4 năm kinh nghiệm.
- **BS.CKII:** tối thiểu 36 tuổi và 8 năm kinh nghiệm.
- **Tiến sĩ - Bác sĩ:** tối thiểu 38 tuổi và 10 năm kinh nghiệm.
- Dữ liệu seed không tự động cho tất cả bác sĩ lâu năm thành Tiến sĩ; chỉ một tỷ lệ nhỏ được gán mức này.
- Số điện thoại bác sĩ: 10 chữ số, bắt đầu bằng `0`.
- Email phải đúng định dạng.
- Giới tính chỉ nhận `Nam`, `Nữ`, `Khác`.
- Ca trực không được có giờ bắt đầu >= giờ kết thúc và không được chồng lấn cùng ngày.
- Bác sĩ khoa thường được seed 5 ngày làm việc/tuần; khoa 24/7 được chia ca 8 tiếng và ngày nghỉ luân phiên.

### Sửa database cũ mà không xóa bệnh nhân

```powershell
npm run fix-doctor-logic
```

Lệnh này chỉ chuẩn hóa kinh nghiệm và trình độ của bác sĩ hiện có.

### Tạo lại toàn bộ dữ liệu demo

```powershell
npm run reset-db
npm start
```

## Test

```powershell
npm test
```

Bao gồm:

- test cấu trúc DSA;
- test lịch hoạt động;
- test logic tuổi/kinh nghiệm/trình độ bác sĩ.

