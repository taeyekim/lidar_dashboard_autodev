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

function responseJsonSchema(operation, label, status = 200) {
  const schema = operation.responses?.[status]?.content?.["application/json"]?.schema;
  assert(schema, `${label} must declare a ${status} application/json response schema`);
  return schema;
}

function schemaContainsRef(schema, ref) {
  if (!schema || typeof schema !== "object") return false;
  if (schema.$ref === ref) return true;
  return Object.values(schema).some((value) => {
    if (Array.isArray(value)) return value.some((item) => schemaContainsRef(item, ref));
    return schemaContainsRef(value, ref);
  });
}

function assertResponseSchema(operation, schemaName, label) {
  const schema = responseJsonSchema(operation, label);
  const ref = `#/components/schemas/${schemaName}`;
  assert(schemaContainsRef(schema, ref), `${label} must use ${schemaName} as its 200 response schema`);
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
  ["/api/health", "get", "HealthResponse"],
  ["/api/database/health", "get", "DatabaseHealthResponse"],
  ["/api/auth/me", "get", "AuthMeResponse"],
  ["/api/auth/logout", "post", "OkResponse"],
  ["/api/status", "get", "SystemStatusResponse"],
  ["/api/sites", "get", "SiteListResponse"],
  ["/api/zones", "get", "ZoneListResponse"],
  ["/api/devices", "get", "DeviceListResponse"],
  ["/api/devices/status", "get", "DeviceStatusSummaryResponse"],
  ["/api/control-board/status", "get", "ControlBoardStatusResponse"],
  ["/api/control-board/commands", "get", "ControlBoardCommandListResponse"],
  ["/api/events", "get", "EventListResponse"],
  ["/api/events/recent", "get", "EventListResponse"],
  ["/api/events/summary", "get", "EventSummaryResponse"],
  ["/api/events/{id}", "get", "TrafficEvent"],
  ["/api/events/{id}/logs", "get", "EventLog"],
  ["/api/statistics/traffic", "get", "TrafficStatisticsResponse"],
  ["/api/ingest/status", "get", "IngestStatusResponse"],
  ["/api/wrongway/history", "get", "WrongwayHistoryItem"],
].forEach(([path, method, schema]) => {
  const operation = assertPath(method, path);
  assertSchema(schema);
  assertResponseSchema(operation, schema, `${method.toUpperCase()} ${path}`);
});

const databaseHealth = assertPath("get", "/api/database/health");
assert(
  responseJsonSchema(databaseHealth, "GET /api/database/health", 503),
  "GET /api/database/health must document the 503 database failure response",
);
["users", "sites", "zones", "devices", "trafficEvents", "vehicleTracks", "controlCommands"].forEach((field) => {
  assert(
    swaggerSpec.components?.schemas?.DatabaseHealthResponse?.properties?.tables?.properties?.[field]?.type === "integer",
    `DatabaseHealthResponse tables must expose ${field}`,
  );
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

const controlBoardCommand = swaggerSpec.components?.schemas?.ControlBoardCommand;
[
  "packetHex",
  "responseHex",
  "crcStatus",
  "requestedAt",
  "completedAt",
].forEach((field) => {
  assert(controlBoardCommand?.properties?.[field], `ControlBoardCommand schema must expose ${field}`);
});
assert(
  controlBoardCommand?.properties?.logs?.items?.$ref === "#/components/schemas/ControlCommandLog",
  "ControlBoardCommand schema must expose linked ControlCommandLog entries",
);

const controlCommandLog = swaggerSpec.components?.schemas?.ControlCommandLog;
["controlCommandId", "action", "message", "metadata", "createdAt"].forEach((field) => {
  assert(controlCommandLog?.properties?.[field], `ControlCommandLog schema must expose ${field}`);
});

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
