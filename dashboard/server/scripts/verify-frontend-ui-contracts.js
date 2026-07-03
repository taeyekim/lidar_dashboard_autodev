const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

function assertExcludes(content, token, label) {
  assert(!content.includes(token), `${label} must not include ${token}`);
}

const card = readProjectFile("dashboard/dashboard-web/src/shared/components/Card.jsx");
const devicesPage = readProjectFile("dashboard/dashboard-web/src/pages/Devices/DevicesPage.jsx");
const dashboardPage = readProjectFile("dashboard/dashboard-web/src/pages/Dashboard/DashboardPage.jsx");
const eventLogPage = readProjectFile("dashboard/dashboard-web/src/pages/EventLog/EventLogPage.jsx");
const wrongwayLogPage = readProjectFile("dashboard/dashboard-web/src/pages/Dashboard/WrongwayLogPage.jsx");
const trafficStatisticsPanel = readProjectFile(
  "dashboard/dashboard-web/src/components/dashboard/TrafficStatisticsPanel.jsx",
);
const appRouter = readProjectFile("dashboard/dashboard-web/src/app/router.jsx");
const todaysEventsPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "dashboard/dashboard-web/src/components/dashboard/TodaysEvents.jsx",
);

[
  "rounded border border-gray-200 bg-white p-4 shadow-sm",
  "border-b border-gray-200",
  "text-sm font-bold text-gray-800",
].forEach((token) => assertIncludes(card, token, "Card component production UI"));

["border-dashed", "border-2", "font-mono text-gray-500"].forEach((token) => {
  assertExcludes(card, token, "Card component debug UI");
});

assert(!fs.existsSync(todaysEventsPath), "Unused mock TodaysEvents component must not remain in frontend source");

[
  'lazy(() => import("../pages/Dashboard/DashboardPage"))',
  'lazy(() => import("../pages/EventLog/EventLogPage"))',
  'lazy(() => import("../pages/Devices/DevicesPage"))',
  "<Suspense fallback={<RouteFallback />}>",
].forEach((token) => assertIncludes(appRouter, token, "App router route-level lazy loading"));

[
  "import DashboardPage from",
  "import EventLogPage from",
  "import DevicesPage from",
  "import SettingsPage from",
  "import WrongwayLogPage from",
].forEach((token) => assertExcludes(appRouter, token, "App router static route import"));

[
  "장비 상태",
  "라이다 PC, 통합제어보드, 현장 구역 연동 상태",
  "등록 장비",
  "제어보드",
  "대상 설정됨",
  "대상 미설정",
  "ACK 평균",
  "averageResponseMs",
  "responseSampleCount",
  "liveTcpReady",
  "safetyStatus",
  "LIVE_TCP_READY",
  "LIVE_TCP_REVIEW",
  "DRY_RUN_SAFE",
  "등록된 장비가 없습니다.",
  "현장 장비 목록",
].forEach((token) => assertIncludes(devicesPage, token, "Devices page operations copy"));

[
  "이벤트 로그",
  "라이다 수신 이벤트, 관제 상태, 제어 명령 이력",
  "오늘 이벤트",
  "역주행 이벤트",
  "시간대별 이벤트 분포",
  "ID, 유형, 상태, 구역 검색",
  "이벤트 상세",
  "운영 메모",
  "통합제어보드 명령",
  "원본 payload JSON",
].forEach((token) => assertIncludes(eventLogPage, token, "Event log operations copy"));

[
  "역주행 이벤트 이력",
  "이벤트 API 기준, 신규",
  "ID, 구역, 상태 검색",
  "리포트 내보내기",
  "감지 이벤트",
  "조건에 맞는 역주행 이벤트가 없습니다.",
  "이벤트 정보",
  "증거 payload",
  "분석 기준",
  "번호판, 차주, CCTV, 차량 등록 정보는 현재 이벤트 API 계약 범위에 포함되어 있지 않습니다.",
  "원본 payload JSON",
].forEach((token) => assertIncludes(wrongwayLogPage, token, "Wrongway log operations copy"));

[
  "handleViewDashboardEvent",
  "/events?tab=all&eventId=",
  "encodeURIComponent(activeDashboardEvent.id)",
  "TrafficStatisticsPanel",
  "controlBoardModeLabel",
  "latestCommandSummary",
  "sendControlBoardTestCommand",
  "controlBoardLiveReady",
  "controlBoardReviewRequired",
  "LIVE_TCP_REVIEW",
  "DRY_RUN_SAFE",
  "wrongwayVehicles",
  "역주행 차량",
  "이벤트 {Number(kpi.wrongWayEvents || 0).toLocaleString()}건",
].forEach((token) => assertIncludes(dashboardPage, token, "Dashboard operations behavior"));

[
  'searchParams.get("eventId")',
  "fetchEvent(eventIdParam)",
  "upsertEvent(prev, normalized)",
  "ControlCommandTimeline",
  "selectedEvent.raw?.controlCommands",
  "RawPayloadBlock",
  "updateEventMemo",
  "updateEventStatus",
].forEach((token) => assertIncludes(eventLogPage, token, "Event log operations behavior"));

[
  "handleExportReport",
  "wrongway-events-",
  "rawPayload",
  "JSON.stringify",
  "updateEventStatus",
].forEach((token) => assertIncludes(wrongwayLogPage, token, "Wrongway log operations behavior"));

[
  "교통 운영 통계",
  "정주행/역주행 운영 통계",
  "정주행 차량",
  "역주행 차량",
  "역주행률",
  "구역별 위험도",
  "상위 구역",
  "집계된 구역 데이터가 없습니다.",
  "getRiskTone",
  "위험",
  "주의",
  "정상",
].forEach((token) => assertIncludes(trafficStatisticsPanel, token, "Traffic statistics panel copy"));

[
  "Today events",
  "Wrong-way events",
  "Pending events",
  "API summary",
  "Needs review",
  "Search id, type, status, location",
  "Add operator memo",
  "Select an event.",
].forEach((token) => assertExcludes(eventLogPage, token, "Event log generic/sample copy"));

[
  "Wrong-way event log",
  "Back to dashboard",
  "Export report",
  "Search id, location, status",
  "Loading wrong-way events",
  "No wrong-way events found",
  "Event information",
  "Evidence payload",
  "Select an event to view detail",
].forEach((token) => assertExcludes(wrongwayLogPage, token, "Wrongway log generic/sample copy"));

[
  "<span>12%</span>",
  "<span>2%</span>",
  "No packet yet",
  "Manual command",
  "Latest command",
  "Active situation",
  "1st Alert: Wrong-way Detection",
  "2nd Alert: Wrong-way Detection",
  "No recent events.",
  "Zone A - Tunnel Entrance",
  "command failed",
].forEach((token) => assertExcludes(dashboardPage, token, "Dashboard sample or placeholder copy"));

const MOJIBAKE_FORBIDDEN_TOKENS = [
  // Common fragments produced when Korean UTF-8 text is decoded with the wrong code page.
  "占",
  "沃",
  "筌",
  "獄",
  "癰",
  "揶",
  "?대깽",
  "?λ퉬",
  "援먰넻",
  "吏묎퀎",
  "??＜",
];

MOJIBAKE_FORBIDDEN_TOKENS.forEach((token) => {
  assertExcludes(devicesPage, token, "Devices page mojibake copy");
  assertExcludes(eventLogPage, token, "Event log mojibake copy");
  assertExcludes(wrongwayLogPage, token, "Wrongway log mojibake copy");
  assertExcludes(trafficStatisticsPanel, token, "Traffic statistics mojibake copy");
});

console.log("frontend UI contracts ok");
