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
  "DEFAULT_COMMAND_TIMEOUT_MS",
  "DELIVERY_EVIDENCE_TIMEOUT_MS",
  "timeoutMs",
  "timedOut",
  "reuse-existing-evidence",
  "reusedExistingEvidence",
  "Existing evidence refs were packaged without rerunning refresh commands.",
  "completion:audit",
  "handover:index",
  "field:closure-plan",
  "field:readiness",
  "field:gate-closure-map",
  "manual:evidence-drafts",
  "manual:evidence-readiness",
  "isPlaceholderFieldText",
  "metadataReviewItems",
  "metadataReview",
  "summarizeFieldAcceptance",
  "summarizeFieldPreflight",
  "summarizeFieldRehearsal",
  "fieldEvidenceStrictFailures",
  "fieldActionArtifactStrictFailures",
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
  "operatorUiWalkthroughAccepted",
  "item.type === \"Operator UI Walkthrough\" && item.status === \"PRESENT\"",
  "fieldRiskAccepted",
  "item.type === \"Field Risk Acceptance\" && item.status === \"PRESENT\"",
  "DEVICE_INGEST_API_KEY",
  "item.area !== \"Device Ingest Key\"",
  "residualFieldGates",
  "fieldEvidenceSummary",
  "fieldEvidenceFollowUps",
  "fieldEvidenceOpenItems",
  "fieldEvidenceCommandRunbook",
  "fieldPreflight",
  "fieldEnvCloseout",
  "fieldAcceptance",
  "preferPassingFieldAcceptance: false",
  "dbFieldRehearsal",
  "lidarFieldRehearsal",
  "controlBoardFieldRehearsal",
  "runtimeEvidence",
  "securityEvidence",
  "manualEvidenceDrafts",
  "manualEvidenceReadiness",
  "fieldGateClosureMap",
  "finalBundleHandoff",
  "ciStatus",
  "openRiskCount",
  "openActionCount",
  "openGateCount",
  "openItemCount",
  "Manual Evidence References",
  "Manual evidence readiness",
  "Manual evidence drafts",
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
  "Dashboard-side wrong-way-level-2 escalation threshold remains field-measurement dependent and disabled until approved env thresholds are configured.",
  "WRONGWAY_LEVEL2_ESCALATION_ENABLED=true",
  "Traffic KPI Wording",
  "Security Scanner Evidence",
  "Device Ingest Key",
  "field-risk acceptance records reviewer, owner, and recheck date",
  "Field environment closeout",
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
  "FIELD_REVIEWER",
  "FIELD_SITE_NAME",
  "-OperatorUiWalkthroughEvidence",
  "No field evidence review/skipped items.",
  "canMarkGoalComplete",
  "controlBoardSafetyStatus",
  "Control-board safety status",
  "Final bundle handoff",
  "CI status",
  "baseUrl",
  "--base-url",
  "Base URL",
  "gitValue",
  "buildGitState",
  "Git commit",
  "Git branch",
  "Git upstream",
  "Git upstream commit",
  "Git pushed to origin/dev",
  "Working tree clean",
  "working tree is not clean",
  "git branch is",
  "git upstream is",
  "not proven pushed to origin/dev",
  "Strict Gate",
  "failedCommandCount",
  "strictFailureReasons",
  "strictFailureReasons.push(...metadataReview)",
  "field evidence has",
  "REVIEW and",
  "SKIPPED item(s)",
  "--require-scanners",
  "Strict security acceptance",
  "--strict",
  "handover package strict gate failed",
  "field risk register has",
  "field action board has",
  "field gate closure map has",
  "field owner briefs have",
  "Attach the latest final bundle handoff",
  "CI status evidence",
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
  generator.indexOf('["field readiness", ["run", "field:readiness"') <
    generator.indexOf('["field risk register", ["run", "field:risk-register"') &&
    generator.indexOf('["field risk register", ["run", "field:risk-register"') <
    generator.indexOf('["manual evidence drafts", ["run", "manual:evidence-drafts"') &&
    generator.indexOf('["manual evidence drafts", ["run", "manual:evidence-drafts"') <
    generator.indexOf('["manual evidence readiness", ["run", "manual:evidence-readiness"') &&
    generator.indexOf('["field action board", ["run", "field:action-board"') <
    generator.indexOf('["field gate closure map", ["run", "field:gate-closure-map"') &&
    generator.indexOf('["field gate closure map", ["run", "field:gate-closure-map"') <
    generator.indexOf('["field owner briefs", ["run", "field:owner-briefs"') &&
    generator.indexOf("fieldActionArtifactStrictFailures") <
    generator.indexOf("const residualFieldGates = buildResidualFieldGates") &&
    generator.indexOf('["field closure plan", ["run", "field:closure-plan"') <
    generator.indexOf('["handover index", ["run", "handover:index"'),
  "handover package must refresh field readiness before risk register, risk register before manual evidence drafts, drafts before readiness, action board before gate closure map before owner briefs, evaluate field action artifacts before residual gates, and field closure plan before handover index",
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
assertIncludes(runbook, "Git pushed to origin/dev", "delivery runbook");
assertIncludes(checklist, "npm run handover:package", "acceptance checklist");
assertIncludes(checklist, "field gate closure map", "acceptance checklist");
assertIncludes(checklist, "gate-closure-map/owner-brief/final-bundle-handoff references", "acceptance checklist");
assertIncludes(checklist, "Git commit", "acceptance checklist");
assertIncludes(checklist, "Git pushed to origin/dev", "acceptance checklist");
assertIncludes(matrix, "npm run handover:package", "delivery evidence matrix");
assertIncludes(matrix, "npm run final:bundle-handoff", "delivery evidence matrix");
assertIncludes(matrix, "artifacts/final-bundle-handoff/<timestamp>/manifest.json", "delivery evidence matrix");
assertIncludes(matrix, "final bundle handoff", "delivery evidence matrix");
assertIncludes(matrix, "npm run ci:status", "delivery evidence matrix");

console.log("handover package contracts ok");
