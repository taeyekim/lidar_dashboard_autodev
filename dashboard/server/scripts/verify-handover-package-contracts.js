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

const generator = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const manualEvidence = readProjectFile("dashboard/server/scripts/manual-evidence.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/handover-package",
  "delivery:evidence",
  "completion:audit",
  "handover:index",
  "field:closure-plan",
  "field:readiness",
  "manual:evidence-readiness",
  "summarizeFieldAcceptance",
  "summarizeFieldPreflight",
  "summarizeFieldRehearsal",
  "fieldEvidenceStrictFailures",
  "fieldEvidenceNextAction",
  "fieldEvidenceDoneWhen",
  "buildFieldEvidenceOpenItems",
  "buildFieldEvidenceCommandRunbook",
  "buildFieldEvidenceFollowUps",
  "buildResidualFieldGates",
  "canMarkGoalComplete",
  "markdownCell",
  "replace(/\\|/g",
  "evidenceRefs",
  "manualEvidenceRefs",
  "validationReason",
  "openManualEvidence",
  "manual evidence item(s) are not PRESENT",
  "status !== \"PRESENT\"",
  "knownFieldLimitations",
  "residualFieldGates",
  "fieldEvidenceSummary",
  "fieldEvidenceFollowUps",
  "fieldEvidenceOpenItems",
  "fieldEvidenceCommandRunbook",
  "fieldPreflight",
  "fieldAcceptance",
  "dbFieldRehearsal",
  "lidarFieldRehearsal",
  "controlBoardFieldRehearsal",
  "runtimeEvidence",
  "securityEvidence",
  "manualEvidenceReadiness",
  "Manual Evidence References",
  "Manual evidence readiness",
  "Residual Field Gates",
  "| Category | Status | Message | Close When |",
  "No residual field gates.",
  "Rehearsal Follow-up",
  "Known Limitation",
  "? []",
  "| Type | Status | Path | Template | Required When | Validation |",
  "Known Field Limitations",
  "| Area | Limitation | Source | Close When |",
  "Control Board TCP",
  "CONTROL_BOARD_LIVE_APPROVED=true",
  "Level-2 Escalation",
  "Dashboard-side wrong-way-level-2 escalation threshold remains field-measurement dependent.",
  "Traffic KPI Wording",
  "Security Scanner Evidence",
  "Device Ingest Key",
  "field-risk acceptance records reviewer, owner, and recheck date",
  "Field preflight",
  "Field acceptance",
  "DB field rehearsal",
  "LiDAR field rehearsal",
  "Control-board field rehearsal",
  "Field Evidence Summary",
  "| Type | Manifest | PASS | REVIEW | SKIPPED |",
  "Field Evidence Follow-ups",
  "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Manifest |",
  "unavailableAcceptance",
  "replacementOwner",
  "targetRecheckDate",
  "ownerStatus",
  "recheckStatus",
  "Field Evidence Open Items",
  "| Type | Status | Message | Next Action | Manifest |",
  "Field Evidence Command Runbook",
  "| Type | Command | Done When |",
  "doneWhen",
  "Field acceptance manifest is PASS",
  "normal-driving de-duplication",
  "approved LIVE_TCP command/ACK evidence",
  "No field evidence commands required.",
  "nextAction",
  "scripts/db-field-rehearsal.ps1",
  "scripts/lidar-ingest-rehearsal.ps1",
  "scripts/control-board-field-rehearsal.ps1",
  "-OperatorUiWalkthroughEvidence",
  "No field evidence review/skipped items.",
  "canMarkGoalComplete",
  "controlBoardSafetyStatus",
  "Control-board safety status",
  "baseUrl",
  "--base-url",
  "Base URL",
  "gitValue",
  "Git commit",
  "Git branch",
  "Working tree clean",
  "Strict Gate",
  "failedCommandCount",
  "strictFailureReasons",
  "field evidence has",
  "REVIEW and",
  "SKIPPED item(s)",
  "--require-scanners",
  "Strict security acceptance",
  "--strict",
  "handover package strict gate failed",
].forEach((token) => assertIncludes(generator, token, "handover package generator"));

[
  "summarizeFieldRehearsal",
  "FIELD_REHEARSAL_PASS",
  "PASS rehearsal manifest missing",
  "baseUrl",
  "reviewer",
  "siteName",
  "hostName",
  "reviewItems.push",
].forEach((token) => assertIncludes(deliveryEvidence, token, "delivery evidence rehearsal summary"));

[
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
  "INVALID",
  "PRESENT",
  "MISSING",
  "validationReason",
].forEach((token) => assertIncludes(manualEvidence, token, "manual evidence helper"));

assert(
  generator.indexOf('["manual evidence readiness", ["run", "manual:evidence-readiness"') <
    generator.indexOf('["field readiness", ["run", "field:readiness"') &&
    generator.indexOf('["field closure plan", ["run", "field:closure-plan"') <
    generator.indexOf('["handover index", ["run", "handover:index"'),
  "handover package must refresh manual evidence readiness before field readiness and field closure plan before handover index",
);

[
  "handover:package",
  "verify:handover-package",
  "generate-handover-package.js",
  "verify-handover-package-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-handover-package-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run handover:package", "delivery runbook");
assertIncludes(runbook, "artifacts/handover-package/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(runbook, "Working tree clean", "delivery runbook");
assertIncludes(checklist, "npm run handover:package", "acceptance checklist");
assertIncludes(checklist, "Git commit", "acceptance checklist");
assertIncludes(matrix, "npm run handover:package", "delivery evidence matrix");

console.log("handover package contracts ok");
