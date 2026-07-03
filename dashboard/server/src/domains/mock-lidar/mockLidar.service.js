const { nowTime } = require("../../utils/time");
const { logger } = require("../../utils/logger");

let broadcast = () => {};

function setBroadcaster(fn) {
  broadcast = typeof fn === "function" ? fn : () => {};
}

const state = {
  siteId: "Site-01",
  deviceId: "LIDAR-01",

  todaysEvents: 0,
  newEvents: 0,
  vehiclesPassed: 0,
  wrongWayEvents: 0,
  unidentified: 0,
  hourlyEvents: Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    events: 0,
  })),

  lidar: { pts: 2405, hz: 10 },

  gate: "CLOSED",
  vmsLast: "",
};

let wrongWayHistory = [];
const MAX_HISTORY = 30;

let logs = [
  { msg: "System boot completed", time: nowTime() },
  { msg: "Dashboard event pipeline ready", time: nowTime() },
];

function getState() {
  return state;
}

function getControlStatus() {
  // 현장 테스트 중에는 차단기/VMS/라이다 표시 상태를 한 번에 확인해야 한다.
  // 기존 /state는 화면 전체 KPI까지 포함하므로, 제어 장비 확인용으로 필요한 값만 따로 묶어 반환한다.
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    siteId: state.siteId,
    deviceId: state.deviceId,
    gate: state.gate,
    vmsLast: state.vmsLast,
    lidar: state.lidar,
    counters: {
      todaysEvents: state.todaysEvents,
      newEvents: state.newEvents,
      wrongWayEvents: state.wrongWayEvents,
      vehiclesPassed: state.vehiclesPassed,
    },
  };
}

function getLogs(limit = 10) {
  return logs.slice(0, limit);
}

function getWrongWayHistory() {
  return wrongWayHistory;
}

function pushLog(msg) {
  const item = { msg, time: nowTime() };
  logs.unshift(item);
  if (logs.length > 30) logs = logs.slice(0, 30);
  broadcast("log", item);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function openGate() {
  state.gate = "OPENED";
  logger.info("mock barrier opened");
  pushLog("Barrier OPEN requested");
  broadcast("state", state);
  return state.gate;
}

function closeGate() {
  state.gate = "CLOSED";
  logger.info("mock barrier closed");
  pushLog("Barrier CLOSE requested");
  broadcast("state", state);
  return state.gate;
}

function setVmsText(text) {
  const safeText = String(text ?? "").slice(0, 80);
  state.vmsLast = safeText;
  logger.info("mock vms text requested", { text: safeText });
  pushLog(`VMS requested: ${safeText || "(empty)"}`);
  broadcast("state", state);
  return state.vmsLast;
}

function increaseVehiclePassed() {
  state.vehiclesPassed += 1;
  broadcast("state", state);
  return state.vehiclesPassed;
}

function applyDashboardEventEffects(dashboardEvent) {
  state.todaysEvents += 1;
  state.newEvents += 1;

  const currentHour = new Date().getHours();
  if (state.hourlyEvents[currentHour]) {
    state.hourlyEvents[currentHour].events += 1;
  }

  if (dashboardEvent.type === "wrong-way") state.wrongWayEvents += 1;
  if (dashboardEvent.type === "unidentified") state.unidentified += 1;
}

function addWrongWayHistory(dashboardEvent) {
  wrongWayHistory.unshift(dashboardEvent);
  if (wrongWayHistory.length > MAX_HISTORY) {
    wrongWayHistory = wrongWayHistory.slice(0, MAX_HISTORY);
  }
}

function resetKpi() {
  state.todaysEvents = 0;
  state.newEvents = 0;
  state.vehiclesPassed = 0;
  state.wrongWayEvents = 0;
  state.unidentified = 0;
  state.hourlyEvents.forEach((h) => {
    h.events = 0;
  });
  wrongWayHistory = [];
  broadcast("state", state);
}

function updateLidarStats() {
  state.lidar.pts += Math.floor(Math.random() * 11) - 5;
  state.lidar.pts = clamp(state.lidar.pts, 0, 999999);
  state.lidar.hz = 10 + (Math.random() < 0.5 ? 0 : 1);
  broadcast("state", state);
}

function broadcastDashboardEvent(dashboardEvent) {
  broadcast("dashboard-event", dashboardEvent);
  broadcast("state", state);
}

module.exports = {
  setBroadcaster,
  getState,
  getControlStatus,
  getLogs,
  getWrongWayHistory,
  pushLog,
  openGate,
  closeGate,
  setVmsText,
  increaseVehiclePassed,
  applyDashboardEventEffects,
  addWrongWayHistory,
  resetKpi,
  updateLidarStats,
  broadcastDashboardEvent,
};
