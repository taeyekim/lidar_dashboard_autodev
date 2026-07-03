function toInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.trunc(number));
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function getControlBoardConfig() {
  return {
    transport: String(process.env.CONTROL_BOARD_TRANSPORT || "tcp").toLowerCase(),
    host: process.env.CONTROL_BOARD_HOST || "",
    port: toInteger(process.env.CONTROL_BOARD_PORT, 0),
    connectTimeoutMs: toInteger(process.env.CONTROL_BOARD_CONNECT_TIMEOUT_MS, 1000),
    responseTimeoutMs: toInteger(process.env.CONTROL_BOARD_RESPONSE_TIMEOUT_MS, 1000),
    retryCount: toInteger(process.env.CONTROL_BOARD_RETRY_COUNT, 1),
    heartbeatIntervalMs: toInteger(process.env.CONTROL_BOARD_HEARTBEAT_INTERVAL_MS, 5000),
    dryRun: toBoolean(process.env.CONTROL_BOARD_DRY_RUN, true),
    liveApproved: toBoolean(process.env.CONTROL_BOARD_LIVE_APPROVED, false),
  };
}

module.exports = {
  getControlBoardConfig,
};
