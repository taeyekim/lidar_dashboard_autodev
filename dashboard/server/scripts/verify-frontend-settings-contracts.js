const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const settingsPage = readProjectFile("dashboard/dashboard-web/src/pages/Settings/SettingsPage.jsx");

[
  "fetchSystemStatus",
  "fetchControlBoardStatus",
  "useAuth",
  "HttpOnly",
  "CSRF",
  "DRY_RUN",
  "LIVE_TCP",
  "LIVE_TCP 승인 상태",
  "CONTROL_BOARD_LIVE_APPROVED=true",
  "LIVE_TCP_APPROVAL_REQUIRED",
  "liveApproved",
  "safetyStatus",
  "vehicle_tracks",
  "X-CSRF-Token",
  "TCP ACK 평균 응답",
  "averageResponseMs",
  "responseSampleCount",
  "formatDurationMs",
].forEach((token) => {
  assert(settingsPage.includes(token), `Settings page must include ${token}`);
});

["목업", "mock 상태", "아직 목업", "TODO", "FIXME", "�"].forEach((token) => {
  assert(!settingsPage.includes(token), `Settings page must not expose placeholder text: ${token}`);
});

["일반", "알림", "보안", "화면"].forEach((label) => {
  assert(settingsPage.includes(label), `Settings page must expose ${label} section`);
});

console.log("frontend settings contracts ok");
