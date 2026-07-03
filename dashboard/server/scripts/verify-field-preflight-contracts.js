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

const script = readProjectFile("scripts/field-preflight.ps1");
const fieldAcceptance = readProjectFile("scripts/field-acceptance.ps1");
const packageJson = readProjectFile("package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const envContracts = readProjectFile("dashboard/server/scripts/verify-env-contracts.js");
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const riskAcceptanceTemplate = readProjectFile("docs/ops/field-risk-acceptance-template.md");

[
  "BaseUrl",
  "Reviewer",
  "SiteName",
  "AllowLiveTcp",
  "RequireDeviceKey",
  "RequireHttpsCookies",
  "RequireSwaggerAllowlist",
  "Strict",
  "JWT_SECRET",
  "SEED_ADMIN_PASSWORD",
  "change-this-",
  "DEVICE_INGEST_API_KEY",
  "CONTROL_BOARD_DRY_RUN",
  "CONTROL_BOARD_LIVE_APPROVED",
  "CONTROL_BOARD_HOST",
  "CONTROL_BOARD_PORT",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "CORS_ORIGINS",
  "CORS trusted origins",
  "NGINX_SWAGGER_ALLOW",
  "NGINX_WRONGWAY_RATE_LIMIT",
  "NGINX_WRONGWAY_BURST",
  "NGINX_CONTENT_SECURITY_POLICY",
  "Nginx wrong-way rate limit",
  "Nginx content security policy",
  "trusted-LAN exception",
  "Get-GitState",
  "git = Get-GitState",
  "Git pushed to origin/dev",
  "manifest.json",
  "manifest.md",
  "PASS_WITH_SKIPS",
  "field preflight status",
].forEach((token) => assertIncludes(script, token, "field preflight script"));

[
  "scripts/field-preflight.ps1",
  "RequireDeviceKey",
  "RequireHttpsCookies",
  "RequireSwaggerAllowlist",
  "StrictPreflight",
  "00-field-preflight.log",
].forEach((token) => assertIncludes(fieldAcceptance, token, "field acceptance orchestrator"));

[
  "field:preflight",
  "verify:field-preflight",
  "verify-field-preflight-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assert(
  packageJson.indexOf("npm run verify:field-preflight") < packageJson.indexOf("npm run verify:field-acceptance"),
  "root smoke chain should run preflight contracts before field acceptance contracts",
);

[
  "npm.cmd run field:preflight",
  "scripts/field-preflight.ps1",
  "-RequireDeviceKey",
  "-RequireHttpsCookies",
  "-RequireSwaggerAllowlist",
  "-StrictPreflight",
  "artifacts/field-preflight",
  "docs/ops/field-risk-acceptance-template.md",
  "artifacts/manual/field-risk-acceptance.md",
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "field preflight",
  "JWT_SECRET",
  "CORS_ORIGINS",
  "NGINX_SWAGGER_ALLOW",
  "NGINX_WRONGWAY_RATE_LIMIT",
  "NGINX_CONTENT_SECURITY_POLICY",
  "DEVICE_INGEST_API_KEY",
  "docs/ops/field-risk-acceptance-template.md",
  "artifacts/manual/field-risk-acceptance.md",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

[
  "Field Risk Acceptance Evidence Template",
  "artifacts/manual/field-risk-acceptance.md",
  "DEVICE_INGEST_API_KEY",
  "trusted-LAN exception",
  "Security scanners",
  "Swagger exposure",
  "HTTPS cookie posture",
  "Control-board live TCP",
  "Control-board live approval",
  "Runtime/hardware rehearsal",
  "Compensating Control",
  "Expiry Or Recheck",
  "Reviewer Decision",
].forEach((token) => assertIncludes(riskAcceptanceTemplate, token, "field risk acceptance template"));

assertIncludes(envContracts, "field:preflight", "environment contract verifier");
assertIncludes(envContracts, "scripts/field-preflight.ps1", "environment contract verifier");
assertIncludes(deliveryEvidence, "fieldPreflightEvidence", "delivery evidence generator");
assertIncludes(deliveryEvidence, "artifacts/field-preflight", "delivery evidence generator");
assertIncludes(deliveryEvidence, "Field Preflight Evidence", "delivery evidence generator");

console.log("field preflight contracts ok");
