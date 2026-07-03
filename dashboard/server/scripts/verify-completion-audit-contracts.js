const fs = require("fs");
const path = require("path");
const {
  buildCompletionBlockers,
} = require("./generate-completion-audit");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const completionAudit = readProjectFile("dashboard/server/scripts/generate-completion-audit.js");
const manualEvidence = readProjectFile("dashboard/server/scripts/manual-evidence.js");
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
  "sourceManualEvidenceReadinessManifest",
  "latestManualEvidenceReadinessManifest",
  "manualEvidenceReadiness",
  "Manual evidence readiness",
  "manualEvidenceReadinessMissingCount",
  "manualEvidenceReadinessInvalidCount",
  "latestFieldReadinessManifest",
  "buildReadinessSignals",
  "buildRequiredFieldValueSignals",
  "buildCompanionEvidenceMetadata",
  "buildFieldRehearsalFollowUps",
  "buildManualEvidenceSignals",
  "manualEvidenceRefs",
  "manualEvidenceSignals",
  "openRequiredManualEvidence",
  "Required manual evidence",
  "manualEvidenceOpenCount",
  "manualEvidenceMissingCount",
  "manualEvidenceInvalidCount",
  "Manual Evidence",
  "manual evidence",
  "requiredFieldValues",
  "Required Field Values",
  "companionEvidenceMetadata",
  "Companion Evidence Metadata",
  "fieldRehearsalFollowUps",
  "Field Rehearsal Follow-ups",
  "unavailableAcceptance",
  "replacementOwner",
  "targetRecheckDate",
  "ownerStatus",
  "recheckStatus",
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
  "manualEvidenceDefinitions",
  "manualEvidenceRefs",
  "validateManualEvidence",
  "INVALID",
  "validationReason",
  "TODO accepted-item rows",
  "Decision | ACCEPTED",
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
].forEach((token) => {
  assert(manualEvidence.includes(token), `manual evidence helper is missing ${token}`);
});

[
  "npm run completion:audit",
  "artifacts/completion-audit/<timestamp>/manifest.json",
  "artifacts/completion-audit/<timestamp>/manifest.md",
  "canMarkGoalComplete",
  "field readiness",
  "required field value states",
  "manual evidence",
  "required manual evidence",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
].forEach((token) => {
  assert(deliveryMatrix.includes(token), `delivery evidence matrix is missing ${token}`);
  assert(deliveryRunbook.includes(token), `delivery runbook is missing ${token}`);
  assert(acceptanceChecklist.includes(token), `acceptance checklist is missing ${token}`);
});

[
  "manual evidence open count",
  "manual evidence missing count",
  "manual evidence invalid count",
  "manual operator UI/risk acceptance evidence",
].forEach((token) => {
  assert(deliveryMatrix.includes(token), `delivery evidence matrix is missing ${token}`);
});

const cleanDeliveryManifest = {
  data: {
    handoverSummary: {
      status: "AUTOMATED_CHECKS_PASS",
      failedCommandCount: 0,
      companionReviewCount: 0,
      companionSkippedCount: 0,
      fieldRehearsalReviewCount: 0,
      fieldAcceptanceReviewCount: 0,
      fieldAcceptanceSkippedCount: 0,
      fieldPreflightReviewCount: 0,
      fieldPreflightSkippedCount: 0,
      fieldVerificationRequiredCount: 0,
    },
  },
};
const cleanFieldReadinessManifest = {
  data: {
    status: "PASS",
    reviewCount: 0,
    skippedCount: 0,
    env: {
      controlBoardSafetyStatus: "LIVE_TCP_READY",
    },
  },
};
const missingManualEvidenceBlockers = buildCompletionBlockers(
  cleanDeliveryManifest,
  cleanFieldReadinessManifest,
  {
    data: {
      status: "MISSING",
      readyForFinalClose: false,
      missingCount: 1,
      invalidCount: 0,
    },
  },
  [{
    type: "Operator UI Walkthrough",
    required: true,
    status: "MISSING",
    nextAction: "Attach operator walkthrough evidence.",
  }],
);
assert(
  missingManualEvidenceBlockers.some((item) => item.message === "Required manual evidence Operator UI Walkthrough is MISSING."),
  "completion audit must block COMPLETE when required manual evidence is missing",
);
assert(
  missingManualEvidenceBlockers.some((item) => item.message === "Manual evidence readiness is MISSING with missing=1 invalid=0."),
  "completion audit must block COMPLETE when manual evidence readiness is not ready",
);

console.log("completion audit contracts ok");
