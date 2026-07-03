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

[
  "BaseUrl",
  "DeviceKey",
  "OutputRoot",
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
  "manifest.json",
  "manifest.md",
  "deviceKeyUsed",
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

console.log("lidar rehearsal contracts ok");
