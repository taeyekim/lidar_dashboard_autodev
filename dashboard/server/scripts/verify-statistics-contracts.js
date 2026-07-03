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
const evidenceMatrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const expectedRanges = ["daily", "weekly", "monthly", "yearly"];

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

expectedRanges.forEach((range) => {
  assertIncludes(service, `"${range}"`, "statistics service range options");
  assertIncludes(panel, `value: "${range}"`, "traffic statistics panel range options");
  assertIncludes(evidenceMatrix, range, "delivery evidence matrix statistics range coverage");
});

assertIncludes(routes, 'router.get("/statistics/traffic"', "statistics routes");
assertIncludes(routeIndex, "statisticsRoutes", "route index");
assertIncludes(api, "/api/statistics/traffic", "statistics api");
assertIncludes(api, "URLSearchParams", "statistics api query builder");

[
  "TrafficStatisticsPanel",
  "RANGE_OPTIONS",
  "fetchTrafficStatistics({ range })",
  "setRange(option.value)",
  "normalVehicles",
  "wrongwayVehicles",
  "wrongwayRate",
  "commandSuccessRate",
  "ResponsiveContainer",
  "ComposedChart",
  "Top zones",
  "TCP ACK",
].forEach((token) => assertIncludes(panel, token, "traffic statistics panel"));

const operation = swaggerSpec.paths?.["/api/statistics/traffic"]?.get;
assert(operation, "GET /api/statistics/traffic is missing from Swagger");
const rangeParameter = operation.parameters?.find((parameter) => parameter.name === "range");
assert(rangeParameter, "GET /api/statistics/traffic must document a range query parameter");
assert(
  JSON.stringify(rangeParameter.schema?.enum || []) === JSON.stringify(expectedRanges),
  "GET /api/statistics/traffic range enum must match daily, weekly, monthly, yearly",
);
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

assertIncludes(evidenceMatrix, "DB unique track counts", "delivery evidence matrix statistics source");
assertIncludes(evidenceMatrix, "wrong-way rate", "delivery evidence matrix statistics metric");
assertIncludes(evidenceMatrix, "command metrics", "delivery evidence matrix statistics metric");

console.log("statistics contracts ok");
