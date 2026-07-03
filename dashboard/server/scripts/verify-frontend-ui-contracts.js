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

["border-dashed", "border-2", "font-mono text-gray-500", "占"].forEach((token) => {
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
  "formatDurationMs",
  "등록된 장비가 없습니다.",
  "현장 장비 목록",
  "Prisma seed 또는 현장 장비 등록",
].forEach((token) => assertIncludes(devicesPage, token, "Devices page operations copy"));

["占", "沃", "筌", "獄", "癰", "揶", "?λ퉬", "誘몄닔", "援ъ꽦"].forEach((token) => {
  assertExcludes(devicesPage, token, "Devices page mojibake copy");
});

[
  "handleViewDashboardEvent",
  "/events?tab=all&eventId=",
  "encodeURIComponent(activeDashboardEvent.id)",
  "TrafficStatisticsPanel",
  "controlBoardModeLabel",
  "latestCommandSummary",
  "sendControlBoardTestCommand",
].forEach((token) => assertIncludes(dashboardPage, token, "Dashboard operations behavior"));

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
  "Today events",
  "Wrong-way events",
  "Pending events",
  "API summary",
  "Needs review",
  "From event API",
  "Events from the backend event API",
  "Search id, type, status, location",
  "Add operator memo",
  "No control board command is linked to this event.",
  "Select an event.",
].forEach((token) => assertExcludes(eventLogPage, token, "Event log generic/sample copy"));

[
  "handleExportReport",
  "wrongway-events-",
  "rawPayload",
  "JSON.stringify",
].forEach((token) => assertIncludes(wrongwayLogPage, token, "Wrongway log operations behavior"));

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
  "교통 운영 통계",
  "정주행/역주행 운영 통계",
  "정주행 차량",
  "역주행 차량",
  "역주행률",
  "구역별 위험도",
  "집계된 구역 데이터가 없습니다.",
].forEach((token) => assertIncludes(trafficStatisticsPanel, token, "Traffic statistics panel copy"));

console.log("frontend UI contracts ok");
