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

const service = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.service.js");
const controlBoardService = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.service.js");
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
  "rawPayload: data.rawPayload",
  "vehicleTrackCreated",
  'broadcastRealtime("vehicle-track.updated"',
].forEach((token) => assertIncludes(service, token, "wrongway service"));

assert(
  /if \(data\.type === PAYLOAD_TYPES\.NORMAL_DRIVING\) return null;/.test(service),
  "normal-driving must not create a traffic event",
);
assert(
  /data\.type === PAYLOAD_TYPES\.NORMAL_DRIVING && !vehicleTrackState\?\.created/.test(service),
  "repeated normal-driving tracks must not create duplicate event logs",
);
assertIncludes(
  service,
  "controlBoardService.createCommandForWrongwayEvent(data.type, result.event)",
  "wrongway service",
);
[
  "prisma.controlCommand.findFirst",
  "trafficEventId: trafficEvent.id",
  "commandType",
  "control board command reused for wrongway event",
].forEach((token) => assertIncludes(controlBoardService, token, "control board service"));
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
["vehicleTrackCreated", "controlCommand", "event"].forEach((field) => {
  assert(wrongwayResponse.properties?.[field], `WrongwayIngestResponse is missing ${field}`);
});

[
  "Normal-driving unique track smoke",
  "Normal-driving duplicate track smoke",
  "Wrong-way stage 1 smoke",
  "Wrong-way stage 2 smoke",
  "Situation-ended smoke",
].forEach((heading) => assertIncludes(runbook, heading, "delivery runbook"));

console.log("wrongway contracts ok");
