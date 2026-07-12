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
const operatorUiTemplate = readProjectFile("docs/ops/operator-ui-walkthrough-template.md");

[
  "BaseUrl",
  "OutputRoot",
  "Reviewer",
  "SiteName",
  "DecisionNote",
  "OperatorUiWalkthroughEvidence",
  "ConvertTo-StepList",
  "Get-StepsByStatus",
  "Get-ObjectPropertyValue",
  "ConvertTo-AcceptanceOpenItems",
  "ConvertTo-PreflightOpenItems",
  "Get-LatestManifest",
  "Get-LatestManifestPath",
  "Get-GitState",
  "Git pushed to origin/dev",
  "Working tree clean",
  "Test-PlaceholderFieldText",
  "Get-MarkdownTableValue",
  "Get-MarkdownRowsAfterHeader",
  "Add-OperatorUiWalkthroughGate",
  "Add-PreflightManifestGate",
  "SkipRuntime",
  "SkipDb",
  "SkipLidar",
  "SkipControlBoard",
  "SkipSecurity",
  "SkipOperatorUiWalkthrough",
  "SkipDeliveryEvidence",
  "SkipOperatorUiWalkthrough |",
  "SkipDeliveryEvidence |",
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
  "PSNativeCommandUseErrorActionPreference",
  "scripts/runtime-smoke.ps1",
  "scripts/db-field-rehearsal.ps1",
  "scripts/lidar-ingest-rehearsal.ps1",
  "scripts/control-board-field-rehearsal.ps1",
  "security:evidence",
  "delivery:evidence",
  "run npm.cmd run delivery:evidence separately before final handover",
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
  "openAcceptanceItems",
  "preflightOpenItems",
  "Open Acceptance Items",
  "Preflight Open Items",
  "Resolve the reason and rerun field:acceptance until this step is PASS",
  "Attach reviewer acceptance for the skipped evidence",
  "Resolve this preflight check and rerun field:preflight until it is PASS",
  "Provide the required field value or attach reviewer risk acceptance",
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
  "Get-Content -LiteralPath $OperatorUiWalkthroughEvidence -Raw",
  "## Required Screens",
  "Walkthrough result",
  "\\|\\s*TODO\\s*\\|",
  "Every required operator screen row must have PASS status before final field acceptance",
  "Path Or Reference",
  "requiredEvidenceTypes",
  "Related field acceptance manifest",
  "Related handover package manifest",
  "Operator UI walkthrough evidence must include a filled '$type' evidence reference",
  "\\|\\s*Walkthrough result\\s*\\|\\s*PASS\\s*\\|",
  "Operator UI walkthrough evidence still contains TODO screen rows",
  "Operator UI walkthrough evidence must record '| Walkthrough result | PASS |'",
  "requiredSessionFields",
  "Site name",
  "Reviewer",
  "Operator account",
  "Browser and version",
  "Delivery display resolution",
  "Entry URL",
  "Base API URL",
  "Captured at",
  "requiredDecisionFields",
  "Operator UI walkthrough evidence has an empty '$field' session value",
  "Operator UI walkthrough evidence has an empty '$field' decision value",
  "Operator UI walkthrough evidence has a placeholder '$field' session value",
  "Operator UI walkthrough evidence has a placeholder '$field' decision value",
  "field-reviewer|field-reviewer-name|field-site|delivery-site-name",
  "!(Test-PlaceholderFieldText -Value $Reviewer)",
  "!(Test-PlaceholderFieldText -Value $SiteName)",
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
  "-SkipDeliveryEvidence",
  "artifacts/field-acceptance",
  "Handover readiness is true",
  "child evidence references",
  "operator UI browser walkthrough",
  "docs/ops/operator-ui-walkthrough-template.md",
  "artifacts/manual/operator-ui-walkthrough.md",
  "preflight manifest status is `PASS`",
  "Preflight Open Items",
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
  "open acceptance items",
  "Preflight Open Items",
  "field reviewer",
  "operator UI browser walkthrough",
  "docs/ops/operator-ui-walkthrough-template.md",
  "artifacts/manual/operator-ui-walkthrough.md",
  "delivery display resolution",
  "readyForHandover=true",
  "child evidence references",
  "latest preflight status is `PASS`",
  "Preflight Open Items",
  "artifacts/field-acceptance",
  "-SkipDeliveryEvidence",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

[
  "Operator UI Walkthrough Evidence Template",
  "artifacts/manual/operator-ui-walkthrough.md",
  "Empty session or reviewer decision values are not valid field evidence",
  "Delivery display resolution",
  "## Required Screens",
  "Walkthrough result",
  "Control-board mode",
  "DRY_RUN or LIVE_TCP state",
  "liveApproved",
  "LIVE_TCP_APPROVAL_REQUIRED",
  "Event detail",
  "Raw LiDAR payload",
  "Event Log",
  "Realtime connected/degraded/disabled state",
  "Statistics",
  "Daily, weekly, monthly, yearly normal/wrong-way counts",
  "Swagger",
  "Reviewer Decision",
].forEach((token) => assertIncludes(operatorUiTemplate, token, "operator UI walkthrough template"));

assertIncludes(envContracts, "field:acceptance", "environment contract verifier");
assertIncludes(envContracts, "scripts/field-acceptance.ps1", "environment contract verifier");
assertIncludes(deliveryEvidence, "fieldAcceptanceEvidence", "delivery evidence generator");
assertIncludes(deliveryEvidence, "artifacts/field-acceptance", "delivery evidence generator");
assertIncludes(deliveryEvidence, "Field Acceptance Evidence", "delivery evidence generator");

console.log("field acceptance contracts ok");
