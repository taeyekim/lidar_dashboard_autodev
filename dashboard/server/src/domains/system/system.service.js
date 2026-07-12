const { prisma } = require("../../prisma/client");
const { ENV_DEFAULTS, ENV_KEYS, envBoolean, envList, envString } = require("../../config/env");
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

function hasNonPlaceholderJwtSecret() {
  const value = envString(ENV_KEYS.JWT_SECRET, ENV_DEFAULTS.JWT_SECRET).trim();
  return Boolean(value) && !["dev-only-change-me", "change-this-to-a-long-random-secret"].includes(value);
}

function buildDeliveryReadiness(controlBoard = {}) {
  const swaggerAllow = envString(ENV_KEYS.NGINX_SWAGGER_ALLOW, ENV_DEFAULTS.NGINX_SWAGGER_ALLOW).trim();
  const level2EscalationEnabled = envBoolean(ENV_KEYS.WRONGWAY_LEVEL2_ESCALATION_ENABLED, false);
  const level2ConsecutiveCount = Number(envString(ENV_KEYS.WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT, ""));
  const level2Confidence = Number(envString(ENV_KEYS.WRONGWAY_LEVEL2_MIN_CONFIDENCE, ""));
  const level2EscalationPostureReady =
    !level2EscalationEnabled ||
    (Number.isFinite(level2ConsecutiveCount) &&
      level2ConsecutiveCount > 0 &&
      Number.isFinite(level2Confidence) &&
      level2Confidence >= 0 &&
      level2Confidence <= 1);
  const checks = {
    jwtSecretConfigured: hasNonPlaceholderJwtSecret(),
    authCookieSecure: envBoolean(ENV_KEYS.AUTH_COOKIE_SECURE, ENV_DEFAULTS.AUTH_COOKIE_SECURE),
    deviceIngestKeyConfigured: Boolean(envString(ENV_KEYS.DEVICE_INGEST_API_KEY, "").trim()),
    corsOriginsConfigured: envList(ENV_KEYS.CORS_ORIGINS).length > 0,
    swaggerAllowlistRestricted: Boolean(swaggerAllow) && swaggerAllow.toLowerCase() !== "all",
    controlBoardHostConfigured: Boolean(controlBoard.hostConfigured),
    controlBoardPortConfigured: Boolean(controlBoard.portConfigured),
    controlBoardLiveApproved: Boolean(controlBoard.liveApproved),
    controlBoardLiveTcpReady: Boolean(controlBoard.liveTcpReady),
    level2EscalationPostureReady,
  };
  const openChecks = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  return {
    status: openChecks.length === 0 ? "READY_FOR_FIELD_REVIEW" : "REVIEW_REQUIRED",
    reviewBasePath: "/",
    reviewLinks: [
      { label: "Dashboard", path: "/" },
      { label: "Swagger", path: "/api-docs" },
      { label: "API health", path: "/api/health" },
      { label: "System status", path: "/api/status" },
    ],
    checks,
    openChecks,
    note:
      "This section exposes readiness booleans only. It never returns secret values, device keys, passwords, or JWT material.",
  };
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
    deliveryReadiness: buildDeliveryReadiness(controlBoard),
  };
}

module.exports = {
  getSystemStatus,
};
