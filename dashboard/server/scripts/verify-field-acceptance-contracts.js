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
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");

[
  "BaseUrl",
  "OutputRoot",
  "Reviewer",
  "SiteName",
  "DecisionNote",
  "OperatorUiWalkthroughEvidence",
  "ConvertTo-StepList",
  "Get-StepsByStatus",
  "Get-LatestManifest",
  "Get-LatestManifestPath",
  "Add-OperatorUiWalkthroughGate",
  "Add-PreflightManifestGate",
  "SkipRuntime",
  "SkipDb",
  "SkipLidar",
  "SkipControlBoard",
  "SkipSecurity",
  "SkipOperatorUiWalkthrough",
  "SkipOperatorUiWalkthrough |",
  "OperatorUiWalkthroughEvidence |",
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
  "IN_PROGRESS",
  "PASS_WITH_SKIPS",
  "readyForHandover",
  "requiresFieldReview",
  "latestPreflightStatus",
  "latestPreflightPassed",
  "$Status -eq \"PASS\" -and $latestPreflightPassed -and $hasReviewer -and $hasSiteName",
  "Rerun field preflight until the latest preflight manifest status is PASS",
  "Latest preflight status",
  "Latest preflight passed",
  "IsNullOrWhiteSpace($Reviewer)",
  "IsNullOrWhiteSpace($SiteName)",
  "nextActions",
  "Field Acceptance Decision",
  "Field Acceptance Orchestrator",
  "Evidence References",
  "evidenceRefs",
  "fieldPreflight",
  "controlBoard",
  "operator UI browser walkthrough",
  "delivery display resolution",
  "attach browser walkthrough evidence with -OperatorUiWalkthroughEvidence <path>",
  "Browser walkthrough evidence",
  "field preflight manifest gate",
  "Latest field preflight manifest status",
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
  "-Reviewer",
  "-SiteName",
  "-OperatorUiWalkthroughEvidence",
  "artifacts/field-acceptance",
  "Handover readiness is true",
  "child evidence references",
  "operator UI browser walkthrough",
  "preflight manifest status is `PASS`",
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
  "field reviewer",
  "operator UI browser walkthrough",
  "delivery display resolution",
  "readyForHandover=true",
  "child evidence references",
  "latest preflight status is `PASS`",
  "artifacts/field-acceptance",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(envContracts, "field:acceptance", "environment contract verifier");
assertIncludes(envContracts, "scripts/field-acceptance.ps1", "environment contract verifier");
assertIncludes(deliveryEvidence, "fieldAcceptanceEvidence", "delivery evidence generator");
assertIncludes(deliveryEvidence, "artifacts/field-acceptance", "delivery evidence generator");
assertIncludes(deliveryEvidence, "Field Acceptance Evidence", "delivery evidence generator");

console.log("field acceptance contracts ok");
