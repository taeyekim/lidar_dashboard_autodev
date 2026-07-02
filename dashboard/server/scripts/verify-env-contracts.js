const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function parseEnvExample(content) {
  const values = new Map();
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) return;
    values.set(trimmed.slice(0, separatorIndex), trimmed.slice(separatorIndex + 1));
  });
  return values;
}

const envExample = readProjectFile(".env.example");
const dockerCompose = readProjectFile("docker-compose.yml");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const securityChecklist = readProjectFile("docs/ops/security-scan-checklist.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");
const env = parseEnvExample(envExample);

const requiredEnvKeys = [
  "FRONTEND_PORT",
  "DASHBOARD_PORT",
  "DETECTOR_PORT",
  "NGINX_PORT",
  "PUBLIC_HOST",
  "VITE_API_BASE_URL",
  "VITE_WS_BASE_URL",
  "VITE_DETECTOR_BASE_URL",
  "CORS_ORIGINS",
  "JSON_BODY_LIMIT",
  "TRUST_PROXY",
  "AUTH_RATE_LIMIT_WINDOW_MS",
  "AUTH_RATE_LIMIT_MAX",
  "MUTATION_RATE_LIMIT_WINDOW_MS",
  "MUTATION_RATE_LIMIT_MAX",
  "DEVICE_INGEST_API_KEY",
  "COMPOSE_BACKEND_HOST",
  "COMPOSE_DETECTOR_HOST",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "DATABASE_URL",
  "CONTROL_BOARD_TRANSPORT",
  "CONTROL_BOARD_DRY_RUN",
  "CONTROL_BOARD_HOST",
  "CONTROL_BOARD_PORT",
  "CONTROL_BOARD_CONNECT_TIMEOUT_MS",
  "CONTROL_BOARD_RESPONSE_TIMEOUT_MS",
  "CONTROL_BOARD_RETRY_COUNT",
  "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "SEED_ADMIN_USER_ID",
  "SEED_ADMIN_PASSWORD",
  "SEED_ADMIN_NAME",
  "NGINX_CLIENT_MAX_BODY_SIZE",
  "NGINX_PROXY_CONNECT_TIMEOUT",
  "NGINX_PROXY_SEND_TIMEOUT",
  "NGINX_PROXY_READ_TIMEOUT",
  "NGINX_WRONGWAY_RATE_LIMIT",
  "NGINX_WRONGWAY_BURST",
  "NGINX_SWAGGER_ALLOW",
];

requiredEnvKeys.forEach((key) => {
  assert(env.has(key), `.env.example is missing ${key}`);
});

const composeVariables = new Set();
for (const match of dockerCompose.matchAll(/\$\{([A-Z0-9_]+)/g)) {
  composeVariables.add(match[1]);
}
composeVariables.forEach((key) => {
  assert(env.has(key), `docker-compose.yml references ${key}, but .env.example does not define it`);
});

assert(env.get("CONTROL_BOARD_TRANSPORT") === "tcp", "CONTROL_BOARD_TRANSPORT must default to tcp");
assert(env.get("CONTROL_BOARD_DRY_RUN") === "true", "CONTROL_BOARD_DRY_RUN must default to true");
assert(env.get("CONTROL_BOARD_HOST") === "", "CONTROL_BOARD_HOST must stay blank in .env.example");
assert(env.get("CONTROL_BOARD_PORT") === "", "CONTROL_BOARD_PORT must stay blank in .env.example");
assert(
  env.get("JWT_SECRET") === "change-this-to-a-long-random-secret",
  "JWT_SECRET must be an obvious placeholder in .env.example",
);
assert(
  !envExample.includes("replace_with_control_board_ip") && !envExample.includes("replace_with_control_board_port"),
  ".env.example must not contain field-only placeholder values that look configured",
);

[
  [deliveryRunbook, "CONTROL_BOARD_DRY_RUN=true", "delivery runbook"],
  [deliveryRunbook, "JWT_SECRET", "delivery runbook"],
  [securityChecklist, "CONTROL_BOARD_DRY_RUN=true", "security checklist"],
  [securityChecklist, "JWT_SECRET", "security checklist"],
  [acceptanceChecklist, "CONTROL_BOARD_DRY_RUN=true", "acceptance checklist"],
  [acceptanceChecklist, "JWT_SECRET", "acceptance checklist"],
].forEach(([content, token, label]) => {
  assert(content.includes(token), `${label} is missing ${token}`);
});

console.log("environment contracts ok");
