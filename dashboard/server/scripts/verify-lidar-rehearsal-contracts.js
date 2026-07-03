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

const script = readProjectFile("scripts/lidar-ingest-rehearsal.ps1");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");

[
  "BaseUrl",
  "DeviceKey",
  "OutputRoot",
  "Reviewer",
  "SiteName",
  "UserId",
  "Password",
  "SEED_ADMIN_USER_ID",
  "SEED_ADMIN_PASSWORD",
  "/api/auth/login",
  "CookieJar",
  "operator cookie auth login",
  "DEVICE_INGEST_API_KEY",
  "/api/wrongway",
  "normal-driving",
  "wrong-way-level-1",
  "wrong-way-level-2",
  "situation-ended",
  "vehicleTrackCreated",
  "eventReused",
  "resolvedEventIds",
  "/api/events/summary",
  "wrongwayVehicles",
  "wrongwayRate",
  "Assert-ControlCommandType",
  "Assert-EventDetailCommandType",
  "STAGE_1_ON",
  "STAGE_2_ON",
  "STAGE_2_RETURN",
  "packetHex",
  "manifest.json",
  "manifest.md",
  "FIELD_REHEARSAL_PASS",
  "hostName",
  "Get-GitState",
  "git = Get-GitState",
  "Git pushed to origin/dev",
  "deviceKeyUsed",
  "Test-PlaceholderFieldText",
  "field reviewer metadata",
  "field site metadata",
  "Reviewer is missing or placeholder",
  "SiteName is missing or placeholder",
  "LiDAR ingest field rehearsal completed with REVIEW items",
  "lidar ingest field rehearsal ok",
].forEach((token) => assertIncludes(script, token, "lidar ingest rehearsal script"));

[
  "scripts/lidar-ingest-rehearsal.ps1",
  "normal-driving",
  "wrong-way-level-1",
  "wrong-way-level-2",
  "situation-ended",
  "manifest.json",
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "scripts/lidar-ingest-rehearsal.ps1",
  "Lidar Ingest",
  "representative JSON",
].forEach((token) => assertIncludes(matrix, token, "delivery evidence matrix"));

[
  "scripts/lidar-ingest-rehearsal.ps1",
  "unique vehicle track",
  "wrong-way-level-1",
  "wrong-way-level-2",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(packageJson, "verify:lidar-rehearsal", "package scripts");
assertIncludes(packageJson, "verify-lidar-rehearsal-contracts.js", "package scripts");
assertIncludes(serverPackageJson, "verify-lidar-rehearsal-contracts.js", "server package verify chain");

console.log("lidar rehearsal contracts ok");
