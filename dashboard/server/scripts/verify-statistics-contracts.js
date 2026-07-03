const fs = require("fs");
const path = require("path");
const swaggerSpec = require("../src/swagger");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const service = readProjectFile("dashboard/server/src/domains/statistics/statistics.service.js");
const routes = readProjectFile("dashboard/server/src/domains/statistics/statistics.routes.js");
const routeIndex = readProjectFile("dashboard/server/src/routes/index.js");
const panel = readProjectFile("dashboard/dashboard-web/src/components/dashboard/TrafficStatisticsPanel.jsx");
const api = readProjectFile("dashboard/dashboard-web/src/features/statistics/statisticsApi.js");

[
  "prisma.vehicleTrack.findMany",
  "prisma.trafficEvent.findMany",
  "prisma.controlCommand.findMany",
  "vehicleTrackIds",
  "wrongwayVehicleKeys",
  "wrongwayRate",
  "commandSuccessRate",
  "dryRunCommands",
  "liveCommands",
  "ACKNOWLEDGED",
].forEach((token) => assertIncludes(service, token, "statistics service"));

assertIncludes(routes, 'router.get("/statistics/traffic"', "statistics routes");
assertIncludes(routeIndex, "statisticsRoutes", "route index");
assertIncludes(api, "/api/statistics/traffic", "statistics api");
["일간", "주간", "월간", "연간", "정주행", "역주행", "TCP ACK"].forEach((token) => {
  assertIncludes(panel, token, "traffic statistics panel");
});

const operation = swaggerSpec.paths?.["/api/statistics/traffic"]?.get;
assert(operation, "GET /api/statistics/traffic is missing from Swagger");
assert(
  operation.responses?.["200"]?.content?.["application/json"]?.schema?.$ref ===
    "#/components/schemas/TrafficStatisticsResponse",
  "GET /api/statistics/traffic response schema is incorrect",
);

const metrics = swaggerSpec.components?.schemas?.TrafficStatisticsMetrics?.properties || {};
[
  "vehiclesTotal",
  "normalVehicles",
  "wrongwayVehicles",
  "wrongwayRate",
  "controlCommands",
  "commandSuccessRate",
].forEach((field) => assert(metrics[field], `TrafficStatisticsMetrics must expose ${field}`));

console.log("statistics contracts ok");
