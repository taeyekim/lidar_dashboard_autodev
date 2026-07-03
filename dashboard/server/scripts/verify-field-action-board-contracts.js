const fs = require("fs");
const path = require("path");

const {
  buildManifest,
  buildMarkdown,
  buildActionItems,
  commandForGate,
  groupByOwner,
  ownerForGate,
  priorityForGate,
} = require("./generate-field-action-board");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-action-board.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-action-board",
  "Owner Summary",
  "Owner Commands",
  "This board organizes final-status gates for field execution",
  "Auth/Security",
  "LiDAR Ingest",
  "Control-board TCP",
  "Nginx Delivery",
  "PM/QA",
  "Backend/Runtime",
  "P0",
  "P1",
  "P2",
  "sourceFinalStatus",
].forEach((token) => assertIncludes(generator, token, "field action board generator"));

[
  "field:action-board",
  "verify:field-action-board",
  "generate-field-action-board.js",
  "verify-field-action-board-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-action-board-contracts.js", "server verify chain");
assertIncludes(handoverPackage, "field:action-board", "handover package generator");
assertIncludes(handoverPackage, "fieldActionBoard", "handover package generator");
assertIncludes(handoverIndex, "Field Action Board", "handover index generator");
assertIncludes(finalExecutionPlan, "field-action-board", "final execution plan generator");
assertIncludes(finalExecutionPlan, "npm.cmd run field:action-board", "final execution plan generator");
assertIncludes(runbook, "npm.cmd run field:action-board", "delivery runbook");
assertIncludes(runbook, "artifacts/field-action-board/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run field:action-board", "acceptance checklist");
assertIncludes(checklist, "artifacts/field-action-board/<timestamp>/manifest.json", "acceptance checklist");
assertIncludes(matrix, "field:action-board", "delivery evidence matrix");
assertIncludes(matrix, "artifacts/field-action-board/<timestamp>/manifest.json", "delivery evidence matrix");

const gates = [
  {
    actionType: "SECURITY_REVIEW_REQUIRED",
    category: "Security Evidence",
    status: "BLOCKED",
    message: "Required scanner security evidence is strictAcceptanceBlocked.",
    closeWhen: "Resolve scanner failures/skips or attach accepted field-risk evidence.",
    evidence: "artifacts/security/example/manifest.json",
  },
  {
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Control Board TCP",
    status: "DRY_RUN_SAFE",
    message: "Control-board safety is not LIVE_TCP_READY.",
    closeWhen: "Configure field host/port, record CONTROL_BOARD_LIVE_APPROVED=true, and capture live TCP rehearsal evidence.",
    evidence: "artifacts/field-readiness/example/manifest.json",
  },
  {
    actionType: "MANUAL_EVIDENCE_REQUIRED",
    category: "Manual Evidence",
    status: "INVALID",
    message: "Operator UI Walkthrough evidence is INVALID.",
    closeWhen: "Operator UI walkthrough evidence is attached.",
    evidence: "artifacts/manual/operator-ui-walkthrough.md",
  },
];

assert(ownerForGate(gates[0]) === "Auth/Security", "security gate should map to Auth/Security");
assert(ownerForGate(gates[1]) === "Control-board TCP", "control-board gate should map to Control-board TCP");
assert(ownerForGate(gates[2]) === "PM/QA", "manual operator gate should map to PM/QA");
assert(priorityForGate(gates[0]) === "P0", "blocked security gate should be P0");
assert(commandForGate(gates[1], "http://field.local:8080").includes("control-board-field-rehearsal.ps1"), "control-board gate should map to control-board rehearsal command");

const actionItems = buildActionItems({ data: { remainingGates: gates } }, "http://field.local:8080");
assert(actionItems.length === 3, "action items should preserve gate count");
assert(actionItems.every((item) => item.id.startsWith("GATE-")), "action item ids should be stable gate ids");
assert(groupByOwner(actionItems).some((group) => group.owner === "Auth/Security" && group.total === 1), "owner grouping should count security owner");

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "tester",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      baseUrl: "http://field.local:8080",
      siteName: "field-site",
      remainingGates: gates,
    },
  },
});

assert(manifest.status === "OPEN", "fixture with gates should produce OPEN board");
assert(manifest.openActionCount === 3, "manifest should preserve open action count");
assert(manifest.ownerGroups.length === 3, "manifest should group by owner");
assert(manifest.sourceFinalStatus.includes("artifacts/final-status"), "manifest should reference final status");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Action Board"), "markdown should include title");
assert(markdown.includes("Owner Summary"), "markdown should include owner summary");
assert(markdown.includes("Owner Commands"), "markdown should include owner commands");
assert(markdown.includes("control-board-field-rehearsal.ps1"), "markdown should include mapped field command");

const ready = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      remainingGates: [],
    },
  },
});
assert(ready.status === "READY_TO_CLOSE", "empty final gates should produce READY_TO_CLOSE board");
assert(ready.openActionCount === 0, "empty final gates should have zero actions");

console.log("field action board contracts ok");
