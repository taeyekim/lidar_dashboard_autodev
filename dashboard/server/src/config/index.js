const path = require("path");
const fs = require("fs");

// 환경변수는 프로젝트 루트 .env만 기준으로 사용한다.
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env"), override: true });

const serverRoot = path.resolve(__dirname, "../..");

const configPath = fs.existsSync(path.join(serverRoot, "config.json"))
  ? path.join(serverRoot, "config.json")
  : path.join(serverRoot, "config.example.json");

const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const dashboardHost = process.env.DASHBOARD_HOST || rawConfig.dashboardIP || "localhost";
const port = Number(process.env.DASHBOARD_PORT || rawConfig.serverPort || 5000);
const detectorHost = process.env.DETECTOR_HOST || dashboardHost;
const detectorPort = Number(process.env.DETECTOR_PORT || rawConfig.detectorPort || 8888);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const nginxPort = Number(process.env.NGINX_PORT || 8080);

const detectorBaseUrl = (
  process.env.DETECTOR_BASE_URL || `http://${detectorHost}:${detectorPort}`
).replace(/\/+$/, "");

const dashboardBaseUrl = (
  process.env.DASHBOARD_BASE_URL || `http://${dashboardHost}:${port}`
).replace(/\/+$/, "");

const distPath = path.join(serverRoot, "../dashboard-web/dist");

function listFromEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.trunc(number);
}

module.exports = {
  config: {
    dashboardHost,
    port,
    detectorHost,
    detectorPort,
    frontendPort,
    nginxPort,
    detectorBaseUrl,
    dashboardBaseUrl,
    distPath,
    corsOrigins: listFromEnv(process.env.CORS_ORIGINS).length > 0
      ? listFromEnv(process.env.CORS_ORIGINS)
      : [
          dashboardBaseUrl,
          `http://localhost:${frontendPort}`,
          `http://127.0.0.1:${frontendPort}`,
          `http://localhost:${nginxPort}`,
          `http://127.0.0.1:${nginxPort}`,
        ],
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
    trustProxy: process.env.TRUST_PROXY || "loopback",
    mutationRateLimitWindowMs: toPositiveInteger(process.env.MUTATION_RATE_LIMIT_WINDOW_MS, 60_000),
    mutationRateLimitMax: toPositiveInteger(process.env.MUTATION_RATE_LIMIT_MAX, 120),
    authRateLimitWindowMs: toPositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000),
    authRateLimitMax: toPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },
};
