const fs = require("fs");
const path = require("path");
const swaggerSpec = require("../src/swagger");
const { adaptLidarHttpPayload } = require("../src/domains/external-ingest/adapters/lidarHttp.adapter");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const service = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.service.js");
const controlBoardService = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.service.js");
const eventsService = readProjectFile("dashboard/server/src/domains/events/events.service.js");
const securityMiddleware = readProjectFile("dashboard/server/src/middleware/security.js");
const wrongwayRoutes = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.routes.js");
const externalIngestRoutes = readProjectFile("dashboard/server/src/domains/external-ingest/externalIngest.routes.js");
const externalIngestController = readProjectFile("dashboard/server/src/domains/external-ingest/externalIngest.controller.js");
const externalIngestService = readProjectFile("dashboard/server/src/domains/external-ingest/externalIngest.service.js");
const externalEventModel = readProjectFile("dashboard/server/src/domains/external-ingest/externalEvent.model.js");
const lidarHttpAdapter = readProjectFile("dashboard/server/src/domains/external-ingest/adapters/lidarHttp.adapter.js");
const wrongwayRuntimeDedupe = readProjectFile("dashboard/server/scripts/verify-wrongway-runtime-dedupe.js");
const schema = readProjectFile("dashboard/server/prisma/schema.prisma");
const payloadSpec = readProjectFile("docs/specs/lidar-dashboard-payload.md");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");

[
  "normal-driving",
  "wrong-way-level-1",
  "wrong-way-level-2",
  "situation-ended",
].forEach((type) => {
  assertIncludes(service, type, "wrongway service");
  assertIncludes(payloadSpec, type, "lidar payload spec");
});

[
  "tx.vehicleTrack.upsert",
  "where: { trackId: data.trackId }",
  "created: !existing",
  "CLOSED_EVENT_STATUSES",
  "isWrongwayAlertType",
  "TRAFFIC_EVENT_DEDUPED",
  "SITUATION_ENDED_RESOLVED",
  "resolveActiveWrongwayEventsForTrack",
  "eventReused",
  "resolvedEventIds",
  "resolvedEventCount",
  "vehicleTrackCreated: result.vehicleTrackCreated",
  "normal-driving unique track",
  "normal-driving update",
  "status: { notIn: CLOSED_EVENT_STATUSES }",
  "rawPayload: data.rawPayload",
  "level2EscalationConfig",
  "WRONGWAY_LEVEL2_ESCALATION_ENABLED",
  "WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT",
  "WRONGWAY_LEVEL2_MIN_CONFIDENCE",
  "dashboardEscalation",
  "vehicleTrackCreated",
  'broadcastRealtime(result.eventCreated ? "traffic-event.created" : "traffic-event.updated"',
  'broadcastRealtime("vehicle-track.updated"',
].forEach((token) => assertIncludes(service, token, "wrongway service"));

assert(
  /if \(data\.type === PAYLOAD_TYPES\.NORMAL_DRIVING\) \{\s+return \{ event: null, created: false, reused: false \};\s+\}/.test(service),
  "normal-driving must not create a traffic event",
);
assert(
  /data\.type === PAYLOAD_TYPES\.NORMAL_DRIVING && !vehicleTrackState\?\.created/.test(service),
  "repeated normal-driving tracks must not create duplicate event logs",
);
assert(
  /if \(options\.vehicleTrackCreated\) \{\s+mockLidarService\.increaseVehiclePassed\(\);/.test(service),
  "normal-driving realtime KPI must increment vehiclesPassed only for newly created unique tracks",
);
assertIncludes(
  service,
  "controlBoardService.createCommandForWrongwayEvent(data.type, result.event,",
  "wrongway service",
);
[
  "resolvedEventIds: result.resolvedEvents.map((event) => event.id)",
  "resolvedEventCount: result.resolvedEvents.length",
].forEach((token) => assertIncludes(service, token, "wrongway situation-ended command metadata"));
[
  "STAGE_2_RETURN",
  "SITUATION_ENDED_RESOLVED",
  "RESOLVED",
].forEach((token) => assertIncludes(payloadSpec, token, "lidar payload spec situation-ended lifecycle"));
[
  "prisma.controlCommand.findFirst",
  "trafficEventId: trafficEvent.id",
  "commandType",
  "...(options.metadata || {})",
  "metadata: options.metadata",
  "control board command reused for wrongway event",
].forEach((token) => assertIncludes(controlBoardService, token, "control board service"));
[
  "\"wrong-way-level-1\": \"STAGE_1_ON\"",
  "\"wrong-way-level-2\": \"STAGE_2_ON\"",
  "\"situation-ended\": \"STAGE_2_RETURN\"",
].forEach((token) => assertIncludes(controlBoardService, token, "control board wrong-way command map"));
[
  "level-1 wrong-way payloads must create or reuse only stage-1 control commands",
  "level-1 wrong-way payloads must not auto-escalate to stage-2 control commands",
  "stage-2 control command must be created only after an explicit level-2 payload",
  "configured dashboard-side level-2 escalation must be explicit in the response",
  "configured escalation must store a level-2 traffic event",
  "configured level-2 escalation must create a stage-2 control command",
  "configured escalation must preserve passed threshold checks in rawPayload evidence",
  "situation-ended must resolve both active stage-1 and stage-2 events for the track",
  "situation-ended must mark active wrong-way events RESOLVED",
  "situation-ended must create a return command for the control board",
  "situation-ended return command must link to the closing event",
  "camelCase objectId payload must reuse the stable vehicle track",
  "stableObjectId wrong-way payload must create a traffic event",
  "stableObjectId must normalize to event trackId",
  "vehicle track must preserve camelCase objectId raw payload evidence",
].forEach((token) => assertIncludes(wrongwayRuntimeDedupe, token, "wrongway runtime command escalation guard"));
[
  "controlCommands:",
  "eventLogs:",
  "logs: { orderBy: { createdAt: \"asc\" } }",
  "targetDevice: true",
  "event.controlCommands.map(serializeCommand)",
  "event.eventLogs.map(serializeLog)",
  "prisma.vehicleTrack.count()",
  "prisma.$queryRaw",
  "COUNT(DISTINCT COALESCE(track_id, vehicle_track_id, id))::int AS count",
  "countFromQueryRow(wrongwayVehicleRows)",
  "vehiclesPassed: vehicleTracks",
  "wrongwayVehicles",
  "wrongwayRate: percent(wrongwayVehicles, vehicleTracks)",
  "todayVehicleTracks",
].forEach((token) => assertIncludes(eventsService, token, "events service"));
[
  "DEVICE_INGEST_API_KEY",
  "x-device-key",
  "crypto.timingSafeEqual",
  "requireDeviceIngestKey",
].forEach((token) => assertIncludes(securityMiddleware, token, "security middleware"));
assertIncludes(wrongwayRoutes, "requireDeviceIngestKey", "wrongway routes");
assertIncludes(externalIngestRoutes, "requireDeviceIngestKey", "external ingest routes");
assertIncludes(externalIngestRoutes, "/ingest/control-board/tcp/test", "external ingest routes");
[
  "External devices can send different payload shapes.",
  "diagnostic payloads do not provide an ID",
  "Field verification can inspect rawPayload in DB",
].forEach((token) => assertIncludes(externalEventModel, token, "external event model comments"));
[
  "Convert LiDAR HTTP/JSON payloads into the common external event model.",
  "payload.objectId",
  "payload.uuid",
  "payload.stable_object_id",
  "payload.stableObjectId",
  "LiDAR wrong-way event received",
].forEach((token) => assertIncludes(lidarHttpAdapter, token, "lidar HTTP adapter"));
const stableIdEvent = adaptLidarHttpPayload({
  type: "wrong-way-level-1",
  zone_id: "Z-1",
  stableObjectId: "stable-track-1",
  timestamp: "2026-07-03T00:00:00.000Z",
});
assert(stableIdEvent.trackId === "stable-track-1", "lidar adapter must map stableObjectId to trackId");
assert(stableIdEvent.message === "LiDAR wrong-way event received", "lidar adapter must provide a readable fallback message");
const replacementChar = String.fromCharCode(0xfffd);
const knownMojibakeChars = [0xf9e4, 0xb97c, 0xbcf4, 0xae38].map((code) => String.fromCharCode(code));
[replacementChar, ...knownMojibakeChars].forEach((token) => {
  assert(!externalIngestRoutes.includes(token), `external ingest routes must not contain mojibake token: ${token}`);
  assert(!externalIngestController.includes(token), `external ingest controller must not contain mojibake token: ${token}`);
  assert(!externalEventModel.includes(token), `external event model must not contain mojibake token: ${token}`);
  assert(!lidarHttpAdapter.includes(token), `lidar HTTP adapter must not contain mojibake token: ${token}`);
});
const knownMojibakeFragments = [0x7344, 0x63f6, 0x7b4c].map((code) => String.fromCharCode(code));
knownMojibakeFragments.forEach((token) => {
  assert(!externalIngestRoutes.includes(token), `external ingest routes must not contain mojibake fragment: ${token}`);
  assert(!externalIngestController.includes(token), `external ingest controller must not contain mojibake fragment: ${token}`);
});
assert(!externalIngestService.includes("temporary"), "external ingest service comments must not read like unfinished temporary code");
assert(!externalEventModel.includes("temporary"), "external event model comments must not read like unfinished temporary code");
assertIncludes(schema, "model VehicleTrack", "prisma schema");
assertIncludes(schema, "trackId                      String         @unique", "prisma schema");
assertIncludes(schema, "rawPayload               Json", "prisma schema");
assertIncludes(schema, "rawPayload                   Json?", "prisma schema");

const wrongwayPost = swaggerSpec.paths?.["/api/wrongway"]?.post;
assert(wrongwayPost, "POST /api/wrongway is missing from Swagger");
const requestSchema =
  wrongwayPost.requestBody?.content?.["application/json"]?.schema?.$ref;
assert(requestSchema === "#/components/schemas/WrongwayRequest", "wrongway request schema ref is incorrect");
const responseSchema =
  wrongwayPost.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
assert(responseSchema === "#/components/schemas/WrongwayIngestResponse", "wrongway response schema ref is incorrect");

const wrongwayRequest = swaggerSpec.components?.schemas?.WrongwayRequest;
assert(wrongwayRequest, "WrongwayRequest schema is missing");
["normal-driving", "wrong-way-level-1", "wrong-way-level-2", "situation-ended"].forEach((type) => {
  assert(wrongwayRequest.properties?.type?.enum?.includes(type), `WrongwayRequest enum is missing ${type}`);
});

const wrongwayResponse = swaggerSpec.components?.schemas?.WrongwayIngestResponse;
assert(wrongwayResponse, "WrongwayIngestResponse schema is missing");
["vehicleTrackCreated", "eventCreated", "eventReused", "resolvedEventIds", "controlCommand", "event"].forEach((field) => {
  assert(wrongwayResponse.properties?.[field], `WrongwayIngestResponse is missing ${field}`);
});

[
  "Normal-driving unique track smoke",
  "Normal-driving duplicate track smoke",
  "Wrong-way stage 1 smoke",
  "Wrong-way stage 2 smoke",
  "Situation-ended smoke",
].forEach((heading) => assertIncludes(runbook, heading, "delivery runbook"));

[
  "wrong-way-level-1",
  "wrong-way-level-2",
  "objectId",
  "stableObjectId",
  "primary DB de-duplication key",
  "does not automatically escalate",
  "WRONGWAY_LEVEL2_ESCALATION_ENABLED",
  "dashboardEscalation",
  "field rehearsal evidence",
].forEach((token) => assertIncludes(payloadSpec, token, "lidar payload spec level-2 escalation boundary"));

assert(
  swaggerSpec.paths?.["/api/wrongway"]?.post?.["x-level2EscalationPolicy"]?.includes("WRONGWAY_LEVEL2_ESCALATION_ENABLED=true"),
  "POST /api/wrongway must document disabled-by-default dashboard-side level-2 escalation policy",
);
assert(
  wrongwayRequest.properties?.type?.["x-level2EscalationPolicy"]?.includes("default dashboard behavior does not auto-escalate"),
  "WrongwayRequest.type must document default no-auto-escalation policy",
);

console.log("wrongway contracts ok");
