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

assert(!dashboardPage.includes("추후 구현"), "Dashboard page must not expose unfinished action comments");

console.log("frontend UI contracts ok");
