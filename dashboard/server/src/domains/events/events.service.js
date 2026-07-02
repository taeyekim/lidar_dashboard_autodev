const { prisma } = require("../../prisma/client");
const { broadcastRealtime } = require("../../realtime/bus");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInteger(value, fallback, max = MAX_LIMIT) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.trunc(number), max);
}

function toOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeEvent(event) {
  if (!event) return null;
  return {
    ...event,
    occurredAt: serializeDate(event.occurredAt),
    receivedAt: serializeDate(event.receivedAt),
    createdAt: serializeDate(event.createdAt),
    updatedAt: serializeDate(event.updatedAt),
  };
}

function serializeLog(log) {
  if (!log) return null;
  return {
    ...log,
    createdAt: serializeDate(log.createdAt),
  };
}

function serializeCommand(command) {
  if (!command) return null;
  return {
    ...command,
    requestedAt: serializeDate(command.requestedAt),
    sentAt: serializeDate(command.sentAt),
    acknowledgedAt: serializeDate(command.acknowledgedAt),
    completedAt: serializeDate(command.completedAt),
    createdAt: serializeDate(command.createdAt),
    updatedAt: serializeDate(command.updatedAt),
    logs: command.logs?.map(serializeLog),
  };
}

function eventInclude() {
  return {
    zone: true,
    vehicleTrack: true,
  };
}

function buildWhere(query = {}) {
  const where = {};

  if (query.status) where.status = String(query.status);
  const eventType = query.eventType || query.type;
  if (eventType === "wrong-way" || eventType === "wrongway") {
    where.eventType = { in: ["wrong-way-level-1", "wrong-way-level-2"] };
  } else if (eventType) {
    where.eventType = String(eventType);
  }
  if (query.zoneId) where.zoneId = String(query.zoneId);
  if (query.externalZoneId) where.externalZoneId = String(query.externalZoneId);
  if (query.trackId) where.trackId = String(query.trackId);

  return where;
}

async function listEvents(query = {}) {
  const limit = toPositiveInteger(query.limit, DEFAULT_LIMIT);
  const offset = toOffset(query.offset);
  const where = buildWhere(query);

  const [total, events] = await Promise.all([
    prisma.trafficEvent.count({ where }),
    prisma.trafficEvent.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }],
      skip: offset,
      take: limit,
      include: eventInclude(),
    }),
  ]);

  return {
    ok: true,
    total,
    limit,
    offset,
    items: events.map(serializeEvent),
  };
}

async function getRecentEvents(query = {}) {
  return listEvents({ ...query, limit: toPositiveInteger(query.limit, 10) });
}

async function getEventById(id) {
  const event = await prisma.trafficEvent.findUnique({
    where: { id },
    include: {
      ...eventInclude(),
      eventLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      controlCommands: {
        orderBy: { requestedAt: "desc" },
        take: 20,
        include: {
          logs: { orderBy: { createdAt: "asc" } },
          targetDevice: true,
        },
      },
    },
  });

  if (!event) return null;

  return {
    ...serializeEvent(event),
    eventLogs: event.eventLogs.map(serializeLog),
    controlCommands: event.controlCommands.map(serializeCommand),
  };
}

async function getSummary() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [total, today, byStatus, byEventType, latest] = await Promise.all([
    prisma.trafficEvent.count(),
    prisma.trafficEvent.count({ where: { receivedAt: { gte: todayStart } } }),
    prisma.trafficEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.trafficEvent.groupBy({
      by: ["eventType"],
      _count: { _all: true },
    }),
    prisma.trafficEvent.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { id: true, receivedAt: true },
    }),
  ]);

  return {
    ok: true,
    total,
    today,
    byStatus: Object.fromEntries(byStatus.map((item) => [item.status, item._count._all])),
    byEventType: Object.fromEntries(byEventType.map((item) => [item.eventType, item._count._all])),
    lastEventId: latest?.id || null,
    lastReceivedAt: latest?.receivedAt ? latest.receivedAt.toISOString() : null,
  };
}

async function updateEventStatus(id, status, message, userId = null) {
  const nextStatus = String(status || "").trim();
  if (!nextStatus) {
    const error = new Error("status is required.");
    error.status = 400;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.trafficEvent.findUnique({ where: { id } });
    if (!before) return null;

    const event = await tx.trafficEvent.update({
      where: { id },
      data: { status: nextStatus },
      include: eventInclude(),
    });

    await tx.eventLog.create({
      data: {
        eventId: id,
        userId,
        action: "STATUS_CHANGED",
        message: message || `Status changed to ${nextStatus}`,
        metadata: {
          previousStatus: before.status,
          nextStatus,
        },
      },
    });

    const serialized = serializeEvent(event);
    broadcastRealtime("traffic-event.updated", serialized);
    return serialized;
  });
}

async function updateEventMemo(id, memo, userId = null) {
  const text = String(memo ?? "").trim();
  if (!text) {
    const error = new Error("memo is required.");
    error.status = 400;
    throw error;
  }

  const event = await prisma.trafficEvent.findUnique({ where: { id }, select: { id: true } });
  if (!event) return null;

  const log = await prisma.eventLog.create({
    data: {
      eventId: id,
      userId,
      action: "MEMO_UPDATED",
      message: text,
      metadata: { memo: text },
    },
  });

  broadcastRealtime("traffic-event.updated", {
    id,
    latestLog: serializeLog(log),
    memo: text,
  });

  return serializeLog(log);
}

async function getEventLogs(id, query = {}) {
  const limit = toPositiveInteger(query.limit, DEFAULT_LIMIT);
  const event = await prisma.trafficEvent.findUnique({ where: { id }, select: { id: true } });
  if (!event) return null;

  const logs = await prisma.eventLog.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    ok: true,
    eventId: id,
    items: logs.map(serializeLog),
  };
}

module.exports = {
  listEvents,
  getRecentEvents,
  getEventById,
  getSummary,
  updateEventStatus,
  updateEventMemo,
  getEventLogs,
};
