const assert = require('assert');
const IndexedPriorityQueue = require('../services/IndexedPriorityQueue');
const RecentDeque = require('../services/RecentDeque');

function item(visitId, priority, time, extra = {}) {
  return {
    visitId,
    basePriority: priority,
    priority,
    checkInAt: time,
    latePenalty: 0,
    agingPromotions: 0,
    doctorId: '1',
    patientCode: `BN${visitId}`,
    ...extra
  };
}

// MC2: priority trước, sau đó check-in sớm hơn.
const q = new IndexedPriorityQueue();
q.push(item(1, 3, '2026-09-16T08:00:00Z'));
q.push(item(2, 1, '2026-09-16T08:30:00Z'));
q.push(item(3, 2, '2026-09-16T08:20:00Z'));
q.push(item(4, 2, '2026-09-16T08:10:00Z'));
assert.deepStrictEqual(q.toSortedArray().map(x => x.visitId), [2, 4, 3, 1]);

// TP1: nâng priority phải tái định vị bệnh nhân lên đầu Heap.
q.updatePriority(1, 1);
assert.strictEqual(q.peek().visitId, 1);

// Aging dùng updateItem: thay nhiều thuộc tính nhưng Heap vẫn đúng.
q.updateItem(3, { priority: 1, agingPromotions: 1 });
assert.strictEqual(q.get(3).agingPromotions, 1);

// TP3: xóa ngẫu nhiên một phần tử, Heap còn lại vẫn hợp lệ.
q.remove(4);
assert.strictEqual(q.has(4), false);
assert.deepStrictEqual(q.toSortedArray().map(x => x.visitId), [1, 3, 2]);

// TP5: Circular Deque chỉ giữ K phần tử mới nhất.
const recent = new RecentDeque(3);
recent.pushFront('A');
recent.pushFront('B');
recent.pushFront('C');
recent.pushFront('D');
assert.deepStrictEqual(recent.toArray(), ['D', 'C', 'B']);

console.log('DSA tests passed');
