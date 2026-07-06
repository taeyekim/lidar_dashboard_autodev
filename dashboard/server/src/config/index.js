const path = require("path");
const fs = require("fs");
const { ENV_DEFAULTS, ENV_KEYS, envInteger, envList, envString, envUrl } = require("./env");

// 환경변수는 프로젝트 루트 .env만 기준으로 사용한다.
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env"), override: true, quiet: true });

const serverRoot = path.resolve(__dirname, "../..");

const configPath = fs.existsSync(path.join(serverRoot, "config.json"))
  ? path.join(serverRoot, "config.json")
  : path.join(serverRoot, "config.example.json");

const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const dashboardHost = envString(ENV_KEYS.DASHBOARD_HOST, rawConfig.dashboardIP || "localhost");
const port = envInteger(ENV_KEYS.DASHBOARD_PORT, rawConfig.serverPort || 5000, { min: 1 });
const detectorHost = envString(ENV_KEYS.DETECTOR_HOST, dashboardHost);
const detectorPort = envInteger(ENV_KEYS.DETECTOR_PORT, rawConfig.detectorPort || 8888, { min: 1 });
const frontendPort = envInteger(ENV_KEYS.FRONTEND_PORT, ENV_DEFAULTS.FRONTEND_PORT, { min: 1 });
const nginxPort = envInteger(ENV_KEYS.NGINX_PORT, ENV_DEFAULTS.NGINX_PORT, { min: 1 });

const detectorBaseUrl = envUrl(ENV_KEYS.DETECTOR_BASE_URL, `http://${detectorHost}:${detectorPort}`);

const dashboardBaseUrl = envUrl(ENV_KEYS.DASHBOARD_BASE_URL, `http://${dashboardHost}:${port}`);

const distPath = path.join(serverRoot, "../dashboard-web/dist");

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
    corsOrigins: envList(ENV_KEYS.CORS_ORIGINS).length > 0
      ? envList(ENV_KEYS.CORS_ORIGINS)
      : [
          dashboardBaseUrl,
          `http://localhost:${frontendPort}`,
          `http://127.0.0.1:${frontendPort}`,
          `http://localhost:${nginxPort}`,
          `http://127.0.0.1:${nginxPort}`,
        ],
    jsonBodyLimit: envString(ENV_KEYS.JSON_BODY_LIMIT, ENV_DEFAULTS.JSON_BODY_LIMIT),
    trustProxy: envString(ENV_KEYS.TRUST_PROXY, ENV_DEFAULTS.TRUST_PROXY),
    mutationRateLimitWindowMs: envInteger(ENV_KEYS.MUTATION_RATE_LIMIT_WINDOW_MS, ENV_DEFAULTS.MUTATION_RATE_LIMIT_WINDOW_MS, { min: 1 }),
    mutationRateLimitMax: envInteger(ENV_KEYS.MUTATION_RATE_LIMIT_MAX, ENV_DEFAULTS.MUTATION_RATE_LIMIT_MAX, { min: 1 }),
    authRateLimitWindowMs: envInteger(ENV_KEYS.AUTH_RATE_LIMIT_WINDOW_MS, ENV_DEFAULTS.AUTH_RATE_LIMIT_WINDOW_MS, { min: 1 }),
    authRateLimitMax: envInteger(ENV_KEYS.AUTH_RATE_LIMIT_MAX, ENV_DEFAULTS.AUTH_RATE_LIMIT_MAX, { min: 1 }),
  },
};
