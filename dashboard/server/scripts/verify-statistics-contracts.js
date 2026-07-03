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
const fieldRequirements = readProjectFile("docs/ai/field-system-requirements.md");
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
  "sentAt: true",
  "acknowledgedAt: true",
  "responseDurationTotalMs",
  "responseDurationSamples",
  "averageResponseMs",
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
assertIncludes(api, "METRIC_DEFAULTS", "statistics api metric defaults");
assertIncludes(api, "averageResponseMs", "statistics api response latency default");
assertIncludes(api, "normalizeTrafficStatistics", "statistics api response normalizer");
assertIncludes(api, "normalizeMetric(source.totals)", "statistics api totals normalizer");
assertIncludes(api, "const source = response || {}", "statistics api empty response fallback");
assertIncludes(api, "const sourceMetric = metric || {}", "statistics api empty metric fallback");
assertIncludes(api, "Array.isArray(source.buckets)", "statistics api bucket fallback");
assertIncludes(api, "Array.isArray(source.zones)", "statistics api zone fallback");
assertIncludes(fieldRequirements, "GET /api/statistics/traffic?range=daily|weekly|monthly|yearly", "field requirements statistics endpoint");
assertIncludes(fieldRequirements, "totals", "field requirements statistics response");
assertIncludes(fieldRequirements, "buckets", "field requirements statistics response");
assertIncludes(fieldRequirements, "zones", "field requirements statistics response");
[
  "/api/statistics/wrongway-rate",
  "/api/statistics/control-commands",
  "/api/statistics/zones",
].forEach((endpoint) => {
  assert(!fieldRequirements.includes(endpoint), `field requirements must not document obsolete split endpoint ${endpoint}`);
});

[
  "TrafficStatisticsPanel",
  "RANGE_OPTIONS",
  "fetchTrafficStatistics({ range })",
  "setRange(option.value)",
  "교통 운영 통계",
  "정주행/역주행 운영 통계",
  "정주행 차량",
  "역주행 차량",
  "역주행률",
  "구역별 위험도",
  "상위 구역",
  "normalVehicles",
  "wrongwayVehicles",
  "wrongwayRate",
  "commandSuccessRate",
  "averageResponseMs",
  "formatDurationMs",
  "ResponsiveContainer",
  "ComposedChart",
  "TCP ACK",
].forEach((token) => assertIncludes(panel, token, "traffic statistics panel"));

["Traffic operations", "Top zones"].forEach((token) => {
  assert(!panel.includes(token), `traffic statistics panel must not expose English placeholder copy: ${token}`);
});

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
  "averageResponseMs",
].forEach((field) => assert(metrics[field], `TrafficStatisticsMetrics must expose ${field}`));

assertIncludes(evidenceMatrix, "DB unique track counts", "delivery evidence matrix statistics source");
assertIncludes(evidenceMatrix, "wrong-way rate", "delivery evidence matrix statistics metric");
assertIncludes(evidenceMatrix, "command metrics", "delivery evidence matrix statistics metric");
assertIncludes(fieldRequirements, '"averageResponseMs"', "field requirements statistics response latency");

console.log("statistics contracts ok");
