const { prisma } = require("../../prisma/client");
const { logger } = require("../../utils/logger");
const controlBoardService = require("../control-board/controlBoard.service");
const mockLidarService = require("../mock-lidar/mockLidar.service");

const PAYLOAD_TYPES = {
  NORMAL_DRIVING: "normal-driving",
  WRONG_WAY_LEVEL_1: "wrong-way-level-1",
  WRONG_WAY_LEVEL_2: "wrong-way-level-2",
  SITUATION_ENDED: "situation-ended",
};

const SUPPORTED_TYPES = new Set(Object.values(PAYLOAD_TYPES));

function createBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isObjectPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload);
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toInteger(value) {
  const number = toNumber(value);
  return number === null ? null : Math.trunc(number);
}

function toBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function toStringOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePayloadType(payload) {
  const explicitType = pickFirst(payload.type, payload.event_type, payload.eventType);
  if (SUPPORTED_TYPES.has(explicitType)) return explicitType;

  if (explicitType === "wrong-way" || explicitType === "wrong_way" || explicitType === "WRONG_WAY") {
    const level = toInteger(pickFirst(payload.warning_level, payload.warningLevel, payload.stage));
    return level === 2 ? PAYLOAD_TYPES.WRONG_WAY_LEVEL_2 : PAYLOAD_TYPES.WRONG_WAY_LEVEL_1;
  }

  if (!explicitType) {
    const level = toInteger(pickFirst(payload.warning_level, payload.warningLevel, payload.stage));
    if (level === 2) return PAYLOAD_TYPES.WRONG_WAY_LEVEL_2;
    if (level === 1) return PAYLOAD_TYPES.WRONG_WAY_LEVEL_1;
  }

  throw createBadRequest(
    `Unsupported wrongway payload type. Supported types: ${Array.from(SUPPORTED_TYPES).join(", ")}`,
  );
}

function warningLevelFor(type, payload) {
  const payloadLevel = toInteger(pickFirst(payload.warning_level, payload.warningLevel, payload.stage));
  if (payloadLevel !== null) return payloadLevel;
  if (type === PAYLOAD_TYPES.WRONG_WAY_LEVEL_2) return 2;
  if (type === PAYLOAD_TYPES.WRONG_WAY_LEVEL_1) return 1;
  return null;
}

function normalizePayload(payload, receivedAt) {
  if (!isObjectPayload(payload)) {
    throw createBadRequest("Request body must be a JSON object.");
  }

  const type = normalizePayloadType(payload);
  const occurredAt = parseDate(pickFirst(payload.timestamp, payload.occurred_at, payload.occurredAt));
  const externalZoneId = pickFirst(payload.zone_id, payload.zoneId);
  const trackId = pickFirst(
    payload.track_id,
    payload.trackId,
    payload.object_id,
    payload.objectId,
    payload.uuid,
    payload.object_uuid,
    payload.objectUuid,
    payload.stable_object_id,
    payload.stableObjectId,
  );

  return {
    type,
    eventCode: toStringOrNull(pickFirst(payload.eventCode, payload.event_code, payload.id, payload.event_id)),
    occurredAt,
    receivedAt,
    externalZoneId: toStringOrNull(externalZoneId),
    trackId: toStringOrNull(trackId),
    warningLevel: warningLevelFor(type, payload),
    confidence: toNumber(payload.confidence),
    message: toStringOrNull(pickFirst(payload.message, payload.summary)),
    speedMs: toNumber(pickFirst(payload.speed_ms, payload.speedMs)),
    speedKmh: toNumber(pickFirst(payload.speed_kmh, payload.speedKmh)),
    objectClass: toInteger(pickFirst(payload.object_class, payload.objectClass)),
    objectUuid: toStringOrNull(pickFirst(payload.objectUuid, payload.object_uuid, payload.uuid)),
    description: toStringOrNull(pickFirst(payload.description, payload.detail)),
    consecutiveCount: toInteger(pickFirst(payload.consecutive_count, payload.consecutiveCount)),
    isConfirmed: toBoolean(pickFirst(payload.is_confirmed, payload.isConfirmed)),
    normalMovingVehicleCount: toInteger(
      pickFirst(payload.normal_moving_vehicle_count, payload.normalMovingVehicleCount),
    ),
    rawPayload: payload,
  };
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeTrafficEvent(event) {
  if (!event) return null;
  return {
    ...event,
    occurredAt: serializeDate(event.occurredAt),
    receivedAt: serializeDate(event.receivedAt),
    createdAt: serializeDate(event.createdAt),
    updatedAt: serializeDate(event.updatedAt),
  };
}

function serializeVehicleTrack(track) {
  if (!track) return null;
  return {
    ...track,
    firstSeenAt: serializeDate(track.firstSeenAt),
    lastSeenAt: serializeDate(track.lastSeenAt),
    createdAt: serializeDate(track.createdAt),
    updatedAt: serializeDate(track.updatedAt),
  };
}

async function findZoneByExternalZoneId(tx, externalZoneId) {
  if (!externalZoneId) return null;
  return tx.zone.findUnique({
    where: { zoneCode: externalZoneId },
    select: { id: true, zoneCode: true, name: true },
  });
}

async function upsertVehicleTrack(tx, data, zone) {
  if (!data.trackId) return null;

  const seenAt = data.occurredAt || data.receivedAt;
  const existing = await tx.vehicleTrack.findUnique({
    where: { trackId: data.trackId },
    select: { id: true },
  });

  const track = await tx.vehicleTrack.upsert({
    where: { trackId: data.trackId },
    create: {
      trackId: data.trackId,
      zoneId: zone?.id || null,
      externalZoneId: data.externalZoneId,
      lastEventType: data.type,
      lastWarningLevel: data.warningLevel,
      objectClass: data.objectClass,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      lastNormalMovingVehicleCount: data.normalMovingVehicleCount,
      rawPayload: data.rawPayload,
    },
    update: {
      zoneId: zone?.id || null,
      externalZoneId: data.externalZoneId,
      lastEventType: data.type,
      lastWarningLevel: data.warningLevel,
      objectClass: data.objectClass,
      lastSeenAt: seenAt,
      lastNormalMovingVehicleCount: data.normalMovingVehicleCount,
      rawPayload: data.rawPayload,
    },
  });

  return {
    track,
    created: !existing,
  };
}

function trafficEventData(data, zone, vehicleTrackState) {
  const vehicleTrack = vehicleTrackState?.track || vehicleTrackState;

  return {
    eventCode: data.eventCode,
    eventType: data.type,
    occurredAt: data.occurredAt,
    receivedAt: data.receivedAt,
    zoneId: zone?.id || null,
    vehicleTrackId: vehicleTrack?.id || null,
    externalZoneId: data.externalZoneId,
    trackId: data.trackId,
    warningLevel: data.warningLevel,
    confidence: data.confidence,
    message: data.message,
    speedMs: data.speedMs,
    speedKmh: data.speedKmh,
    objectClass: data.objectClass,
    objectUuid: data.objectUuid ? String(data.objectUuid) : null,
    description: data.description,
    consecutiveCount: data.consecutiveCount,
    isConfirmed: data.isConfirmed,
    normalMovingVehicleCount: data.normalMovingVehicleCount,
    rawPayload: data.rawPayload,
  };
}

async function createOrUpdateTrafficEvent(tx, data, zone, vehicleTrackState) {
  if (data.type === PAYLOAD_TYPES.NORMAL_DRIVING) return null;

  const create = trafficEventData(data, zone, vehicleTrackState);
  if (!data.eventCode) {
    return tx.trafficEvent.create({
      data: create,
      include: { zone: true, vehicleTrack: true },
    });
  }

  const update = trafficEventData(data, zone, vehicleTrackState);
  delete update.eventCode;

  return tx.trafficEvent.upsert({
    where: { eventCode: data.eventCode },
    create,
    update,
    include: { zone: true, vehicleTrack: true },
  });
}

async function createEventLog(tx, data, event, vehicleTrackState, source) {
  const vehicleTrack = vehicleTrackState?.track || vehicleTrackState;
  if (data.type === PAYLOAD_TYPES.NORMAL_DRIVING && !vehicleTrackState?.created) {
    return null;
  }

  const action = data.type === PAYLOAD_TYPES.NORMAL_DRIVING ? "NORMAL_DRIVING_RECEIVED" : "TRAFFIC_EVENT_RECEIVED";
  return tx.eventLog.create({
    data: {
      eventId: event?.id || null,
      action,
      message: data.message || data.description || data.type,
      metadata: {
        source,
        payloadType: data.type,
        externalZoneId: data.externalZoneId,
        trackId: data.trackId,
        vehicleTrackId: vehicleTrack?.id || null,
        warningLevel: data.warningLevel,
      },
    },
  });
}

function toDashboardEvent(data, event, vehicleTrack) {
  return {
    id: event?.id || vehicleTrack?.id || `evt-${Date.now()}`,
    type: data.type,
    stage: data.warningLevel || 0,
    message: data.description || data.message || data.type,
    subMessage: `Zone: ${data.externalZoneId || "UNKNOWN"}`,
    timestamp: (data.occurredAt || data.receivedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    zone_id: data.externalZoneId,
    track_id: data.trackId,
    confidence: data.confidence,
    speed_ms: data.speedMs,
    speed_kmh: data.speedKmh,
    object_class: data.objectClass,
    uuid: data.objectUuid,
  };
}

function applyDashboardEffects(data, event, vehicleTrack) {
  if (data.type === PAYLOAD_TYPES.NORMAL_DRIVING) {
    mockLidarService.increaseVehiclePassed();
    mockLidarService.pushLog(`[WRONGWAY] normal-driving ${data.externalZoneId || "UNKNOWN"}`);
    return;
  }

  if (data.type === PAYLOAD_TYPES.SITUATION_ENDED) {
    mockLidarService.pushLog(`[WRONGWAY] situation-ended ${data.externalZoneId || "UNKNOWN"}`);
    return;
  }

  const dashboardEvent = toDashboardEvent(data, event, vehicleTrack);
  mockLidarService.applyDashboardEventEffects({ ...dashboardEvent, type: "wrong-way" });
  mockLidarService.addWrongWayHistory({ ...dashboardEvent, type: "wrong-way" });
  mockLidarService.broadcastDashboardEvent({ ...dashboardEvent, type: "wrong-way" });
  mockLidarService.pushLog(`[WRONGWAY] ${dashboardEvent.message}`);
}

async function ingestWrongwayPayload(payload, options = {}) {
  const receivedAt = options.receivedAt ? new Date(options.receivedAt) : new Date();
  const data = normalizePayload(payload, receivedAt);
  const source = options.source || "WRONGWAY_API";

  logger.info("wrongway payload received", {
    type: data.type,
    source,
    zoneId: data.externalZoneId,
    trackId: data.trackId,
  });

  const result = await prisma.$transaction(async (tx) => {
    const zone = await findZoneByExternalZoneId(tx, data.externalZoneId);
    const vehicleTrackState = await upsertVehicleTrack(tx, data, zone);
    const event = await createOrUpdateTrafficEvent(tx, data, zone, vehicleTrackState);
    await createEventLog(tx, data, event, vehicleTrackState, source);
    return {
      zone,
      vehicleTrack: vehicleTrackState?.track || null,
      vehicleTrackCreated: Boolean(vehicleTrackState?.created),
      event,
    };
  });

  applyDashboardEffects(data, result.event, result.vehicleTrack);

  let controlCommand = null;
  try {
    controlCommand = await controlBoardService.createCommandForWrongwayEvent(data.type, result.event);
  } catch (error) {
    logger.error("control board command trigger failed", {
      eventId: result.event?.id,
      payloadType: data.type,
      error,
    });
  }

  const event = serializeTrafficEvent(result.event);
  const vehicleTrack = serializeVehicleTrack(result.vehicleTrack);

  return {
    ok: true,
    eventId: event?.id || null,
    receivedAt: data.receivedAt.toISOString(),
    vehicleTrackCreated: result.vehicleTrackCreated,
    controlCommand,
    event:
      event || {
        type: data.type,
        vehicleTrack,
        externalZoneId: data.externalZoneId,
        trackId: data.trackId,
        receivedAt: data.receivedAt.toISOString(),
      },
  };
}

module.exports = {
  PAYLOAD_TYPES,
  ingestWrongwayPayload,
};
