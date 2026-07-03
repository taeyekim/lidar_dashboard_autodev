const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const schema = readProjectFile("dashboard/server/prisma/schema.prisma");
const initMigration = readProjectFile("dashboard/server/prisma/migrations/20260629081700_init/migration.sql");
const vehicleTrackMigration = readProjectFile(
  "dashboard/server/prisma/migrations/20260630083500_add_vehicle_tracks_payload_fields/migration.sql",
);
const controlLifecycleMigration = readProjectFile(
  "dashboard/server/prisma/migrations/20260702063000_add_control_command_lifecycle/migration.sql",
);
const trafficEventSummaryIndexMigration = readProjectFile(
  "dashboard/server/prisma/migrations/20260703071000_add_traffic_event_summary_indexes/migration.sql",
);
const seed = readProjectFile("dashboard/server/prisma/seed.js");
const syntaxChecker = readProjectFile("dashboard/server/scripts/check-syntax.js");
const wrongwayService = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.service.js");
const controlBoardService = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.service.js");
const statisticsService = readProjectFile("dashboard/server/src/domains/statistics/statistics.service.js");
const eventService = readProjectFile("dashboard/server/src/domains/events/events.service.js");

[
  "model User",
  "model Site",
  "model Zone",
  "model Device",
  "model VehicleTrack",
  "model TrafficEvent",
  "model EventLog",
  "model ControlCommand",
  "model ControlCommandLog",
  "model DeviceStatusLog",
].forEach((model) => assertIncludes(schema, model, "Prisma schema"));

[
  'trackId                      String         @unique @map("track_id")',
  'lastSeenAt                   DateTime       @default(now()) @map("last_seen_at")',
  'lastNormalMovingVehicleCount Int?           @map("last_normal_moving_vehicle_count")',
  'rawPayload                   Json?          @map("raw_payload")',
  "@@index([lastEventType])",
  "@@index([lastSeenAt])",
].forEach((token) => assertIncludes(schema, token, "VehicleTrack schema contract"));

[
  'eventType                String        @map("event_type")',
  'vehicleTrackId           String?       @map("vehicle_track_id")',
  'warningLevel             Int?          @map("warning_level")',
  'normalMovingVehicleCount Int?          @map("normal_moving_vehicle_count")',
  'rawPayload               Json          @map("raw_payload")',
  "vehicleTrack             VehicleTrack?",
  "controlCommands          ControlCommand[]",
  "@@index([eventType])",
  "@@index([eventType, receivedAt])",
  "@@index([eventType, trackId])",
  "@@index([eventType, vehicleTrackId])",
  "@@index([status])",
  "@@index([receivedAt])",
].forEach((token) => assertIncludes(schema, token, "TrafficEvent schema contract"));

[
  'commandCode        String              @unique @map("command_code")',
  'commandType        String              @map("command_type")',
  'status             String              @default("PENDING")',
  'transport          String              @default("TCP")',
  'packetHex          String              @map("packet_hex")',
  'responseHex        String?             @map("response_hex")',
  'crcStatus          String?             @map("crc_status")',
  'requestedByUserId  String?             @map("requested_by_user_id")',
  "trafficEvent       TrafficEvent?",
  "targetDevice       Device?",
  "requestedBy        User?",
  "logs               ControlCommandLog[]",
  "@@index([commandType])",
  "@@index([trafficEventId])",
  "@@index([requestedAt])",
].forEach((token) => assertIncludes(schema, token, "ControlCommand schema contract"));

[
  'controlCommandId String         @map("control_command_id")',
  "controlCommand   ControlCommand",
  "@@index([controlCommandId])",
  "@@index([action])",
].forEach((token) => assertIncludes(schema, token, "ControlCommandLog schema contract"));

[
  'deviceId  String?  @map("device_id")',
  'source    String   @default("CONTROL_BOARD")',
  "device    Device?",
  "@@index([source])",
  "@@index([status])",
].forEach((token) => assertIncludes(schema, token, "DeviceStatusLog schema contract"));

[
  'CREATE TABLE "traffic_events"',
  '"raw_payload" JSONB NOT NULL',
  'CREATE INDEX "traffic_events_event_type_idx"',
  'CREATE INDEX "traffic_events_status_idx"',
  'CREATE TABLE "event_logs"',
].forEach((token) => assertIncludes(initMigration, token, "initial migration"));

[
  'CREATE TABLE "vehicle_tracks"',
  '"track_id" TEXT NOT NULL',
  '"last_normal_moving_vehicle_count" INTEGER',
  '"raw_payload" JSONB',
  'CREATE UNIQUE INDEX "vehicle_tracks_track_id_key"',
  'ALTER TABLE "traffic_events" ADD COLUMN "vehicle_track_id" TEXT',
  'ALTER TABLE "traffic_events" ADD COLUMN "warning_level" INTEGER',
  'ALTER TABLE "traffic_events" ADD COLUMN "normal_moving_vehicle_count" INTEGER',
  'CONSTRAINT "traffic_events_vehicle_track_id_fkey"',
].forEach((token) => assertIncludes(vehicleTrackMigration, token, "vehicle track migration"));

[
  'CREATE TABLE "control_commands"',
  '"packet_hex" TEXT NOT NULL',
  '"requested_by_user_id" TEXT',
  'CREATE TABLE "control_command_logs"',
  'CREATE TABLE "device_status_logs"',
  'CREATE UNIQUE INDEX "control_commands_command_code_key"',
  'CREATE INDEX "control_commands_command_type_idx"',
  'CREATE INDEX "control_commands_requested_at_idx"',
  'CONSTRAINT "control_command_logs_control_command_id_fkey"',
  'ON DELETE CASCADE',
].forEach((token) => assertIncludes(controlLifecycleMigration, token, "control lifecycle migration"));

[
  'CREATE INDEX "traffic_events_event_type_received_at_idx"',
  'CREATE INDEX "traffic_events_event_type_track_id_idx"',
  'CREATE INDEX "traffic_events_event_type_vehicle_track_id_idx"',
].forEach((token) => assertIncludes(trafficEventSummaryIndexMigration, token, "traffic event summary index migration"));

[
  'where: { id: "site-wolchulsan-rest-area" }',
  'name: "\\uC6D4\\uCD9C\\uC0B0\\uD734\\uAC8C\\uC18C"',
  'location: "\\uC804\\uB77C\\uB0A8\\uB3C4 \\uC601\\uC554\\uAD70"',
  "description:",
  '"\\uB77C\\uC774\\uB2E4 \\uC5ED\\uC8FC\\uD589 \\uBC29\\uC9C0 \\uC2DC\\uC2A4\\uD15C 1\\uCC28 \\uAC1C\\uBC1C \\uB300\\uC0C1 \\uD604\\uC7A5"',
  'zoneCode: "ROUNDABOUT-01"',
  'zoneCode: "ROUNDABOUT-02"',
  'name: "\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 1"',
  'name: "\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 2"',
  'deviceCode: "LIDAR-PC-01"',
  'deviceCode: "CONTROL-BOARD-01"',
  'deviceCode: "LIDAR-PC-02"',
  'deviceCode: "CONTROL-BOARD-02"',
  'name: "\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 1 \\uB77C\\uC774\\uB2E4 PC"',
  '"\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 1 \\uD1B5\\uD569\\uC81C\\uC5B4\\uBCF4\\uB4DC"',
  'name: "\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 2 \\uB77C\\uC774\\uB2E4 PC"',
  '"\\uD68C\\uC804\\uAD50\\uCC28\\uB85C 2 \\uD1B5\\uD569\\uC81C\\uC5B4\\uBCF4\\uB4DC"',
  'deviceType: "LIDAR_PC"',
  'deviceType: "CONTROL_BOARD"',
  'status: "UNKNOWN"',
  'healthStatus: "UNKNOWN"',
].forEach((token) => assertIncludes(seed, token, "Prisma seed contract"));

assert(!seed.includes("\uFFFD"), "Prisma seed contains replacement-character mojibake");
assert(!/\?{2,}/.test(seed), "Prisma seed contains repeated question-mark mojibake");

assertIncludes(
  syntaxChecker,
  'path.join(serverRoot, "prisma", "seed.js")',
  "server syntax checker",
);

[
  "tx.vehicleTrack.upsert",
  "where: { trackId: data.trackId }",
  "vehicleTrackId: vehicleTrack?.id || null",
  "include: { zone: true, vehicleTrack: true }",
  "rawPayload: data.rawPayload",
].forEach((token) => assertIncludes(wrongwayService, token, "wrongway service Prisma usage"));

[
  "tx.controlCommand.create",
  "tx.controlCommandLog.create",
  "prisma.controlCommand.findFirst",
  "packetHex",
  "crcStatus",
  "requestedByUserId",
].forEach((token) => assertIncludes(controlBoardService, token, "control board service Prisma usage"));

[
  "prisma.vehicleTrack.findMany",
  "prisma.trafficEvent.findMany",
  "prisma.controlCommand.findMany",
].forEach((token) => assertIncludes(statisticsService, token, "statistics service Prisma usage"));

[
  "include: {",
  "eventLogs:",
  "controlCommands:",
  'logs: { orderBy: { createdAt: "asc" } }',
].forEach((token) => assertIncludes(eventService, token, "event service Prisma include contract"));

console.log("prisma contracts ok");
