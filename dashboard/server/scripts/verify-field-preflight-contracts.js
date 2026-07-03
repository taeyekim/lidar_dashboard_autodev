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
  "DEVICE_INGEST_API_KEY",
  "CONTROL_BOARD_DRY_RUN",
  "CONTROL_BOARD_HOST",
  "CONTROL_BOARD_PORT",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "NGINX_SWAGGER_ALLOW",
  "trusted-LAN exception",
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
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "field preflight",
  "JWT_SECRET",
  "NGINX_SWAGGER_ALLOW",
  "DEVICE_INGEST_API_KEY",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(envContracts, "field:preflight", "environment contract verifier");
assertIncludes(envContracts, "scripts/field-preflight.ps1", "environment contract verifier");
assertIncludes(deliveryEvidence, "fieldPreflightEvidence", "delivery evidence generator");
assertIncludes(deliveryEvidence, "artifacts/field-preflight", "delivery evidence generator");
assertIncludes(deliveryEvidence, "Field Preflight Evidence", "delivery evidence generator");

console.log("field preflight contracts ok");
