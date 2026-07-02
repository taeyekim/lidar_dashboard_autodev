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

function assertBearer(operation, label) {
  const security = operation.security || [];
  assert(
    security.some((item) => Array.isArray(item.bearerAuth)),
    `${label} must declare bearerAuth security`,
  );
}

[
  ["/api/status", "get", "SystemStatusResponse"],
  ["/api/sites", "get", "SiteListResponse"],
  ["/api/zones", "get", "ZoneListResponse"],
  ["/api/devices", "get", "DeviceListResponse"],
  ["/api/devices/status", "get", "DeviceStatusSummaryResponse"],
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
  assertBearer(assertPath(method, path), `${method.toUpperCase()} ${path}`);
});

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

console.log("swagger contracts ok");
