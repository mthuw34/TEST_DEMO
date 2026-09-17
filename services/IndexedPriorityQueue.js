// ============================================================
// MC2 + TP1 + TP3: INDEXED PRIORITY QUEUE
// Binary Heap + Map(visitId -> vị trí trong Heap)
// ============================================================
// Vì sao cần Map vị trí?
// - Heap thường lấy phần tử đầu rất nhanh nhưng không tìm phần tử giữa nhanh.
// - TP1 cần đổi priority của một bệnh nhân đang ở vị trí bất kỳ.
// - TP3 cần xóa một bệnh nhân ở vị trí bất kỳ.
// -> Map cho phép tìm index trung bình O(1), sau đó Heap tái cân bằng O(log n).

class IndexedPriorityQueue {
  constructor() {
    this.heap = [];
    this.position = new Map(); // visitId -> heap index
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  has(visitId) {
    return this.position.has(String(visitId));
  }

  // Trả về true nếu a phải đứng trước b.
  // Quy tắc:
  // 1. Số priority nhỏ hơn -> khẩn cấp hơn -> đứng trước.
  // 2. Cùng priority: check-in sớm hơn đứng trước.
  // 3. Nếu vẫn bằng nhau, visitId nhỏ hơn đứng trước để kết quả ổn định.
  higherPriority(a, b) {
    if (a.priority !== b.priority) return a.priority < b.priority;

    const aTime = new Date(a.checkInAt).getTime();
    const bTime = new Date(b.checkInAt).getTime();
    if (aTime !== bTime) return aTime < bTime;

    // visitId dùng làm tie-break cuối cùng để kết quả ổn định.
    return Number(a.visitId) < Number(b.visitId);
  }

  // Thêm bệnh nhân mới: O(log n).
  push(item) {
    const key = String(item.visitId);
    if (this.position.has(key)) throw new Error(`Visit ${item.visitId} is already in the queue`);

    this.heap.push(item);
    const index = this.heap.length - 1;
    this.position.set(key, index);
    this.bubbleUp(index);
    return item;
  }

  // Xem bệnh nhân ưu tiên nhất: O(1).
  peek() {
    return this.heap.length ? this.heap[0] : null;
  }

  // Lấy bệnh nhân ưu tiên nhất: O(log n).
  pop() {
    if (!this.heap.length) return null;
    return this.remove(this.heap[0].visitId);
  }

  // TP1: cập nhật priority và tái định vị: O(log n).
  updatePriority(visitId, newPriority) {
    const key = String(visitId);
    const index = this.position.get(key);
    if (index === undefined) return null;

    const oldPriority = this.heap[index].priority;
    this.heap[index].priority = newPriority;

    if (newPriority < oldPriority) this.bubbleUp(index);
    else if (newPriority > oldPriority) this.bubbleDown(index);

    return this.heap[this.position.get(key)];
  }

  // Cập nhật nhiều thuộc tính và phục hồi Heap.
  updateItem(visitId, patch) {
    const key = String(visitId);
    const index = this.position.get(key);
    if (index === undefined) return null;

    Object.assign(this.heap[index], patch);
    const movedIndex = this.bubbleUp(index);
    this.bubbleDown(movedIndex);
    return this.heap[this.position.get(key)];
  }

  // TP3: xóa một phần tử ở bất kỳ vị trí nào: O(log n).
  remove(visitId) {
    const key = String(visitId);
    const index = this.position.get(key);
    if (index === undefined) return null;

    const lastIndex = this.heap.length - 1;
    const removed = this.heap[index];

    // Đổi phần tử cần xóa với phần tử cuối rồi pop.
    this.swap(index, lastIndex);
    this.heap.pop();
    this.position.delete(key);

    // Phần tử vừa được đổi vào vị trí index có thể cần đi lên hoặc đi xuống.
    if (index < this.heap.length) {
      const movedIndex = this.bubbleUp(index);
      this.bubbleDown(movedIndex);
    }

    return removed;
  }

  get(visitId) {
    const index = this.position.get(String(visitId));
    return index === undefined ? null : this.heap[index];
  }

  // Chỉ tạo snapshot để giao diện hiển thị theo thứ tự.
  // Không dùng sort này để vận hành hàng đợi thực tế.
  toSortedArray() {
    return [...this.heap].sort((a, b) => {
      if (this.higherPriority(a, b)) return -1;
      if (this.higherPriority(b, a)) return 1;
      return 0;
    });
  }

  parent(index) { return Math.floor((index - 1) / 2); }
  left(index) { return index * 2 + 1; }
  right(index) { return index * 2 + 2; }

  bubbleUp(startIndex) {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = this.parent(index);
      if (!this.higherPriority(this.heap[index], this.heap[parentIndex])) break;
      this.swap(index, parentIndex);
      index = parentIndex;
    }
    return index;
  }

  bubbleDown(startIndex) {
    let index = startIndex;

    while (true) {
      const left = this.left(index);
      const right = this.right(index);
      let best = index;

      if (left < this.heap.length && this.higherPriority(this.heap[left], this.heap[best])) best = left;
      if (right < this.heap.length && this.higherPriority(this.heap[right], this.heap[best])) best = right;
      if (best === index) break;

      this.swap(index, best);
      index = best;
    }
    return index;
  }

  // Mỗi lần swap phải cập nhật Map vị trí đi kèm.
  swap(i, j) {
    if (i === j) return;
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.position.set(String(this.heap[i].visitId), i);
    this.position.set(String(this.heap[j].visitId), j);
  }
}

module.exports = IndexedPriorityQueue;
