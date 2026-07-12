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

function assertOperatorReadAuth(operation, label) {
  const security = operation.security || [];
  assert(
    security.some((item) => Array.isArray(item.cookieAuth)),
    `${label} must declare cookieAuth security`,
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

const MOJIBAKE_FORBIDDEN_TOKENS = [
  // Common fragments produced when Korean UTF-8 text is decoded with the wrong code page.
  "占",
  "沃",
  "筌",
  "獄",
  "癰",
  "揶",
  "援먰넻",
  "吏묎퀎",
  "??＜",
  "?쇱",
  "?",
];

const swaggerText = JSON.stringify(swaggerSpec);
MOJIBAKE_FORBIDDEN_TOKENS.forEach((token) => {
  assert(!swaggerText.includes(token), `Swagger must not expose mojibake token: ${token}`);
});
[
  "?쇱",
  "?놁",
  "諛",
  "媛",
  "理",
  "command留",
].forEach((token) => {
  assert(!swaggerText.includes(token), `Swagger must not expose mojibake fragment: ${token}`);
});
[
  "LiDAR wrong-way event received",
  "Diagnostic CRC status used only when testing by command without a packet",
  "Database connection or base table query failed.",
].forEach((token) => {
  assert(swaggerText.includes(token), `Swagger must expose clean diagnostic copy: ${token}`);
});

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
  "deliveryReadiness",
  "reviewLinks",
  "jwtSecretConfigured",
  "authCookieSecure",
  "deviceIngestKeyConfigured",
  "swaggerAllowlistRestricted",
  "controlBoardLiveTcpReady",
  "level2EscalationPostureReady",
  "openChecks",
].forEach((field) => {
  assert(swaggerText.includes(field), `SystemStatusResponse must document ${field}`);
});

[
  ["/api/database/health", "get"],
  ["/api/status", "get"],
  ["/api/state", "get"],
  ["/api/logs", "get"],
  ["/api/sites", "get"],
  ["/api/zones", "get"],
  ["/api/devices", "get"],
  ["/api/devices/status", "get"],
  ["/api/control/status", "get"],
  ["/api/control-board/status", "get"],
  ["/api/control-board/commands", "get"],
  ["/api/wrongway/history", "get"],
  ["/api/events", "get"],
  ["/api/events/recent", "get"],
  ["/api/events/summary", "get"],
  ["/api/events/{id}", "get"],
  ["/api/events/{id}/logs", "get"],
  ["/api/statistics/traffic", "get"],
  ["/api/ingest/status", "get"],
  ["/api/ingest/events/recent", "get"],
].forEach(([path, method]) => {
  assertOperatorReadAuth(assertPath(method, path), `${method.toUpperCase()} ${path}`);
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
const authLoginRequest = swaggerSpec.components?.schemas?.AuthLoginRequest;
assert(authLoginRequest?.properties?.password?.example === "<operator-password>", "AuthLoginRequest password example must be a non-secret placeholder");
assert(authLoginRequest?.properties?.password?.example !== "admin1234!", "AuthLoginRequest password example must not expose seed/default-looking credentials");

const wrongwayIngest = assertPath("post", "/api/wrongway");
assert(
  wrongwayIngest.description.includes("wrong-way-level-1") &&
    wrongwayIngest.description.includes("wrong-way-level-2") &&
    wrongwayIngest.description.includes("현장 측량 기준") &&
    wrongwayIngest.description.includes("자동으로") &&
    wrongwayIngest.description.includes("승격하지 않습니다"),
  "POST /api/wrongway description must state that dashboard-side level-2 auto escalation is not active before field measurement criteria are approved",
);
assert(
  wrongwayIngest.description.includes("situation-ended") &&
    wrongwayIngest.description.includes("RESOLVED") &&
    wrongwayIngest.description.includes("STAGE_2_RETURN"),
  "POST /api/wrongway description must document situation-ended RESOLVED lifecycle and STAGE_2_RETURN command behavior",
);
const wrongwayRequestType = swaggerSpec.components?.schemas?.WrongwayRequest?.properties?.type;
assert(
  wrongwayRequestType?.description?.includes("자동 승격하지 않으며") &&
    wrongwayRequestType?.description?.includes("현장 측량 기준"),
  "WrongwayRequest.type must document explicit payload type handling and pending field-measurement escalation criteria",
);
const wrongwayIngestResponse = swaggerSpec.components?.schemas?.WrongwayIngestResponse;
assert(
  wrongwayIngestResponse?.properties?.resolvedEventIds?.description?.includes("RESOLVED") &&
    wrongwayIngestResponse.properties.resolvedEventIds.description.includes("closing event"),
  "WrongwayIngestResponse.resolvedEventIds must document resolved active events and closing event linkage",
);
assert(
  wrongwayIngestResponse?.properties?.controlCommand?.description?.includes("STAGE_1_ON") &&
    wrongwayIngestResponse.properties.controlCommand.description.includes("STAGE_2_ON") &&
    wrongwayIngestResponse.properties.controlCommand.description.includes("STAGE_2_RETURN"),
  "WrongwayIngestResponse.controlCommand must document stage-1, stage-2, and situation-ended command mapping",
);

const controlBoardMockPacket =
  swaggerSpec.components?.schemas?.ControlBoardMockRequest?.properties?.packet?.oneOf?.[0]?.example;
assert(
  controlBoardMockPacket === "02 A1 20 01 01 02 00 CD 03 0D",
  "ControlBoardMockRequest packet example must use the 10-byte control board response frame",
);

const controlBoardHttpIngest = assertPath("post", "/api/ingest/control-board");
assert(
  controlBoardHttpIngest.summary === "통합 제어보드 HTTP 브릿지 패킷 수신",
  "Control board HTTP ingest summary must describe bridge diagnostics, not the primary TCP command path",
);
assert(
  controlBoardHttpIngest.description.includes("Ethernet/TCP raw 10바이트 프레임") &&
    controlBoardHttpIngest.description.includes("TCP socket") &&
    !controlBoardHttpIngest.description.includes("RS-485"),
  "Control board HTTP ingest description must align with Ethernet/TCP raw frame policy",
);

const controlBoardMockIngest = assertPath("post", "/api/ingest/control-board/mock");
assert(
  controlBoardMockIngest.description.includes("Ethernet/TCP payload") &&
    controlBoardMockIngest.description.includes("CRC-8/SMBUS") &&
    !controlBoardMockIngest.description.includes("RS-485"),
  "Control board mock ingest description must align with Ethernet/TCP packet diagnostics",
);

const controlBoardSerialAlias = assertPath("post", "/api/ingest/control-board/serial/test");
assert(
  controlBoardSerialAlias.summary === "통합 제어보드 legacy serial alias 테스트" &&
    controlBoardSerialAlias.description.includes("하위 호환 alias") &&
    controlBoardSerialAlias.description.includes("/api/ingest/control-board/tcp/test"),
  "Control board serial test must be documented as a legacy alias with TCP test guidance",
);

const ingestStatus = assertPath("get", "/api/ingest/status");
const ingestRecent = assertPath("get", "/api/ingest/events/recent");
assertOperatorReadAuth(ingestStatus, "GET /api/ingest/status");
assertOperatorReadAuth(ingestRecent, "GET /api/ingest/events/recent");
assert(
  ingestRecent.description.includes("Operator diagnostic endpoint") &&
    ingestRecent.description.includes("requires operator authentication"),
  "Recent ingest events endpoint must be documented as an authenticated operator diagnostic endpoint",
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

assert(
  assertPath("get", "/api/control-board/status").summary === "통합 제어보드 TCP 상태 조회",
  "GET /api/control-board/status summary must be operator-readable Korean copy",
);
assert(
  assertPath("get", "/api/control-board/commands").summary === "통합 제어보드 명령 이력 조회",
  "GET /api/control-board/commands summary must be operator-readable Korean copy",
);
assert(
  assertPath("post", "/api/control-board/commands/test").description.includes("DRY_RUN") &&
    assertPath("post", "/api/control-board/commands/test").description.includes("LIVE_TCP"),
  "POST /api/control-board/commands/test description must explain DRY_RUN/LIVE_TCP field safety",
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
  "responseDurationMs",
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

const controlBoardStatus = swaggerSpec.components?.schemas?.ControlBoardStatusResponse;
["averageResponseMs", "responseSampleCount", "latestCommand", "liveTcpReady", "liveApproved", "safetyStatus"].forEach((field) => {
  assert(controlBoardStatus?.properties?.[field], `ControlBoardStatusResponse must expose ${field}`);
});
assert(
  controlBoardStatus?.properties?.liveTcpReady?.description?.includes("CONTROL_BOARD_LIVE_APPROVED=true"),
  "ControlBoardStatusResponse liveTcpReady must document live approval requirement",
);
assert(
  controlBoardStatus?.properties?.safetyStatus?.enum?.includes("LIVE_TCP_REVIEW"),
  "ControlBoardStatusResponse safetyStatus must document LIVE_TCP_REVIEW",
);

const eventSummary = swaggerSpec.components?.schemas?.EventSummaryResponse;
["vehiclesPassed", "vehicleTracks", "todayVehicleTracks", "wrongwayVehicles", "wrongWayEvents", "newEvents"].forEach((field) => {
  assert(eventSummary?.properties?.[field]?.type === "integer", `EventSummaryResponse must expose ${field}`);
});
assert(
  eventSummary?.properties?.wrongwayRate?.type === "number",
  "EventSummaryResponse must expose wrongwayRate",
);

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
  "averageResponseMs",
].forEach((field) => {
  assert(trafficStatisticsMetrics?.properties?.[field], `TrafficStatisticsMetrics must expose ${field}`);
});

console.log("swagger contracts ok");
