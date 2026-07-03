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
  'name: "월출산휴게소"',
  'location: "전라남도 영암군"',
  'description: "라이다 역주행 방지 시스템 1차 개발 대상 현장"',
  'zoneCode: "ROUNDABOUT-01"',
  'zoneCode: "ROUNDABOUT-02"',
  'name: "회전교차로 1"',
  'name: "회전교차로 2"',
  'deviceCode: "LIDAR-PC-01"',
  'deviceCode: "CONTROL-BOARD-01"',
  'deviceCode: "LIDAR-PC-02"',
  'deviceCode: "CONTROL-BOARD-02"',
  'name: "회전교차로 1 라이다 PC"',
  'name: "회전교차로 1 통합제어보드"',
  'name: "회전교차로 2 라이다 PC"',
  'name: "회전교차로 2 통합제어보드"',
  'deviceType: "LIDAR_PC"',
  'deviceType: "CONTROL_BOARD"',
  'status: "UNKNOWN"',
  'healthStatus: "UNKNOWN"',
].forEach((token) => assertIncludes(seed, token, "Prisma seed contract"));

[
  "占",
  "沃",
  "筌",
  "獄",
  "癰",
  "揶",
  "?붿",
  "?뚯",
  "?쇱",
  "?듯",
].forEach((token) => {
  assert(!seed.includes(token), `Prisma seed contains mojibake token: ${token}`);
});

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
