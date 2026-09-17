const QueueManager = require('./QueueManager');
const RecentDeque = require('./RecentDeque');
const { RECENT_PATIENT_LIMIT } = require('../config');

class ClinicState {
  constructor() {
    // MC1: tra cứu trực tiếp bệnh nhân / bệnh án theo mã.
    this.patientByCode = new Map();
    this.recordByCode = new Map();

    // Một bệnh nhân chỉ có tối đa một lượt khám đang hoạt động.
    // Các trạng thái hoạt động: WAITING, CALLED, EXAMINING.
    this.activePatient = new Map(); // patientCode -> visitId

    // MC2 + TP1 + TP2 + TP3: mỗi bác sĩ có một Indexed Priority Queue.
    this.queueManager = new QueueManager();

    // TP5: K hồ sơ vừa hoàn tất.
    this.recentCompleted = new RecentDeque(RECENT_PATIENT_LIMIT);
  }

  clear() {
    this.patientByCode.clear();
    this.recordByCode.clear();
    this.activePatient.clear();
    this.queueManager = new QueueManager();
    this.recentCompleted = new RecentDeque(RECENT_PATIENT_LIMIT);
  }
}

module.exports = new ClinicState();
