const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const completionAudit = readProjectFile("dashboard/server/scripts/generate-completion-audit.js");
const deliveryMatrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  "completion:audit",
  "verify:completion-audit",
  "generate-completion-audit.js",
  "verify-completion-audit-contracts.js",
].forEach((token) => {
  assert(packageJson.includes(token), `root package scripts are missing ${token}`);
});

[
  "verify-completion-audit-contracts.js",
].forEach((token) => {
  assert(serverPackageJson.includes(token), `server package verify chain is missing ${token}`);
});

[
  "canMarkGoalComplete",
  "FIELD_VERIFICATION_REQUIRED",
  "AUTOMATED_REVIEW_REQUIRED",
  "COMPLETE",
  "completionBlockers",
  "blockerNextAction",
  "nextAction",
  "automatedBlockers",
  "fieldBlockers",
  "automatedBlockerCount",
  "fieldBlockerCount",
  "artifacts/completion-audit",
  "fieldVerificationRequiredCount",
  "fieldPreflightReviewCount",
  "fieldReadinessReviewCount",
  "fieldReadinessSkippedCount",
  "controlBoardSafetyStatus",
  "LIVE_TCP_READY",
  "Control-board safety status",
  "fieldAcceptanceSkippedCount",
  "readLatestJsonManifest",
  "sourceDeliveryManifest",
  "sourceFieldReadinessManifest",
  "latestFieldReadinessManifest",
  "buildReadinessSignals",
  "buildRequiredFieldValueSignals",
  "buildCompanionEvidenceMetadata",
  "buildManualEvidenceSignals",
  "manualEvidenceSignals",
  "manualEvidenceMissingCount",
  "Manual Evidence",
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
  "manual evidence",
  "requiredFieldValues",
  "Required Field Values",
  "companionEvidenceMetadata",
  "Companion Evidence Metadata",
  "completionGate",
  "redacted",
  "artifacts/field-readiness",
  "npm run field:readiness",
  "npm run field:preflight",
  "npm run field:acceptance",
  "--require-scanners",
  "goal remains active",
].forEach((token) => {
  assert(completionAudit.includes(token), `completion audit generator is missing ${token}`);
});

[
  "npm run completion:audit",
  "artifacts/completion-audit/<timestamp>/manifest.json",
  "artifacts/completion-audit/<timestamp>/manifest.md",
  "canMarkGoalComplete",
  "field readiness",
  "required field value states",
].forEach((token) => {
  assert(deliveryMatrix.includes(token), `delivery evidence matrix is missing ${token}`);
  assert(deliveryRunbook.includes(token), `delivery runbook is missing ${token}`);
  assert(acceptanceChecklist.includes(token), `acceptance checklist is missing ${token}`);
});

console.log("completion audit contracts ok");
