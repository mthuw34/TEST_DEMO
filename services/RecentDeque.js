// ============================================================
// TP5 - CIRCULAR DEQUE GIỚI HẠN K BỆNH NHÂN VỪA KHÁM
// ============================================================
// Mục tiêu:
// - Bệnh nhân vừa khám xong được đưa lên đầu danh sách.
// - Chỉ giữ tối đa K phần tử gần nhất.
// - Dùng mảng vòng để thao tác đầu deque là O(1).

class RecentDeque {
  constructor(capacity = 5) {
    this.capacity = capacity;
    this.data = new Array(capacity);
    this.front = 0;   // vị trí phần tử mới nhất
    this.length = 0;  // số phần tử hiện đang lưu
  }

  // Thêm phần tử mới vào đầu deque.
  // Khi đã đủ K phần tử, dữ liệu cũ nhất tự bị ghi đè.
  pushFront(item) {
    if (this.capacity <= 0) return;

    this.front = (this.front - 1 + this.capacity) % this.capacity;
    this.data[this.front] = item;

    if (this.length < this.capacity) {
      this.length += 1;
    }
  }

  // Trả về snapshot theo thứ tự: mới nhất -> cũ nhất.
  toArray() {
    const output = [];
    for (let i = 0; i < this.length; i += 1) {
      output.push(this.data[(this.front + i) % this.capacity]);
    }
    return output;
  }
}

module.exports = RecentDeque;
