const swaggerSpec = require("../src/swagger");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPath(method, path) {
  assert(swaggerSpec.paths?.[path]?.[method], `${method.toUpperCase()} ${path} is missing from Swagger`);
  return swaggerSpec.paths[path][method];
}

function assertSchema(name) {
  assert(swaggerSpec.components?.schemas?.[name], `Schema ${name} is missing from Swagger`);
}

function assertOperatorAuth(operation, label) {
  const security = operation.security || [];
  assert(
    security.some((item) => Array.isArray(item.cookieAuth) && Array.isArray(item.csrfHeaderAuth)),
    `${label} must declare cookieAuth plus csrfHeaderAuth security`,
  );
  assert(
    security.some((item) => Array.isArray(item.bearerAuth)),
    `${label} must keep bearerAuth compatibility security`,
  );
}

function assertOptionalDeviceKey(operation, label) {
  const security = operation.security || [];
  assert(
    security.some((item) => Array.isArray(item.deviceKeyAuth)) &&
      security.some((item) => Object.keys(item).length === 0),
    `${label} must document optional deviceKeyAuth security`,
  );
}

[
  ["/api/status", "get", "SystemStatusResponse"],
  ["/api/sites", "get", "SiteListResponse"],
  ["/api/zones", "get", "ZoneListResponse"],
  ["/api/devices", "get", "DeviceListResponse"],
  ["/api/devices/status", "get", "DeviceStatusSummaryResponse"],
  ["/api/statistics/traffic", "get", "TrafficStatisticsResponse"],
].forEach(([path, method, schema]) => {
  assertPath(method, path);
  assertSchema(schema);
});

[
  ["/api/gate/open", "post"],
  ["/api/gate/close", "post"],
  ["/api/vms", "post"],
  ["/api/control-board/commands/test", "post"],
  ["/api/events/{id}/status", "patch"],
  ["/api/events/{id}/memo", "patch"],
  ["/api/demo/start", "post"],
  ["/api/demo/reset", "post"],
].forEach(([path, method]) => {
  assertOperatorAuth(assertPath(method, path), `${method.toUpperCase()} ${path}`);
});

[
  ["/api/wrongway", "post"],
  ["/api/ingest/lidar", "post"],
  ["/api/ingest/lidar/mock", "post"],
  ["/api/ingest/control-board", "post"],
  ["/api/ingest/control-board/mock", "post"],
  ["/api/ingest/control-board/tcp/test", "post"],
  ["/api/ingest/control-board/serial/test", "post"],
].forEach(([path, method]) => {
  assertOptionalDeviceKey(assertPath(method, path), `${method.toUpperCase()} ${path}`);
});

assert(
  swaggerSpec.components?.securitySchemes?.cookieAuth?.in === "cookie",
  "Swagger must define cookieAuth cookie security scheme",
);
assert(
  swaggerSpec.components?.securitySchemes?.csrfHeaderAuth?.name === "X-CSRF-Token",
  "Swagger must define X-CSRF-Token apiKey security scheme",
);
assert(
  swaggerSpec.components?.securitySchemes?.deviceKeyAuth?.name === "X-Device-Key",
  "Swagger must define X-Device-Key apiKey security scheme",
);

const authLogin = swaggerSpec.components?.schemas?.AuthLoginResponse;
assert(authLogin?.properties?.authMode?.example === "httpOnlyCookie", "AuthLoginResponse must expose httpOnlyCookie mode");
assert(!authLogin?.properties?.token, "AuthLoginResponse must not expose the JWT token body field");

const controlBoardMockPacket =
  swaggerSpec.components?.schemas?.ControlBoardMockRequest?.properties?.packet?.oneOf?.[0]?.example;
assert(
  controlBoardMockPacket === "02 A1 20 01 01 02 00 CD 03 0D",
  "ControlBoardMockRequest packet example must use the 10-byte control board response frame",
);

const controlBoardSerialPacket =
  swaggerSpec.components?.schemas?.ControlBoardSerialTestRequest?.properties?.samplePacket?.example;
assert(
  controlBoardSerialPacket === "02 A1 20 01 01 02 00 CD 03 0D",
  "ControlBoardSerialTestRequest samplePacket example must use the 10-byte control board response frame",
);

const controlBoardTcpPacket =
  swaggerSpec.components?.schemas?.ControlBoardTcpFrameTestRequest?.properties?.samplePacket?.example;
assert(
  controlBoardTcpPacket === "02 A1 20 01 01 02 00 CD 03 0D",
  "ControlBoardTcpFrameTestRequest samplePacket example must use the 10-byte control board response frame",
);
assert(
  swaggerSpec.components?.schemas?.ControlBoardTcpFrameTestResponse?.properties?.tcp?.properties?.transport?.example ===
    "tcp",
  "ControlBoardTcpFrameTestResponse must document TCP transport",
);

const trafficEvent = swaggerSpec.components?.schemas?.TrafficEvent;
assert(
  trafficEvent?.properties?.controlCommands?.items?.$ref === "#/components/schemas/ControlBoardCommand",
  "TrafficEvent schema must expose linked controlCommands",
);
assert(
  trafficEvent?.properties?.eventLogs?.items?.$ref === "#/components/schemas/EventLog",
  "TrafficEvent schema must expose linked eventLogs",
);

const eventSummary = swaggerSpec.components?.schemas?.EventSummaryResponse;
["vehiclesPassed", "vehicleTracks", "todayVehicleTracks", "newEvents"].forEach((field) => {
  assert(eventSummary?.properties?.[field]?.type === "integer", `EventSummaryResponse must expose ${field}`);
});

const trafficStatistics = swaggerSpec.components?.schemas?.TrafficStatisticsResponse;
["totals", "buckets", "zones"].forEach((field) => {
  assert(trafficStatistics?.properties?.[field], `TrafficStatisticsResponse must expose ${field}`);
});
const trafficStatisticsMetrics = swaggerSpec.components?.schemas?.TrafficStatisticsMetrics;
[
  "vehiclesTotal",
  "normalVehicles",
  "wrongwayVehicles",
  "wrongwayEvents",
  "wrongwayRate",
  "controlCommands",
  "dryRunCommands",
  "liveCommands",
  "commandSuccessRate",
].forEach((field) => {
  assert(trafficStatisticsMetrics?.properties?.[field], `TrafficStatisticsMetrics must expose ${field}`);
});

console.log("swagger contracts ok");
