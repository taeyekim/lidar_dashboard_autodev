const { prisma } = require("../../prisma/client");
const controlBoardService = require("../control-board/controlBoard.service");
const sitesService = require("../sites/sites.service");

async function getDatabaseStatus() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, status: "ONLINE" };
  } catch (error) {
    return { ok: false, status: "ERROR", error: error.message };
  }
}

async function getIngestStatus() {
  try {
    const latestEvent = await prisma.trafficEvent.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { id: true, eventType: true, receivedAt: true },
    });
    const latestTrack = await prisma.vehicleTrack.findFirst({
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, trackId: true, lastEventType: true, lastSeenAt: true },
    });

    return {
      ok: true,
      status: latestEvent || latestTrack ? "RECEIVING_OR_READY" : "NO_DATA",
      latestEvent: latestEvent
        ? { ...latestEvent, receivedAt: latestEvent.receivedAt?.toISOString() || null }
        : null,
      latestTrack: latestTrack
        ? { ...latestTrack, lastSeenAt: latestTrack.lastSeenAt?.toISOString() || null }
        : null,
    };
  } catch (error) {
    return { ok: false, status: "ERROR", error: error.message };
  }
}

async function settleStatus(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    return { ...fallback, ok: false, status: "ERROR", error: error.message };
  }
}

async function getSystemStatus() {
  const checkedAt = new Date().toISOString();
  const [database, ingest, devices, controlBoard] = await Promise.all([
    getDatabaseStatus(),
    getIngestStatus(),
    settleStatus(() => sitesService.getDeviceStatusSummary(), { total: 0, configured: false }),
    settleStatus(() => controlBoardService.getStatus(), { mode: "UNKNOWN", transport: "tcp" }),
  ]);

  return {
    ok: database.ok,
    checkedAt,
    server: {
      ok: true,
      status: "ONLINE",
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
    },
    database,
    ingest,
    websocket: {
      ok: true,
      status: "AVAILABLE",
      note: "WebSocket server is attached by the runtime entrypoint.",
    },
    devices,
    controlBoard,
  };
}

module.exports = {
  getSystemStatus,
};
