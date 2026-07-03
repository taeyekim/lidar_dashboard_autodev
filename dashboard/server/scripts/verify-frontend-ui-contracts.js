const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const card = readProjectFile("dashboard/dashboard-web/src/shared/components/Card.jsx");
const devicesPage = readProjectFile("dashboard/dashboard-web/src/pages/Devices/DevicesPage.jsx");
const dashboardPage = readProjectFile("dashboard/dashboard-web/src/pages/Dashboard/DashboardPage.jsx");
const eventLogPage = readProjectFile("dashboard/dashboard-web/src/pages/EventLog/EventLogPage.jsx");
const wrongwayLogPage = readProjectFile("dashboard/dashboard-web/src/pages/Dashboard/WrongwayLogPage.jsx");
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
].forEach((token) => {
  assert(card.includes(token), `Card component must include production UI token: ${token}`);
});

["border-dashed", "border-2", "font-mono text-gray-500", "�"].forEach((token) => {
  assert(!card.includes(token), `Card component must not include mock/debug UI token: ${token}`);
});

assert(!fs.existsSync(todaysEventsPath), "Unused mock TodaysEvents component must not remain in frontend source");

[
  "lazy(() => import(\"../pages/Dashboard/DashboardPage\"))",
  "lazy(() => import(\"../pages/EventLog/EventLogPage\"))",
  "lazy(() => import(\"../pages/Devices/DevicesPage\"))",
  "<Suspense fallback={<RouteFallback />}>",
].forEach((token) => {
  assert(appRouter.includes(token), `App router must keep route-level lazy loading token: ${token}`);
});

[
  "import DashboardPage from",
  "import EventLogPage from",
  "import DevicesPage from",
  "import SettingsPage from",
  "import WrongwayLogPage from",
].forEach((token) => {
  assert(!appRouter.includes(token), `App router must not statically import route page: ${token}`);
});

[
  "장비 상태",
  "라이다 PC, 통합제어보드",
  "등록 장비",
  "제어보드",
  "TCP 대상 설정됨",
  "등록된 장비가 없습니다.",
].forEach((token) => {
  assert(devicesPage.includes(token), `Devices page must include production operations copy: ${token}`);
});

["�", "占", "誘", "理", "諛", "蹂", "媛"].forEach((token) => {
  assert(!devicesPage.includes(token), `Devices page must not include mojibake token: ${token}`);
});

[
  "handleViewDashboardEvent",
  "/events?tab=all&eventId=",
  "encodeURIComponent(activeDashboardEvent.id)",
].forEach((token) => {
  assert(dashboardPage.includes(token), `Dashboard modal action must deep-link to event detail: ${token}`);
});

[
  "searchParams.get(\"eventId\")",
  "fetchEvent(eventIdParam)",
  "upsertEvent(prev, normalized)",
].forEach((token) => {
  assert(eventLogPage.includes(token), `Event log must support eventId deep-link selection: ${token}`);
});

[
  "이벤트 로그",
  "라이다 수신 이벤트, 관제 상태, 제어 명령 이력",
  "오늘 이벤트",
  "역주행 이벤트",
  "시간대별 이벤트 분포",
  "이벤트 상세",
  "운영 메모",
  "통합제어보드 명령",
  "원본 payload JSON",
].forEach((token) => {
  assert(eventLogPage.includes(token), `Event log page must include operations copy: ${token}`);
});

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
].forEach((token) => {
  assert(!eventLogPage.includes(token), `Event log page must not expose generic/sample copy: ${token}`);
});

[
  "역주행 이벤트 이력",
  "이벤트 API 기준, 신규",
  "리포트 내보내기",
  "handleExportReport",
  "wrongway-events-",
  "감지 이벤트",
  "조건에 맞는 역주행 이벤트가 없습니다.",
  "증거 payload",
  "원본 payload JSON",
].forEach((token) => {
  assert(wrongwayLogPage.includes(token), `Wrongway log page must include operations token: ${token}`);
});

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
].forEach((token) => {
  assert(!wrongwayLogPage.includes(token), `Wrongway log page must not expose generic copy: ${token}`);
});

assert(!dashboardPage.includes("추후 구현"), "Dashboard page must not expose unfinished action comments");

[
  "역주행 방지 실시간 관제 대시보드",
  "현재 상황",
  "수신 체인",
  "최근 라이다 수신",
  "통합제어보드",
  "수동 제어",
  "DB unique",
  "역주행률",
].forEach((token) => {
  assert(dashboardPage.includes(token), `Dashboard page must include operations copy: ${token}`);
});

[
  "<span>12%</span>",
  "<span>2%</span>",
  "No packet yet",
  "Manual command",
  "Latest command",
  "Active situation",
].forEach((token) => {
  assert(!dashboardPage.includes(token), `Dashboard page must not expose sample or unfinished copy: ${token}`);
});

console.log("frontend UI contracts ok");
