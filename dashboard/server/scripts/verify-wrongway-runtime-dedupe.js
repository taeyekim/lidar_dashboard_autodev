const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`);
}

function installMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function makeRecord(data, defaults = {}) {
  const now = new Date("2026-07-03T00:00:00.000Z");
  return {
    createdAt: now,
    updatedAt: now,
    ...defaults,
    ...data,
  };
}

function createMockPrisma() {
  const state = {
    vehicleTracks: new Map(),
    trafficEvents: [],
    eventLogs: [],
    nextTrackId: 1,
    nextEventId: 1,
    nextLogId: 1,
  };

  const tx = {
    zone: {
      async findUnique() {
        return null;
      },
    },
    vehicleTrack: {
      async findUnique({ where }) {
        const track = state.vehicleTracks.get(where.trackId);
        return track ? { id: track.id } : null;
      },
      async upsert({ where, create, update }) {
        const existing = state.vehicleTracks.get(where.trackId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-07-03T00:00:01.000Z") });
          return existing;
        }

        const track = makeRecord(create, {
          id: `track-${state.nextTrackId}`,
        });
        state.nextTrackId += 1;
        state.vehicleTracks.set(where.trackId, track);
        return track;
      },
    },
    trafficEvent: {
      async findFirst({ where }) {
        return state.trafficEvents.find((event) => {
          if (where.trackId && event.trackId !== where.trackId) return false;
          if (where.eventType && event.eventType !== where.eventType) return false;
          if (where.status?.notIn?.includes(event.status)) return false;
          return true;
        }) || null;
      },
      async findUnique({ where }) {
        return state.trafficEvents.find((event) => event.eventCode === where.eventCode) || null;
      },
      async create({ data }) {
        const event = makeRecord(data, {
          id: `event-${state.nextEventId}`,
          status: "NEW",
        });
        state.nextEventId += 1;
        state.trafficEvents.push(event);
        return event;
      },
      async update({ where, data }) {
        const event = state.trafficEvents.find((item) => item.id === where.id);
        assert(event, `mock traffic event not found: ${where.id}`);
        Object.assign(event, data, { updatedAt: new Date("2026-07-03T00:00:02.000Z") });
        return event;
      },
      async upsert({ where, create, update }) {
        const existing = state.trafficEvents.find((event) => event.eventCode === where.eventCode);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-07-03T00:00:02.000Z") });
          return existing;
        }
        return tx.trafficEvent.create({ data: create });
      },
      async findMany({ where } = {}) {
        return state.trafficEvents.filter((event) => {
          if (where?.id?.in && !where.id.in.includes(event.id)) return false;
          if (where?.id?.not && event.id === where.id.not) return false;
          if (where?.trackId && event.trackId !== where.trackId) return false;
          if (where?.eventType?.in && !where.eventType.in.includes(event.eventType)) return false;
          if (where?.status?.notIn?.includes(event.status)) return false;
          return true;
        });
      },
      async updateMany({ where, data }) {
        const events = await tx.trafficEvent.findMany({ where });
        events.forEach((event) => {
          Object.assign(event, data, { updatedAt: new Date("2026-07-03T00:00:03.000Z") });
        });
        return { count: events.length };
      },
    },
    eventLog: {
      async create({ data }) {
        const log = makeRecord(data, { id: `log-${state.nextLogId}` });
        state.nextLogId += 1;
        state.eventLogs.push(log);
        return log;
      },
      async createMany({ data }) {
        data.forEach((item) => {
          state.eventLogs.push(makeRecord(item, { id: `log-${state.nextLogId}` }));
          state.nextLogId += 1;
        });
        return { count: data.length };
      },
    },
  };

  return {
    __state: state,
    async $transaction(callback) {
      return callback(tx);
    },
  };
}

async function main() {
  const serverRoot = path.resolve(__dirname, "..");
  const prisma = createMockPrisma();
  const dashboardEffects = { vehiclesPassed: 0, logs: [] };
  const realtimeMessages = [];
  const commandCalls = [];

  installMock(path.join(serverRoot, "src/prisma/client.js"), { prisma });
  installMock(path.join(serverRoot, "src/utils/logger.js"), {
    logger: { info() {}, warn() {}, error() {} },
  });
  installMock(path.join(serverRoot, "src/realtime/bus.js"), {
    broadcastRealtime(type, payload) {
      realtimeMessages.push({ type, payload });
    },
  });
  installMock(path.join(serverRoot, "src/domains/mock-lidar/mockLidar.service.js"), {
    increaseVehiclePassed() {
      dashboardEffects.vehiclesPassed += 1;
    },
    pushLog(message) {
      dashboardEffects.logs.push(message);
    },
    applyDashboardEventEffects() {},
    addWrongWayHistory() {},
    broadcastDashboardEvent() {},
  });
  installMock(path.join(serverRoot, "src/domains/control-board/controlBoard.service.js"), {
    async createCommandForWrongwayEvent(payloadType, trafficEvent) {
      const commandTypeByPayloadType = {
        "wrong-way-level-1": "STAGE_1_ON",
        "wrong-way-level-2": "STAGE_2_ON",
        "situation-ended": "STAGE_2_RETURN",
      };
      const commandType = commandTypeByPayloadType[payloadType] || null;
      commandCalls.push({ payloadType, commandType, trafficEventId: trafficEvent?.id || null });
      if (!trafficEvent?.id) return null;
      return { id: `command-${commandCalls.length}`, payloadType, commandType, trafficEventId: trafficEvent.id };
    },
  });

  const { ingestWrongwayPayload } = require(path.join(serverRoot, "src/domains/wrongway/wrongway.service.js"));

  const firstNormal = await ingestWrongwayPayload({
    type: "normal-driving",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:00.000Z",
    normal_moving_vehicle_count: 3,
    sequence: 1,
  }, { receivedAt: "2026-07-03T00:00:00.000Z" });

  const secondNormal = await ingestWrongwayPayload({
    type: "normal-driving",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:01.000Z",
    normal_moving_vehicle_count: 4,
    sequence: 2,
  }, { receivedAt: "2026-07-03T00:00:01.000Z" });

  const camelCaseNormal = await ingestWrongwayPayload({
    type: "normal-driving",
    zoneId: "Z-DEDUPE",
    objectId: "stable-track-001",
    occurredAt: "2026-07-03T00:00:01.500Z",
    normalMovingVehicleCount: 5,
    sequence: 3,
  }, { receivedAt: "2026-07-03T00:00:01.500Z" });

  assert(firstNormal.ok, "first normal-driving ingest must succeed");
  assert(secondNormal.ok, "second normal-driving ingest must succeed");
  assert(camelCaseNormal.ok, "camelCase normal-driving ingest must succeed");
  assert(firstNormal.vehicleTrackCreated, "first normal-driving payload must create the unique vehicle track");
  assert(!secondNormal.vehicleTrackCreated, "repeated normal-driving payload must reuse the vehicle track");
  assert(!camelCaseNormal.vehicleTrackCreated, "camelCase objectId payload must reuse the stable vehicle track");
  assert(
    !firstNormal.eventCreated && !secondNormal.eventCreated && !camelCaseNormal.eventCreated,
    "normal-driving must not create traffic events",
  );
  assertEqual(prisma.__state.vehicleTracks.size, 1, "normal-driving duplicates must leave one vehicle track");
  assertEqual(prisma.__state.trafficEvents.length, 0, "normal-driving duplicates must leave zero traffic events");
  assertEqual(prisma.__state.eventLogs.length, 1, "repeated normal-driving track must not create duplicate event logs");
  assertEqual(dashboardEffects.vehiclesPassed, 1, "dashboard vehicle counter must increment only for the first unique track");

  const track = Array.from(prisma.__state.vehicleTracks.values())[0];
  assertEqual(track.lastNormalMovingVehicleCount, 5, "vehicle track must keep the latest raw LiDAR normal count");
  assertEqual(track.rawPayload.sequence, 3, "vehicle track must keep the latest raw normal-driving payload");
  assertEqual(track.rawPayload.objectId, "stable-track-001", "vehicle track must preserve camelCase objectId raw payload evidence");

  const firstWrongway = await ingestWrongwayPayload({
    type: "wrong-way-level-1",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:02.000Z",
    confidence: 0.95,
  }, { receivedAt: "2026-07-03T00:00:02.000Z" });

  const repeatedWrongway = await ingestWrongwayPayload({
    type: "wrong-way-level-1",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:03.000Z",
    confidence: 0.97,
  }, { receivedAt: "2026-07-03T00:00:03.000Z" });

  assert(firstWrongway.eventCreated, "first wrong-way level 1 payload must create a traffic event");
  assert(repeatedWrongway.eventReused, "repeated active wrong-way level 1 payload must reuse the event");
  assertEqual(prisma.__state.trafficEvents.length, 1, "repeated active wrong-way payload must not duplicate traffic events");
  assertEqual(prisma.__state.trafficEvents[0].vehicleTrackId, track.id, "wrong-way event must link to the unique vehicle track");
  assertEqual(commandCalls.filter((call) => call.trafficEventId).length, 2, "wrong-way command hook must receive the event on both create and reuse");
  assertEqual(commandCalls.filter((call) => call.commandType === "STAGE_1_ON").length, 2, "level-1 wrong-way payloads must create or reuse only stage-1 control commands");
  assertEqual(commandCalls.filter((call) => call.commandType === "STAGE_2_ON").length, 0, "level-1 wrong-way payloads must not auto-escalate to stage-2 control commands");

  const explicitLevel2 = await ingestWrongwayPayload({
    type: "wrong-way-level-2",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:04.000Z",
    confidence: 0.99,
  }, { receivedAt: "2026-07-03T00:00:04.000Z" });

  assert(explicitLevel2.eventCreated, "explicit wrong-way level 2 payload must create the stage-2 traffic event");
  assertEqual(commandCalls.filter((call) => call.commandType === "STAGE_2_ON").length, 1, "stage-2 control command must be created only after an explicit level-2 payload");

  const situationEnded = await ingestWrongwayPayload({
    type: "situation-ended",
    zone_id: "Z-DEDUPE",
    track_id: "stable-track-001",
    timestamp: "2026-07-03T00:00:04.500Z",
    message: "wrong-way situation ended",
  }, { receivedAt: "2026-07-03T00:00:04.500Z" });

  assert(situationEnded.eventCreated, "situation-ended payload must create a closing traffic event");
  assertEqual(situationEnded.resolvedEventIds.length, 2, "situation-ended must resolve both active stage-1 and stage-2 events for the track");
  assertEqual(
    prisma.__state.trafficEvents.filter(
      (event) =>
        event.trackId === "stable-track-001" &&
        ["wrong-way-level-1", "wrong-way-level-2"].includes(event.eventType) &&
        event.status === "RESOLVED",
    ).length,
    2,
    "situation-ended must mark active wrong-way events RESOLVED",
  );
  assert(
    prisma.__state.eventLogs.filter((log) => log.action === "SITUATION_ENDED_RESOLVED" && log.metadata?.closingEventId === situationEnded.eventId).length === 2,
    "situation-ended must create resolution event logs for audit evidence",
  );
  assertEqual(commandCalls.filter((call) => call.commandType === "STAGE_2_RETURN").length, 1, "situation-ended must create a return command for the control board");
  assertEqual(
    commandCalls.find((call) => call.commandType === "STAGE_2_RETURN").trafficEventId,
    situationEnded.eventId,
    "situation-ended return command must link to the closing event",
  );

  const stableObjectLevel1 = await ingestWrongwayPayload({
    type: "wrong-way-level-1",
    zoneId: "Z-DEDUPE",
    stableObjectId: "field-stable-object-002",
    occurredAt: "2026-07-03T00:00:05.000Z",
    confidence: 0.91,
  }, { receivedAt: "2026-07-03T00:00:05.000Z" });

  assert(stableObjectLevel1.eventCreated, "stableObjectId wrong-way payload must create a traffic event");
  assertEqual(prisma.__state.vehicleTracks.size, 2, "stableObjectId payload must create a second unique vehicle track");
  assertEqual(stableObjectLevel1.event.trackId, "field-stable-object-002", "stableObjectId must normalize to event trackId");

  const vehicleTrackRealtime = realtimeMessages.filter((message) => message.type === "vehicle-track.updated");
  assertEqual(vehicleTrackRealtime.length, 8, "every ingest must publish vehicle-track.updated for operators");
  assert(
    realtimeMessages.filter((message) => message.type === "traffic-event.updated").length >= 3,
    "situation-ended must publish updates for the closing event and resolved active events",
  );

  console.log("wrongway runtime dedupe ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
