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

const script = readProjectFile("scripts/field-acceptance.ps1");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const envContracts = readProjectFile("dashboard/server/scripts/verify-env-contracts.js");

[
  "BaseUrl",
  "OutputRoot",
  "SkipRuntime",
  "SkipDb",
  "SkipLidar",
  "SkipControlBoard",
  "SkipSecurity",
  "RunDbDeploy",
  "RunDbSeed",
  "AllowLiveTcp",
  "IncludeContainerImages",
  "IncludeZap",
  "RequireScanners",
  "StartCompose",
  "StopCompose",
  "scripts/delivery-verify.ps1",
  "scripts/runtime-smoke.ps1",
  "scripts/db-field-rehearsal.ps1",
  "scripts/lidar-ingest-rehearsal.ps1",
  "scripts/control-board-field-rehearsal.ps1",
  "security:evidence",
  "delivery:evidence",
  "artifacts/field-acceptance",
  "manifest.json",
  "manifest.md",
  "PASS_WITH_SKIPS",
  "Field Acceptance Orchestrator",
].forEach((token) => assertIncludes(script, token, "field acceptance script"));

[
  "field:acceptance",
  "verify:field-acceptance",
  "verify-field-acceptance-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-acceptance-contracts.js", "server package verify chain");

assert(
  packageJson.indexOf("verify:field-acceptance") < packageJson.indexOf("verify:delivery-proxy-contracts"),
  "root smoke chain should run field acceptance contracts before delivery proxy contracts",
);

[
  "npm.cmd run field:acceptance",
  "scripts/field-acceptance.ps1",
  "-RunDbDeploy",
  "-RunDbSeed",
  "-AllowLiveTcp",
  "-IncludeContainerImages",
  "-IncludeZap",
  "-RequireScanners",
  "artifacts/field-acceptance",
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "npm run field:acceptance",
  "artifacts/field-acceptance/<timestamp>/manifest.json",
  "artifacts/field-acceptance/<timestamp>/manifest.md",
].forEach((token) => assertIncludes(matrix, token, "delivery evidence matrix"));

[
  "npm run field:acceptance",
  "scripts/field-acceptance.ps1",
  "field acceptance orchestrator",
  "artifacts/field-acceptance",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(envContracts, "field:acceptance", "environment contract verifier");
assertIncludes(envContracts, "scripts/field-acceptance.ps1", "environment contract verifier");

console.log("field acceptance contracts ok");
