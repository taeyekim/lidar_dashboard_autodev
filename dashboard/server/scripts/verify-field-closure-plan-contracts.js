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

const generator = readProjectFile("dashboard/server/scripts/generate-field-closure-plan.js");
const manualEvidence = readProjectFile("dashboard/server/scripts/manual-evidence.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-closure-plan",
  "sourceHandoverIndex",
  "sourceCompletionAudit",
  "completionBlockers",
  "requiredFieldValues",
  "Required Field Values",
  "requiredFieldValueCount",
  "fieldReadinessOpenChecks",
  "fieldReadinessOpenCheckCount",
  "buildFieldReadinessOpenChecks",
  "fieldRehearsalFollowUpActions",
  "fieldRehearsalFollowUpCount",
  "buildFieldRehearsalFollowUpActions",
  "fieldRehearsalFollowUps",
  "replacementOwner",
  "targetRecheckDate",
  "ownerStatus",
  "recheckStatus",
  "manualEvidenceActions",
  "manualEvidenceMissingCount",
  "buildManualEvidenceActions",
  "manualEvidenceRefs",
  "validationReason",
  "status !== \"PRESENT\"",
  "completionGate",
  "evidenceCommand",
  "doneWhen",
  "redacted",
  "controlBoardSafetyStatus",
  "Control-board safety status",
  "OPEN",
  "finalCommands",
  "Field Readiness",
  "Field Readiness Open Checks",
  "| Status | Severity | Check | Message | Next Action | Evidence Command | Done When |",
  "Field Rehearsal Follow-up Actions",
  "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Next Action | Done When | Manifest |",
  "Manual Evidence Actions",
  "| Status | Type | Path | Template | Validation | Next Action | Done When |",
  "DB And Prisma Field Rehearsal",
  "Lidar Ingest Field Rehearsal",
  "Control Board Field Rehearsal",
  "-OperatorUiWalkthroughEvidence",
  "artifacts/manual/operator-ui-walkthrough.md",
  "npm.cmd run delivery:evidence",
  "npm.cmd run completion:audit",
  "npm.cmd run handover:index",
  "npm.cmd run field:readiness",
  "--require-scanners",
  "handover:package",
  "--strict",
].forEach((token) => assertIncludes(generator, token, "field closure plan generator"));

[
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
  "artifacts/manual/field-risk-acceptance.md",
  "artifacts/manual/operator-ui-walkthrough.md",
  "INVALID",
  "validationReason",
].forEach((token) => assertIncludes(manualEvidence, token, "manual evidence helper"));

[
  "field:closure-plan",
  "verify:field-closure-plan",
  "generate-field-closure-plan.js",
  "verify-field-closure-plan-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-closure-plan-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run field:closure-plan", "delivery runbook");
assertIncludes(runbook, "artifacts/field-closure-plan/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run field:closure-plan", "acceptance checklist");
assertIncludes(matrix, "npm run field:closure-plan", "delivery evidence matrix");

console.log("field closure plan contracts ok");
