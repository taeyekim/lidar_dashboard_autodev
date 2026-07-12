const ENV_KEYS = Object.freeze({
  AUTH_COOKIE_MAX_AGE_MS: "AUTH_COOKIE_MAX_AGE_MS",
  AUTH_COOKIE_NAME: "AUTH_COOKIE_NAME",
  AUTH_COOKIE_SAMESITE: "AUTH_COOKIE_SAMESITE",
  AUTH_COOKIE_SECURE: "AUTH_COOKIE_SECURE",
  AUTH_CSRF_COOKIE_NAME: "AUTH_CSRF_COOKIE_NAME",
  AUTH_RATE_LIMIT_MAX: "AUTH_RATE_LIMIT_MAX",
  AUTH_RATE_LIMIT_WINDOW_MS: "AUTH_RATE_LIMIT_WINDOW_MS",
  CONTROL_BOARD_CONNECT_TIMEOUT_MS: "CONTROL_BOARD_CONNECT_TIMEOUT_MS",
  CONTROL_BOARD_DRY_RUN: "CONTROL_BOARD_DRY_RUN",
  CONTROL_BOARD_HEARTBEAT_INTERVAL_MS: "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS",
  CONTROL_BOARD_HOST: "CONTROL_BOARD_HOST",
  CONTROL_BOARD_LIVE_APPROVED: "CONTROL_BOARD_LIVE_APPROVED",
  CONTROL_BOARD_PORT: "CONTROL_BOARD_PORT",
  CONTROL_BOARD_RESPONSE_TIMEOUT_MS: "CONTROL_BOARD_RESPONSE_TIMEOUT_MS",
  CONTROL_BOARD_RETRY_COUNT: "CONTROL_BOARD_RETRY_COUNT",
  CONTROL_BOARD_TRANSPORT: "CONTROL_BOARD_TRANSPORT",
  CORS_ORIGINS: "CORS_ORIGINS",
  DASHBOARD_BASE_URL: "DASHBOARD_BASE_URL",
  DASHBOARD_HOST: "DASHBOARD_HOST",
  DASHBOARD_PORT: "DASHBOARD_PORT",
  DETECTOR_BASE_URL: "DETECTOR_BASE_URL",
  DETECTOR_HOST: "DETECTOR_HOST",
  DETECTOR_PORT: "DETECTOR_PORT",
  DEVICE_INGEST_API_KEY: "DEVICE_INGEST_API_KEY",
  FRONTEND_PORT: "FRONTEND_PORT",
  JSON_BODY_LIMIT: "JSON_BODY_LIMIT",
  JWT_EXPIRES_IN: "JWT_EXPIRES_IN",
  JWT_SECRET: "JWT_SECRET",
  MUTATION_RATE_LIMIT_MAX: "MUTATION_RATE_LIMIT_MAX",
  MUTATION_RATE_LIMIT_WINDOW_MS: "MUTATION_RATE_LIMIT_WINDOW_MS",
  NGINX_PORT: "NGINX_PORT",
  NGINX_SWAGGER_ALLOW: "NGINX_SWAGGER_ALLOW",
  TRUST_PROXY: "TRUST_PROXY",
  WRONGWAY_LEVEL2_ESCALATION_ENABLED: "WRONGWAY_LEVEL2_ESCALATION_ENABLED",
  WRONGWAY_LEVEL2_MIN_CONFIDENCE: "WRONGWAY_LEVEL2_MIN_CONFIDENCE",
  WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT: "WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT",
});

const ENV_DEFAULTS = Object.freeze({
  AUTH_COOKIE_MAX_AGE_MS: 8 * 60 * 60 * 1000,
  AUTH_COOKIE_NAME: "lidar_dashboard_access",
  AUTH_COOKIE_SAMESITE: "lax",
  AUTH_COOKIE_SECURE: false,
  AUTH_CSRF_COOKIE_NAME: "lidar_dashboard_csrf",
  AUTH_RATE_LIMIT_MAX: 20,
  AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
  CONTROL_BOARD_CONNECT_TIMEOUT_MS: 1000,
  CONTROL_BOARD_DRY_RUN: true,
  CONTROL_BOARD_HEARTBEAT_INTERVAL_MS: 5000,
  CONTROL_BOARD_HOST: "",
  CONTROL_BOARD_LIVE_APPROVED: false,
  CONTROL_BOARD_PORT: 0,
  CONTROL_BOARD_RESPONSE_TIMEOUT_MS: 1000,
  CONTROL_BOARD_RETRY_COUNT: 1,
  CONTROL_BOARD_TRANSPORT: "tcp",
  FRONTEND_PORT: 5173,
  JSON_BODY_LIMIT: "1mb",
  JWT_EXPIRES_IN: "8h",
  JWT_SECRET: "dev-only-change-me",
  MUTATION_RATE_LIMIT_MAX: 120,
  MUTATION_RATE_LIMIT_WINDOW_MS: 60_000,
  NGINX_PORT: 8080,
  NGINX_SWAGGER_ALLOW: "all",
  TRUST_PROXY: "loopback",
});

function envString(key, fallback = "") {
  const value = process.env[key];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function envBoolean(key, fallback = false) {
  const value = process.env[key];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function envNumber(key, fallback = null) {
  const value = process.env[key];
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function envInteger(key, fallback = 0, options = {}) {
  const number = envNumber(key, fallback);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.trunc(number);
  if (options.min !== undefined && integer < options.min) return options.min;
  if (options.max !== undefined && integer > options.max) return options.max;
  return integer;
}

function envList(key) {
  return envString(key, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envUrl(key, fallback) {
  return envString(key, fallback).replace(/\/+$/, "");
}

module.exports = {
  ENV_DEFAULTS,
  ENV_KEYS,
  envBoolean,
  envInteger,
  envList,
  envNumber,
  envString,
  envUrl,
};
