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

const script = readProjectFile("scripts/control-board-field-rehearsal.ps1");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");

[
  "BaseUrl",
  "Reviewer",
  "SiteName",
  "AllowLiveTcp",
  "CONTROL_BOARD_LIVE_APPROVED",
  "liveApproved",
  "SEED_ADMIN_USER_ID",
  "SEED_ADMIN_PASSWORD",
  "AUTH_CSRF_COOKIE_NAME",
  "/api/auth/login",
  "/api/control-board/status",
  'Invoke-CurlJson -Url "$BaseUrl/api/control-board/status" -CookieJar $cookieJar',
  "/api/control-board/commands/test",
  "STAGE_1_ON",
  "STAGE_2_ON",
  "STAGE_2_RETURN",
  "LIVE_TCP",
  "DRY_RUN",
  "liveTcpReady",
  "safetyStatus",
  "DRY_RUN_SAFE",
  "LIVE_TCP_READY",
  "LIVE_TCP_REVIEW",
  "packetHex",
  "Length -ne 20",
  "DRY_RUN_SKIPPED_SEND",
  "Assert-ControlBoardSafetyStatus",
  "Assert-CommandEvidence",
  "responseSampleCount",
  "averageResponseMs",
  "manifest.json",
  "manifest.md",
  "FIELD_REHEARSAL_PASS",
  "hostName",
  "Get-GitState",
  "git = Get-GitState",
  "Git pushed to origin/dev",
  "Test-PlaceholderFieldText",
  "field reviewer metadata",
  "field site metadata",
  "Reviewer is missing or placeholder",
  "SiteName is missing or placeholder",
  "Control-board field rehearsal completed with REVIEW items",
  "field hardware approval",
  "control-board field rehearsal ok",
].forEach((token) => assertIncludes(script, token, "control-board field rehearsal script"));

[
  "scripts/control-board-field-rehearsal.ps1",
  "-AllowLiveTcp",
  "STAGE_1_ON",
  "STAGE_2_ON",
  "STAGE_2_RETURN",
  "manifest.json",
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "scripts/control-board-field-rehearsal.ps1",
  "Control Board TCP",
  "Live integrated control-board TCP test",
].forEach((token) => assertIncludes(matrix, token, "delivery evidence matrix"));

[
  "scripts/control-board-field-rehearsal.ps1",
  "DRY_RUN",
  "LIVE_TCP",
  "hardware approval",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(packageJson, "verify:control-board-field-rehearsal", "package scripts");
assertIncludes(packageJson, "verify-control-board-field-rehearsal-contracts.js", "package scripts");
assertIncludes(serverPackageJson, "verify-control-board-field-rehearsal-contracts.js", "server package verify chain");

console.log("control-board field rehearsal contracts ok");
