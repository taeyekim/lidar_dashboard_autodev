const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-readiness-report.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const riskAcceptanceTemplate = readProjectFile("docs/ops/field-risk-acceptance-template.md");

[
  "artifacts/field-readiness",
  "Field Readiness Report",
  "Docker daemon",
  "Nginx/API health",
  "DEVICE_INGEST_API_KEY",
  "CORS_ORIGINS",
  "AUTH_COOKIE_SAMESITE",
  "NGINX_SWAGGER_ALLOW",
  "NGINX_WRONGWAY_RATE_LIMIT",
  "NGINX_WRONGWAY_BURST",
  "NGINX_CONTENT_SECURITY_POLICY",
  "CONTROL_BOARD_LIVE_APPROVED",
  "CONTROL_BOARD_CONNECT_TIMEOUT_MS",
  "CONTROL_BOARD_RESPONSE_TIMEOUT_MS",
  "CONTROL_BOARD_RETRY_COUNT",
  "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS",
  "control-board live approval",
  "control-board TCP timing",
  "SameSite cookie setting",
  "CORS trusted origins",
  "Nginx wrong-way rate limit",
  "Nginx content security policy",
  "controlBoardSafetyStatus",
  "DRY_RUN_SAFE",
  "LIVE_TCP_READY",
  "LIVE_TCP_REVIEW",
  "gitleaks",
  "trivy",
  "zap-baseline.py",
  "missingExampleKeys",
  "requiredFieldValues",
  "envActionGroups",
  "buildEnvActionGroups",
  "fieldValueOwner",
  "fieldValuePriority",
  "Field Value Action Groups",
  "Field Value Action Items",
  "Auth/Security",
  "LiDAR Ingest",
  "Control-board TCP",
  "Nginx Delivery",
  "BLOCKING",
  "not-approved",
  "Required Field Values",
  "completionGate",
  "checkEvidenceCommand",
  "checkDoneWhen",
  "evidenceCommand",
  "doneWhen",
  "| Status | Severity | Check | Message | Next Action | Evidence Command | Done When |",
  "redacted",
  "missing-or-trusted-lan-exception-required",
  "Blocks live control-board TCP evidence",
  "Blocks live TCP timing acceptance",
  "Blocks live TCP ACK evidence",
  "Blocks live TCP retry policy acceptance",
  "Blocks live TCP heartbeat acceptance",
  "Blocks cookie topology acceptance",
  "Blocks browser/API exposure review",
  "Blocks Nginx delivery posture review",
  "Blocks Nginx security posture review",
  "expected lidar event rate",
  "final camera/lidar/media hosts",
  "docker compose config --quiet",
  "gitleaks detect --source . --redact",
  "The Nginx entrypoint returns a successful /api/health response.",
  "numericState",
  "Control-board TCP timing values are missing or invalid.",
].forEach((token) => assertIncludes(generator, token, "field readiness generator"));

[
  "field:readiness",
  "verify:field-readiness",
  "generate-field-readiness-report.js",
  "verify-field-readiness-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-readiness-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run field:readiness", "delivery runbook");
assertIncludes(runbook, "docs/ops/field-risk-acceptance-template.md", "delivery runbook");
assertIncludes(runbook, "artifacts/manual/field-risk-acceptance.md", "delivery runbook");
assertIncludes(checklist, "npm run field:readiness", "acceptance checklist");
assertIncludes(checklist, "docs/ops/field-risk-acceptance-template.md", "acceptance checklist");
assertIncludes(checklist, "artifacts/manual/field-risk-acceptance.md", "acceptance checklist");
assertIncludes(matrix, "npm run field:readiness", "delivery evidence matrix");

[
  "Field Risk Acceptance Evidence Template",
  "Security scanners",
  "Swagger exposure",
  "HTTPS cookie posture",
  "Runtime/hardware rehearsal",
  "Reviewer Decision",
].forEach((token) => assertIncludes(riskAcceptanceTemplate, token, "field risk acceptance template"));

console.log("field readiness contracts ok");
