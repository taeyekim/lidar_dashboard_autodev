const fs = require("fs");
const path = require("path");
const { readLatestJsonManifest } = require("./generate-delivery-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const completionAudit = readProjectFile("dashboard/server/scripts/generate-completion-audit.js");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const finalStatusReport = readProjectFile("dashboard/server/scripts/generate-final-status-report.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const fieldClosurePlan = readProjectFile("dashboard/server/scripts/generate-field-closure-plan.js");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "verify:final-status", "root package scripts"],
  [packageJson, "final:status", "root package scripts"],
  [packageJson, "verify:final-status-report", "root package scripts"],
  [packageJson, "manual:evidence-readiness", "root package scripts"],
  [packageJson, "verify:manual-evidence-readiness", "root package scripts"],
  [packageJson, "verify-final-status-contracts.js", "root smoke chain"],
  [packageJson, "verify-final-status-report-contracts.js", "root smoke chain"],
  [packageJson, "verify-manual-evidence-readiness-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-status-contracts.js", "server verify chain"],
  [serverPackageJson, "verify-final-status-report-contracts.js", "server verify chain"],
  [serverPackageJson, "verify-manual-evidence-readiness-contracts.js", "server verify chain"],
  [completionAudit, "canMarkGoalComplete", "completion audit generator"],
  [completionAudit, "FIELD_VERIFICATION_REQUIRED", "completion audit generator"],
  [completionAudit, "goal remains active", "completion audit generator"],
  [completionAudit, "fieldReadinessStatus", "completion audit generator"],
  [completionAudit, "controlBoardSafetyStatus", "completion audit generator"],
  [completionAudit, "requiredFieldValues", "completion audit generator"],
  [completionAudit, "manualEvidenceSignals", "completion audit generator"],
  [completionAudit, "sourceDeliveryManifest", "completion audit generator"],
  [completionAudit, "sourceFieldReadinessManifest", "completion audit generator"],
  [completionAudit, "sourceManualEvidenceReadinessManifest", "completion audit generator"],
  [handoverPackage, "Residual Field Gates", "handover package generator"],
  [handoverPackage, "residualFieldGates", "handover package generator"],
  [handoverPackage, "evidenceRefs", "handover package generator"],
  [handoverPackage, "canMarkGoalComplete=false", "handover package generator"],
  [finalStatusReport, "READY_TO_CLOSE", "final status report generator"],
  [finalStatusReport, "FIELD_OR_SECURITY_REVIEW_REQUIRED", "final status report generator"],
  [finalStatusReport, "remainingGates", "final status report generator"],
  [finalStatusReport, "artifacts/final-status", "final status report generator"],
  [finalStatusReport, "manualEvidenceReadiness", "final status report generator"],
  [finalStatusReport, "fieldRiskRegister", "final status report generator"],
  [finalStatusReport, "fieldActionBoard", "final status report generator"],
  [finalStatusReport, "artifacts/manual-evidence-readiness", "final status report generator"],
  [finalStatusReport, "artifacts/field-risk-register", "final status report generator"],
  [finalStatusReport, "artifacts/field-action-board", "final status report generator"],
  [finalStatusReport, "Do not mark the Codex goal complete", "final status report generator"],
  [handoverIndex, "canMarkGoalComplete", "handover index generator"],
  [fieldClosurePlan, "canMarkGoalComplete", "field closure plan generator"],
  [deliveryRunbook, "canMarkGoalComplete", "delivery runbook"],
  [deliveryRunbook, "Residual Field Gates", "delivery runbook"],
  [deliveryRunbook, "verify:final-status", "delivery runbook"],
  [deliveryRunbook, "npm.cmd run final:status", "delivery runbook"],
  [deliveryRunbook, "artifacts/final-status", "delivery runbook"],
  [deliveryRunbook, "delivery/readiness/manual-readiness/security/index/closure references", "delivery runbook"],
  [deliveryRunbook, "a security evidence manifest", "delivery runbook"],
  [acceptanceChecklist, "canMarkGoalComplete=false", "acceptance checklist"],
  [acceptanceChecklist, "npm run verify:final-status", "acceptance checklist"],
  [acceptanceChecklist, "npm run final:status", "acceptance checklist"],
  [acceptanceChecklist, "artifacts/final-status", "acceptance checklist"],
  [acceptanceChecklist, "fresh referenced artifacts", "acceptance checklist"],
  [acceptanceChecklist, "a security evidence manifest", "acceptance checklist"],
  [matrix, "canMarkGoalComplete", "delivery evidence matrix"],
  [matrix, "field readiness", "delivery evidence matrix"],
  [matrix, "LIVE_TCP_READY", "delivery evidence matrix"],
  [matrix, "strictAcceptanceBlocked", "delivery evidence matrix"],
  [handoverIndex, "requireScanners", "handover index generator"],
  [handoverIndex, "strictAcceptanceBlocked", "handover index generator"],
  [matrix, "manual evidence", "delivery evidence matrix"],
  [matrix, "latest referenced artifacts", "delivery evidence matrix"],
  [matrix, "field risk register", "delivery evidence matrix"],
  [matrix, "field action board", "delivery evidence matrix"],
  [matrix, "no residual field gates", "delivery evidence matrix"],
  [matrix, "Final Status", "delivery evidence matrix"],
  [matrix, "artifacts/final-status", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const latestCompletion = readLatestJsonManifest("artifacts/completion-audit");
const latestPackage = readLatestJsonManifest("artifacts/handover-package");
const latestReadiness = readLatestJsonManifest("artifacts/field-readiness");
const latestSecurity = readLatestJsonManifest("artifacts/security");
const latestManualReadiness = readLatestJsonManifest("artifacts/manual-evidence-readiness");
const latestRiskRegister = readLatestJsonManifest("artifacts/field-risk-register");
const latestActionBoard = readLatestJsonManifest("artifacts/field-action-board");
const latestDelivery = readLatestJsonManifest("artifacts/delivery");
const latestIndex = readLatestJsonManifest("artifacts/handover-index");
const latestClosurePlan = readLatestJsonManifest("artifacts/field-closure-plan");

function finalClaimsReady() {
  return (
    latestCompletion?.data?.canMarkGoalComplete === true ||
    latestPackage?.data?.status === "READY" ||
    latestPackage?.data?.canMarkGoalComplete === true
  );
}

function hasOpenRequiredFieldValue(item) {
  const state = String(item.state || "").toLowerCase();
  return [
    "missing",
    "open-or-missing",
    "missing-or-trusted-lan-exception-required",
    "not-approved",
    "change-this-to-a-long-random-secret",
    "admin1234!",
  ].includes(state);
}

function requiredFieldState(items, name) {
  return String((items || []).find((item) => item.name === name)?.state || "").toLowerCase();
}

if (latestCompletion) {
  const data = latestCompletion.data || {};
  assert(
    data.canMarkGoalComplete === (data.status === "COMPLETE"),
    "completion audit canMarkGoalComplete must match COMPLETE status exactly",
  );
  if (!data.canMarkGoalComplete) {
    assert(
      Array.isArray(data.completionBlockers) && data.completionBlockers.length > 0,
      "incomplete completion audit must expose completionBlockers",
    );
  }
  if (data.canMarkGoalComplete) {
    assert(
      data.sourceDeliveryManifest === latestDelivery?.path,
      "complete audit must reference the latest delivery evidence manifest",
    );
    assert(
      data.sourceFieldReadinessManifest === latestReadiness?.path,
      "complete audit must reference the latest field readiness manifest",
    );
    assert(
      data.sourceManualEvidenceReadinessManifest === latestManualReadiness?.path,
      "complete audit must reference the latest manual evidence readiness manifest",
    );
    assert(data.fieldReadinessStatus === "PASS", "complete audit requires PASS field readiness");
    assert(
      data.controlBoardSafetyStatus === "LIVE_TCP_READY",
      "complete audit requires LIVE_TCP_READY control-board safety status",
    );
    assert(
      Array.isArray(data.requiredFieldValues) && data.requiredFieldValues.every((item) => !hasOpenRequiredFieldValue(item)),
      "complete audit requires no open required field values",
    );
    assert(
      requiredFieldState(data.requiredFieldValues, "CONTROL_BOARD_LIVE_APPROVED") === "approved",
      "complete audit requires CONTROL_BOARD_LIVE_APPROVED to be approved",
    );
    assert(
      Array.isArray(data.manualEvidenceSignals) &&
        data.manualEvidenceSignals.every((item) => item.status === "PRESENT"),
      "complete audit requires all manual evidence signals to be PRESENT",
    );
  }
}

if (latestReadiness) {
  const data = latestReadiness.data || {};
  const requiredFieldValues = Array.isArray(data.env?.requiredFieldValues)
    ? data.env.requiredFieldValues
    : [];
  if (data.status === "PASS") {
    assert(
      data.env?.controlBoardSafetyStatus === "LIVE_TCP_READY",
      "PASS field readiness requires LIVE_TCP_READY control-board safety status",
    );
    assert(
      requiredFieldValues.every((item) => !hasOpenRequiredFieldValue(item)),
      "PASS field readiness requires no open required field values",
    );
    assert(
      requiredFieldState(requiredFieldValues, "CONTROL_BOARD_LIVE_APPROVED") === "approved",
      "PASS field readiness requires CONTROL_BOARD_LIVE_APPROVED approved state",
    );
  }
}

if (finalClaimsReady()) {
  assert(latestSecurity, "READY/COMPLETE final status requires security evidence manifest");
}

if (latestSecurity) {
  const data = latestSecurity.data || {};
  if (finalClaimsReady()) {
    assert(
      data.options?.requireScanners === true,
      "READY/COMPLETE final status requires security evidence generated with requireScanners=true",
    );
    assert(
      data.strictAcceptanceBlocked === false,
      "required scanner security evidence must not be strictAcceptanceBlocked",
    );
  }
  if (data.strictAcceptanceBlocked === true && latestCompletion?.data?.canMarkGoalComplete === true) {
    throw new Error("complete audit cannot coexist with blocking strict security evidence");
  }
}

if (latestPackage) {
  const data = latestPackage.data || {};
  assert(Array.isArray(data.residualFieldGates), "handover package must expose residualFieldGates");
  const packageClaimsReady = data.status === "READY" || data.canMarkGoalComplete === true;
  if (packageClaimsReady) {
    assert(data.evidenceRefs?.delivery === latestDelivery?.path, "READY package must reference latest delivery evidence");
    assert(data.evidenceRefs?.completionAudit === latestCompletion?.path, "READY package must reference latest completion audit");
    assert(data.evidenceRefs?.fieldReadiness === latestReadiness?.path, "READY package must reference latest field readiness");
    assert(latestSecurity, "READY package requires latest security evidence");
    assert(data.evidenceRefs?.securityEvidence === latestSecurity.path, "READY package must reference latest security evidence");
    assert(latestManualReadiness, "READY package requires latest manual evidence readiness");
    assert(
      data.evidenceRefs?.manualEvidenceReadiness === latestManualReadiness.path,
      "READY package must reference latest manual evidence readiness",
    );
    assert(latestRiskRegister, "READY package requires latest field risk register");
    assert(
      data.evidenceRefs?.fieldRiskRegister === latestRiskRegister.path,
      "READY package must reference latest field risk register",
    );
    assert(latestActionBoard, "READY package requires latest field action board");
    assert(
      data.evidenceRefs?.fieldActionBoard === latestActionBoard.path,
      "READY package must reference latest field action board",
    );
    assert(data.evidenceRefs?.handoverIndex === latestIndex?.path, "READY package must reference latest handover index");
    assert(data.evidenceRefs?.fieldClosurePlan === latestClosurePlan?.path, "READY package must reference latest field closure plan");
    assert(data.residualFieldGates.length === 0, "READY handover package must have no residual field gates");
  }
  if (!data.canMarkGoalComplete || data.status !== "READY") {
    assert(
      data.residualFieldGates.length > 0,
      "non-ready handover package must expose residual field gates",
    );
  }
  if (data.strict === true && data.status !== "READY") {
    assert(
      Array.isArray(data.strictFailureReasons) && data.strictFailureReasons.length > 0,
      "strict non-ready handover package must expose strictFailureReasons",
    );
  }
}

console.log("final status contracts ok");
