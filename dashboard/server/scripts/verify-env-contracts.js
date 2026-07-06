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
const deliveryEvidenceMatrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const runtimeSmoke = readProjectFile("scripts/runtime-smoke.ps1");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const evidenceScript = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const securityEvidenceScript = readProjectFile("dashboard/server/scripts/generate-security-evidence.js");
const runtimeEvidenceScript = readProjectFile("dashboard/server/scripts/generate-runtime-evidence.js");
const controlBoardSimulator = readProjectFile("dashboard/server/scripts/control-board-tcp-simulator.js");
const securityScanScript = readProjectFile("scripts/security-scan.ps1");
const fieldPreflightScript = readProjectFile("scripts/field-preflight.ps1");
const fieldAcceptanceScript = readProjectFile("scripts/field-acceptance.ps1");
const env = parseEnvExample(envExample);

["猷", "釉", "濡", "湲", "媛", "留", "?ㅽ", "?꾩", "?대", "?곕"].forEach((token) => {
  assert(!envExample.includes(token), `.env.example contains mojibake token: ${token}`);
});

const requiredEnvKeys = [
  "FRONTEND_PORT",
  "DASHBOARD_PORT",
  "DETECTOR_PORT",
  "NGINX_PORT",
  "PUBLIC_HOST",
  "FIELD_BASE_URL",
  "FIELD_REVIEWER",
  "FIELD_SITE_NAME",
  "FIELD_REHEARSAL_UNAVAILABLE_REASON",
  "FIELD_REHEARSAL_REPLACEMENT_OWNER",
  "FIELD_REHEARSAL_TARGET_RECHECK_DATE",
  "FIELD_REHEARSAL_APPROVAL_NOTE",
  "VITE_API_BASE_URL",
  "VITE_WS_BASE_URL",
  "VITE_DETECTOR_BASE_URL",
  "VITE_AUTH_CSRF_COOKIE_NAME",
  "CORS_ORIGINS",
  "JSON_BODY_LIMIT",
  "TRUST_PROXY",
  "AUTH_RATE_LIMIT_WINDOW_MS",
  "AUTH_RATE_LIMIT_MAX",
  "MUTATION_RATE_LIMIT_WINDOW_MS",
  "MUTATION_RATE_LIMIT_MAX",
  "DEVICE_INGEST_API_KEY",
  "WRONGWAY_LEVEL2_ESCALATION_ENABLED",
  "WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT",
  "WRONGWAY_LEVEL2_MIN_CONFIDENCE",
  "COMPOSE_BACKEND_HOST",
  "COMPOSE_DETECTOR_HOST",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "DATABASE_URL",
  "CONTROL_BOARD_TRANSPORT",
  "CONTROL_BOARD_DRY_RUN",
  "CONTROL_BOARD_LIVE_APPROVED",
  "CONTROL_BOARD_HOST",
  "CONTROL_BOARD_PORT",
  "CONTROL_BOARD_CONNECT_TIMEOUT_MS",
  "CONTROL_BOARD_RESPONSE_TIMEOUT_MS",
  "CONTROL_BOARD_RETRY_COUNT",
  "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "AUTH_COOKIE_NAME",
  "AUTH_CSRF_COOKIE_NAME",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "AUTH_COOKIE_MAX_AGE_MS",
  "SEED_ADMIN_USER_ID",
  "SEED_ADMIN_PASSWORD",
  "SEED_ADMIN_NAME",
  "NGINX_CLIENT_MAX_BODY_SIZE",
  "NGINX_PROXY_CONNECT_TIMEOUT",
  "NGINX_PROXY_SEND_TIMEOUT",
  "NGINX_PROXY_READ_TIMEOUT",
  "NGINX_CONTENT_SECURITY_POLICY",
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
assert(env.get("FIELD_BASE_URL") === "http://localhost:8080", "FIELD_BASE_URL must default to the local Nginx entrypoint");
assert(env.get("FIELD_REVIEWER") === "", "FIELD_REVIEWER must stay blank in .env.example");
assert(env.get("FIELD_SITE_NAME") === "", "FIELD_SITE_NAME must stay blank in .env.example");
assert(env.get("FIELD_REHEARSAL_REPLACEMENT_OWNER") === "field-owner", "FIELD_REHEARSAL_REPLACEMENT_OWNER must be an obvious placeholder");
assert(env.get("FIELD_REHEARSAL_TARGET_RECHECK_DATE") === "2026-08-01", "FIELD_REHEARSAL_TARGET_RECHECK_DATE must be an ISO placeholder date");
assert(env.get("WRONGWAY_LEVEL2_ESCALATION_ENABLED") === "false", "WRONGWAY_LEVEL2_ESCALATION_ENABLED must default to false");
assert(env.get("WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT") === "", "WRONGWAY_LEVEL2_MIN_CONSECUTIVE_COUNT must stay blank in .env.example");
assert(env.get("WRONGWAY_LEVEL2_MIN_CONFIDENCE") === "", "WRONGWAY_LEVEL2_MIN_CONFIDENCE must stay blank in .env.example");
assert(env.get("CONTROL_BOARD_DRY_RUN") === "true", "CONTROL_BOARD_DRY_RUN must default to true");
assert(env.get("CONTROL_BOARD_LIVE_APPROVED") === "false", "CONTROL_BOARD_LIVE_APPROVED must default to false");
assert(env.get("CONTROL_BOARD_HOST") === "", "CONTROL_BOARD_HOST must stay blank in .env.example");
assert(env.get("CONTROL_BOARD_PORT") === "", "CONTROL_BOARD_PORT must stay blank in .env.example");
assert(env.get("NGINX_SWAGGER_ALLOW") !== "all", "NGINX_SWAGGER_ALLOW must not default to all in .env.example");
assert(
  env.get("NGINX_SWAGGER_ALLOW") === "127.0.0.1/32",
  "NGINX_SWAGGER_ALLOW must default to a local-only review CIDR in .env.example",
);
assert(
  env.get("JWT_SECRET") === "change-this-to-a-long-random-secret",
  "JWT_SECRET must be an obvious placeholder in .env.example",
);
assert(
  env.get("SEED_ADMIN_PASSWORD") === "change-this-admin-password",
  "SEED_ADMIN_PASSWORD must be an obvious placeholder in .env.example",
);
assert(!envExample.includes("SEED_ADMIN_PASSWORD=admin1234!"), ".env.example must not expose the old example seed password");
assert(
  !envExample.includes("replace_with_control_board_ip") && !envExample.includes("replace_with_control_board_port"),
  ".env.example must not contain field-only placeholder values that look configured",
);

[
  [deliveryRunbook, "CONTROL_BOARD_DRY_RUN=true", "delivery runbook"],
  [deliveryRunbook, "CONTROL_BOARD_LIVE_APPROVED=false", "delivery runbook"],
  [deliveryRunbook, "JWT_SECRET", "delivery runbook"],
  [deliveryRunbook, "X-Device-Key", "delivery runbook"],
  [deliveryRunbook, "docs/ops/field-risk-acceptance-template.md", "delivery runbook"],
  [deliveryRunbook, "artifacts/manual/field-risk-acceptance.md", "delivery runbook"],
  [securityChecklist, "CONTROL_BOARD_DRY_RUN=true", "security checklist"],
  [securityChecklist, "CONTROL_BOARD_LIVE_APPROVED=false", "security checklist"],
  [securityChecklist, "JWT_SECRET", "security checklist"],
  [securityChecklist, "DEVICE_INGEST_API_KEY", "security checklist"],
  [securityChecklist, "docs/ops/field-risk-acceptance-template.md", "security checklist"],
  [securityChecklist, "artifacts/manual/field-risk-acceptance.md", "security checklist"],
  [acceptanceChecklist, "CONTROL_BOARD_DRY_RUN=true", "acceptance checklist"],
  [acceptanceChecklist, "CONTROL_BOARD_LIVE_APPROVED=false", "acceptance checklist"],
  [acceptanceChecklist, "JWT_SECRET", "acceptance checklist"],
  [acceptanceChecklist, "DEVICE_INGEST_API_KEY", "acceptance checklist"],
  [acceptanceChecklist, "docs/ops/field-risk-acceptance-template.md", "acceptance checklist"],
  [acceptanceChecklist, "artifacts/manual/field-risk-acceptance.md", "acceptance checklist"],
  [acceptanceChecklist, "NGINX_WRONGWAY_RATE_LIMIT", "acceptance checklist"],
  [acceptanceChecklist, "NGINX_SWAGGER_ALLOW", "acceptance checklist"],
  [acceptanceChecklist, "HttpOnly", "acceptance checklist"],
  [acceptanceChecklist, "controlCommands", "acceptance checklist"],
  [acceptanceChecklist, "packetHex", "acceptance checklist"],
  [acceptanceChecklist, "vehiclesPassed", "acceptance checklist"],
  [acceptanceChecklist, "X-Device-Key", "acceptance checklist"],
  [acceptanceChecklist, "/api/ingest/control-board/tcp/test", "acceptance checklist"],
  [acceptanceChecklist, "scripts/security-scan.ps1", "acceptance checklist"],
  [acceptanceChecklist, "--require-scanners", "acceptance checklist"],
  [acceptanceChecklist, "-RequireScanners", "acceptance checklist"],
  [acceptanceChecklist, "npm run verify:statistics-metrics", "acceptance checklist"],
  [acceptanceChecklist, "unique track counts", "acceptance checklist"],
  [acceptanceChecklist, "average TCP ACK response vectors", "acceptance checklist"],
  [acceptanceChecklist, "runtime:evidence", "acceptance checklist"],
  [acceptanceChecklist, "security:evidence", "acceptance checklist"],
  [acceptanceChecklist, "delivery:evidence", "acceptance checklist"],
  [acceptanceChecklist, "scripts/db-field-rehearsal.ps1", "acceptance checklist"],
  [acceptanceChecklist, "delivery-evidence-matrix.md", "acceptance checklist"],
  [acceptanceChecklist, "GET /api/statistics/traffic?range=daily", "acceptance checklist"],
  [acceptanceChecklist, "GET /api/control-board/status", "acceptance checklist"],
  [acceptanceChecklist, "responseSampleCount", "acceptance checklist"],
  [deliveryRunbook, "runtime:evidence", "delivery runbook"],
  [deliveryRunbook, "--use-existing-stack", "delivery runbook"],
  [deliveryRunbook, "--base-url", "delivery runbook"],
  [deliveryRunbook, "scripts/db-field-rehearsal.ps1", "delivery runbook"],
  [deliveryRunbook, "curl -c field-cookies.txt -b field-cookies.txt", "delivery runbook"],
  [deliveryRunbook, "curl -b field-cookies.txt http://localhost:8080/api/database/health", "delivery runbook"],
  [deliveryRunbook, "curl -b field-cookies.txt http://localhost:8080/api/sites", "delivery runbook"],
  [deliveryRunbook, "curl -b field-cookies.txt http://localhost:8080/api/zones", "delivery runbook"],
  [deliveryRunbook, "curl -b field-cookies.txt http://localhost:8080/api/devices", "delivery runbook"],
  [deliveryRunbook, "npm run verify:statistics-metrics", "delivery runbook"],
  [deliveryRunbook, "security:evidence", "delivery runbook"],
  [deliveryRunbook, "--require-scanners", "delivery runbook"],
  [deliveryRunbook, "-RequireScanners", "delivery runbook"],
  [deliveryRunbook, "delivery:evidence", "delivery runbook"],
  [deliveryRunbook, "delivery-evidence-matrix.md", "delivery runbook"],
  [deliveryRunbook, "/api/ingest/control-board/tcp/test", "delivery runbook"],
  [deliveryRunbook, "GET /api/statistics/traffic?range=daily", "delivery runbook"],
  [deliveryRunbook, "GET /api/control-board/status", "delivery runbook"],
  [deliveryRunbook, "responseDurationMs", "delivery runbook"],
  [deliveryEvidenceMatrix, "Control Board TCP", "delivery evidence matrix"],
  [deliveryEvidenceMatrix, "Authentication", "delivery evidence matrix"],
  [deliveryEvidenceMatrix, "Nginx And Runtime", "delivery evidence matrix"],
  [deliveryEvidenceMatrix, "Security", "delivery evidence matrix"],
  [deliveryEvidenceMatrix, "Delivery Evidence", "delivery evidence matrix"],
  [securityChecklist, "security:evidence", "security checklist"],
  [securityChecklist, "--require-scanners", "security checklist"],
  [securityChecklist, "-RequireScanners", "security checklist"],
  [packageJson, "runtime:evidence", "package scripts"],
  [packageJson, "security:evidence", "package scripts"],
  [packageJson, "field:preflight", "package scripts"],
  [packageJson, "field:acceptance", "package scripts"],
  [packageJson, "delivery:evidence", "package scripts"],
  [evidenceScript, "artifacts/delivery", "delivery evidence script"],
  [evidenceScript, "manifest.md", "delivery evidence script"],
  [evidenceScript, "manifest.json", "delivery evidence script"],
  [evidenceScript, "buildGitState", "delivery evidence script"],
  [evidenceScript, "Git upstream", "delivery evidence script"],
  [evidenceScript, "Git upstream commit", "delivery evidence script"],
  [evidenceScript, "Git pushed to origin/dev", "delivery evidence script"],
  [evidenceScript, "pushed: Boolean", "delivery evidence script"],
  [evidenceScript, "Field Verification Still Required", "delivery evidence script"],
  [securityEvidenceScript, "artifacts/security", "security evidence script"],
  [securityEvidenceScript, "manifest.md", "security evidence script"],
  [securityEvidenceScript, "manifest.json", "security evidence script"],
  [securityEvidenceScript, "Tool Inventory", "security evidence script"],
  [securityEvidenceScript, "Scanner Closeout Matrix", "security evidence script"],
  [securityEvidenceScript, "SECURITY_EVIDENCE_OPERATOR", "security evidence script"],
  [securityEvidenceScript, "toolInventory", "security evidence script"],
  [securityEvidenceScript, "scannerCloseout", "security evidence script"],
  [securityEvidenceScript, "scannerCloseoutDefinitions", "security evidence script"],
  [securityEvidenceScript, "closeoutStatus", "security evidence script"],
  [securityEvidenceScript, "EVIDENCE_READY", "security evidence script"],
  [securityEvidenceScript, "closeoutWhenSkipped", "security evidence script"],
  [securityEvidenceScript, "installHint", "security evidence script"],
  [securityEvidenceScript, "hostname", "security evidence script"],
  [securityEvidenceScript, "platform", "security evidence script"],
  [securityEvidenceScript, "gitleaks", "security evidence script"],
  [securityEvidenceScript, "trivy", "security evidence script"],
  [securityEvidenceScript, "OWASP ZAP", "security evidence script"],
  [securityEvidenceScript, "requireScanners", "security evidence script"],
  [securityEvidenceScript, "--require-scanners", "security evidence script"],
  [securityEvidenceScript, "securityDisposition", "security evidence script"],
  [securityEvidenceScript, "dispositionSummary", "security evidence script"],
  [securityEvidenceScript, "strictAcceptanceBlocked", "security evidence script"],
  [securityEvidenceScript, "requiredFailures", "security evidence script"],
  [securityEvidenceScript, "item.disposition?.code === \"BLOCKING\"", "security evidence script"],
  [securityEvidenceScript, "item.disposition?.code === \"DELIVERY_FIX\"", "security evidence script"],
  [securityEvidenceScript, "security evidence captured blocking or delivery-fix findings", "security evidence script"],
  [securityEvidenceScript, "labelEn", "security evidence script"],
  [securityEvidenceScript, "English Label", "security evidence script"],
  [securityEvidenceScript, "BLOCKING", "security evidence script"],
  [securityEvidenceScript, "DELIVERY_FIX", "security evidence script"],
  [securityEvidenceScript, "RISK_ACCEPTED", "security evidence script"],
  [securityEvidenceScript, "UNVERIFIED", "security evidence script"],
  [securityEvidenceScript, "Risk accepted", "security evidence script"],
  [securityEvidenceScript, "Delivery fix required", "security evidence script"],
  [securityEvidenceScript, "통과", "security evidence script"],
  [securityEvidenceScript, "차단", "security evidence script"],
  [securityEvidenceScript, "위험 수용", "security evidence script"],
  [securityEvidenceScript, "납품 전 수정", "security evidence script"],
  [securityEvidenceScript, "미검증", "security evidence script"],
  [securityScanScript, "RequireScanners", "security scan powershell script"],
  [fieldPreflightScript, "FIELD_BASE_URL", "field preflight script"],
  [fieldPreflightScript, "JWT_SECRET", "field preflight script"],
  [fieldPreflightScript, "DEVICE_INGEST_API_KEY", "field preflight script"],
  [fieldPreflightScript, "CONTROL_BOARD_DRY_RUN", "field preflight script"],
  [fieldPreflightScript, "CONTROL_BOARD_LIVE_APPROVED", "field preflight script"],
  [fieldPreflightScript, "NGINX_SWAGGER_ALLOW", "field preflight script"],
  [fieldPreflightScript, "AUTH_COOKIE_SECURE", "field preflight script"],
  [fieldAcceptanceScript, "scripts/field-acceptance.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "scripts/field-preflight.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "scripts/runtime-smoke.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "scripts/db-field-rehearsal.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "scripts/lidar-ingest-rehearsal.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "scripts/control-board-field-rehearsal.ps1", "field acceptance script"],
  [fieldAcceptanceScript, "security:evidence", "field acceptance script"],
  [fieldAcceptanceScript, "delivery:evidence", "field acceptance script"],
  [fieldAcceptanceScript, "artifacts/field-acceptance", "field acceptance script"],
  [runtimeEvidenceScript, "artifacts/runtime", "runtime evidence script"],
  [runtimeEvidenceScript, "manifest.md", "runtime evidence script"],
  [runtimeEvidenceScript, "manifest.json", "runtime evidence script"],
  [runtimeEvidenceScript, "docker compose config", "runtime evidence script"],
  [runtimeEvidenceScript, "runtime-smoke.ps1", "runtime evidence script"],
  [runtimeEvidenceScript, "--use-existing-stack", "runtime evidence script"],
  [runtimeEvidenceScript, "--base-url=", "runtime evidence script"],
  [runtimeEvidenceScript, "baseUrl", "runtime evidence script"],
  [runtimeEvidenceScript, "Environment Readiness", "runtime evidence script"],
  [runtimeEvidenceScript, "exampleKeys", "runtime evidence script"],
  [runtimeEvidenceScript, "presentKeys", "runtime evidence script"],
  [runtimeEvidenceScript, "missingKeys", "runtime evidence script"],
  [runtimeEvidenceScript, "Values are intentionally omitted.", "runtime evidence script"],
  [runtimeSmoke, "FIELD_BASE_URL", "runtime smoke script"],
  [runtimeSmoke, "DEVICE_INGEST_API_KEY", "runtime smoke script"],
  [runtimeSmoke, "X-Device-Key", "runtime smoke script"],
  [runtimeSmoke, "/api/ingest/control-board/tcp/test", "runtime smoke script"],
  [runtimeSmoke, "TCP_FRAME_TEST", "runtime smoke script"],
  [runtimeSmoke, "Assert-NumberProperty", "runtime smoke script"],
  [runtimeSmoke, "Assert-PropertyExists", "runtime smoke script"],
  [runtimeSmoke, "controlCommands", "runtime smoke script"],
  [runtimeSmoke, "packetHex", "runtime smoke script"],
  [runtimeSmoke, "rawPayload", "runtime smoke script"],
  [runtimeSmoke, "vehiclesPassed", "runtime smoke script"],
  [runtimeSmoke, "wrongWayEvents", "runtime smoke script"],
  [runtimeSmoke, "wrongwayRate", "runtime smoke script"],
  [runtimeSmoke, "/api/statistics/traffic?range=daily", "runtime smoke script"],
  [runtimeSmoke, "normalVehicles", "runtime smoke script"],
  [runtimeSmoke, "wrongwayVehicles", "runtime smoke script"],
  [runtimeSmoke, "averageResponseMs", "runtime smoke script"],
  [runtimeSmoke, "responseSampleCount", "runtime smoke script"],
  [runtimeSmoke, "liveTcpReady", "runtime smoke script"],
  [runtimeSmoke, "liveApproved", "runtime smoke script"],
  [runtimeSmoke, "safetyStatus", "runtime smoke script"],
  [runtimeSmoke, "DRY_RUN_SAFE", "runtime smoke script"],
  [runtimeSmoke, "LIVE_TCP_READY", "runtime smoke script"],
  [runtimeSmoke, "LIVE_TCP_REVIEW", "runtime smoke script"],
  [runtimeSmoke, "responseDurationMs", "runtime smoke script"],
  [runtimeSmoke, "Assert-HttpStatus", "runtime smoke script"],
  [runtimeSmoke, "X-Content-Type-Options", "runtime smoke script"],
  [runtimeSmoke, "X-Frame-Options", "runtime smoke script"],
  [runtimeSmoke, "Content-Security-Policy", "runtime smoke script"],
  [runtimeSmoke, "unauthenticated mutation smoke", "runtime smoke script"],
  [runtimeSmoke, "non-json mutation smoke", "runtime smoke script"],
  [runtimeSmoke, "missing X-Device-Key wrongway smoke", "runtime smoke script"],
  [runtimeSmoke, "missing X-Device-Key lidar ingest smoke", "runtime smoke script"],
  [runtimeSmoke, "missing X-Device-Key control-board ingest smoke", "runtime smoke script"],
  [runtimeSmoke, "/api/ingest/lidar", "runtime smoke script"],
  [runtimeSmoke, "/api/ingest/control-board", "runtime smoke script"],
  [controlBoardSimulator, "createSimulator", "control-board TCP simulator"],
  [controlBoardSimulator, "calculateCrc8Smbus", "control-board TCP simulator"],
  [controlBoardSimulator, "TYPE_RESPONSE_LOG", "control-board TCP simulator"],
  [controlBoardSimulator, "10-byte command frame", "control-board TCP simulator"],
  [packageJson, "verify:control-board-tcp-simulator", "root package scripts"],
  [serverPackageJson, "verify-control-board-tcp-simulator.js", "server verify chain"],
].forEach(([content, token, label]) => {
  assert(content.includes(token), `${label} is missing ${token}`);
});

console.log("environment contracts ok");
