const fs = require("fs");
const path = require("path");
const {
  corsOriginState,
  fieldStringState,
  fieldValuePriority,
  isPlaceholderFieldValue,
  metadataReviewItems,
  numericState,
  valueState,
} = require("./generate-field-readiness-report");

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
  "buildGitState",
  "Git pushed to origin/dev",
  "Working tree clean",
  "isPlaceholderFieldText",
  "metadataReviewItems",
  "field readiness metadata",
  "Metadata review",
  "Rerun npm.cmd run field:readiness with concrete --generated-by=<field-reviewer> and --site-name=<delivery-site> values.",
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
  "isPlaceholderFieldValue",
  "fieldStringState",
  "NGINX_SWAGGER_ALLOW is open, missing, or placeholder.",
  "Nginx wrong-way rate limit or burst is missing or placeholder.",
  "NGINX_CONTENT_SECURITY_POLICY is missing or placeholder.",
  "DEVICE_INGEST_API_KEY is not configured or is placeholder.",
  "Control-board TCP timing values are missing or invalid.",
  "hostState === \"configured\" && portState === \"configured\" && tcpTimingReady",
  "LIVE_TCP host, port, approval, and timing values are configured.",
  "live TCP host, port, approval, or timing values are incomplete.",
].forEach((token) => assertIncludes(generator, token, "field readiness generator"));

assert(isPlaceholderFieldValue("TBD") === true, "TBD should be treated as a placeholder field value");
assert(isPlaceholderFieldValue("N/A") === true, "N/A should be treated as a placeholder field value");
assert(fieldStringState("pending") === "placeholder", "pending field values must remain placeholder");
assert(fieldStringState("10.10.0.12") === "configured", "real-looking host values should remain configured");
assert(valueState("change-this-to-a-long-random-secret", "change-this-to-a-long-random-secret") === "placeholder", "known example secret should remain placeholder");
assert(valueState("change-this-admin-password") === "placeholder", "seed password placeholder should remain placeholder");
assert(valueState("unknown") === "placeholder", "generic placeholder secret should remain placeholder");
assert(numericState("TBD") === "invalid", "placeholder TCP port/timing values must not be numeric configured");
assert(numericState("5020") === "configured", "numeric TCP port/timing values should be configured");
assert(corsOriginState("https://operator.example.local") === "trusted-only", "explicit CORS origin should be trusted-only");
assert(fieldValuePriority({ state: "placeholder" }) === "BLOCKING", "placeholder field values should be blocking");
assert(metadataReviewItems("field-reviewer", "field-site").length === 2, "placeholder readiness reviewer/site should require metadata review");
assert(metadataReviewItems("reviewer-a", "delivery-site").length === 0, "concrete readiness reviewer/site should not require metadata review");

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
