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
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const fieldClosurePlan = readProjectFile("dashboard/server/scripts/generate-field-closure-plan.js");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "verify:final-status", "root package scripts"],
  [packageJson, "verify-final-status-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-status-contracts.js", "server verify chain"],
  [completionAudit, "canMarkGoalComplete", "completion audit generator"],
  [completionAudit, "FIELD_VERIFICATION_REQUIRED", "completion audit generator"],
  [completionAudit, "goal remains active", "completion audit generator"],
  [handoverPackage, "Residual Field Gates", "handover package generator"],
  [handoverPackage, "residualFieldGates", "handover package generator"],
  [handoverPackage, "canMarkGoalComplete=false", "handover package generator"],
  [handoverIndex, "canMarkGoalComplete", "handover index generator"],
  [fieldClosurePlan, "canMarkGoalComplete", "field closure plan generator"],
  [deliveryRunbook, "canMarkGoalComplete", "delivery runbook"],
  [deliveryRunbook, "Residual Field Gates", "delivery runbook"],
  [acceptanceChecklist, "canMarkGoalComplete=false", "acceptance checklist"],
  [matrix, "canMarkGoalComplete", "delivery evidence matrix"],
  [matrix, "Final Status", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const latestCompletion = readLatestJsonManifest("artifacts/completion-audit");
const latestPackage = readLatestJsonManifest("artifacts/handover-package");

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
}

if (latestPackage) {
  const data = latestPackage.data || {};
  assert(Array.isArray(data.residualFieldGates), "handover package must expose residualFieldGates");
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
