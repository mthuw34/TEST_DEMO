const IndexedPriorityQueue = require('./IndexedPriorityQueue');

// ============================================================
// QUẢN LÝ NHIỀU HÀNG ĐỢI THEO BÁC SĨ
// ============================================================
// Mỗi bác sĩ có một IndexedPriorityQueue riêng.
// visitToDoctor giúp tìm nhanh một lượt khám đang nằm trong queue của bác sĩ nào.

class QueueManager {
  constructor() {
    this.queues = new Map();        // doctorId -> IndexedPriorityQueue
    this.visitToDoctor = new Map(); // visitId  -> doctorId
  }

  getQueue(doctorId) {
    const key = String(doctorId);
    if (!this.queues.has(key)) this.queues.set(key, new IndexedPriorityQueue());
    return this.queues.get(key);
  }

  add(item) {
    const queue = this.getQueue(item.doctorId);
    queue.push(item);
    this.visitToDoctor.set(String(item.visitId), String(item.doctorId));
  }

  get(visitId) {
    const doctorId = this.visitToDoctor.get(String(visitId));
    if (!doctorId) return null;
    return this.getQueue(doctorId).get(visitId);
  }

  remove(visitId) {
    const key = String(visitId);
    const doctorId = this.visitToDoctor.get(key);
    if (!doctorId) return null;

    const item = this.getQueue(doctorId).remove(visitId);
    this.visitToDoctor.delete(key);
    return item;
  }

  updatePriority(visitId, newPriority) {
    const doctorId = this.visitToDoctor.get(String(visitId));
    if (!doctorId) return null;
    return this.getQueue(doctorId).updatePriority(visitId, newPriority);
  }

  // Cập nhật nhiều thuộc tính của item và tái cân bằng Heap.
  // Dùng cho TP1 và cơ chế aging.
  updateItem(visitId, patch) {
    const doctorId = this.visitToDoctor.get(String(visitId));
    if (!doctorId) return null;
    return this.getQueue(doctorId).updateItem(visitId, patch);
  }

  // TP2: chuyển bệnh nhân từ queue bác sĩ cũ sang queue bác sĩ mới.
  // checkInAt và priority nằm trong item nên được giữ nguyên.
  transfer(visitId, newDoctorId) {
    const item = this.remove(visitId);
    if (!item) return null;

    item.doctorId = String(newDoctorId);
    this.add(item);
    return item;
  }

  peek(doctorId) {
    return this.getQueue(doctorId).peek();
  }

  pop(doctorId) {
    const item = this.getQueue(doctorId).pop();
    if (item) this.visitToDoctor.delete(String(item.visitId));
    return item;
  }

  list(doctorId) {
    return this.getQueue(doctorId).toSortedArray();
  }

  all() {
    const result = [];
    for (const [doctorId, queue] of this.queues.entries()) {
      result.push({ doctorId, items: queue.toSortedArray() });
    }
    return result;
  }
}

module.exports = QueueManager;
