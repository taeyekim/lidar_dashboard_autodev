const fs = require("fs");
const path = require("path");
const {
  buildFinalExecutionPlan,
  buildMarkdown,
  buildOrderedCommands,
  commandCatalog,
} = require("./generate-final-execution-plan");

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
const generator = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "final:execution-plan", "root package scripts"],
  [packageJson, "verify:final-execution-plan", "root package scripts"],
  [packageJson, "verify-final-execution-plan-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-execution-plan-contracts.js", "server verify chain"],
  [generator, "artifacts/final-execution-plan", "final execution plan generator"],
  [generator, "sourceFinalStatus", "final execution plan generator"],
  [generator, "gatesByActionType", "final execution plan generator"],
  [generator, "orderedCommands", "final execution plan generator"],
  [generator, "manualEvidenceTargets", "final execution plan generator"],
  [generator, "This execution plan does not prove field completion", "final execution plan generator"],
  [generator, "npm.cmd run final:status", "final execution plan generator"],
  [generator, "npm.cmd run handover:package", "final execution plan generator"],
  [generator, "scripts/control-board-field-rehearsal.ps1", "final execution plan generator"],
  [generator, "scripts/lidar-ingest-rehearsal.ps1", "final execution plan generator"],
  [generator, "scripts/db-field-rehearsal.ps1", "final execution plan generator"],
  [generator, "--require-scanners", "final execution plan generator"],
  [runbook, "npm.cmd run final:execution-plan", "delivery runbook"],
  [runbook, "artifacts/final-execution-plan/<timestamp>/manifest.json", "delivery runbook"],
  [checklist, "npm run final:execution-plan", "acceptance checklist"],
  [checklist, "artifacts/final-execution-plan/<timestamp>/manifest.json", "acceptance checklist"],
  [matrix, "final:execution-plan", "delivery evidence matrix"],
  [matrix, "artifacts/final-execution-plan/<timestamp>/manifest.json", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const openPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      status: "FIELD_OR_SECURITY_REVIEW_REQUIRED",
      siteName: "field-site",
      remainingGates: [
        { actionType: "MANUAL_EVIDENCE_REQUIRED", category: "Manual Evidence", status: "MISSING", message: "Operator walkthrough missing.", closeWhen: "Attach evidence." },
        { actionType: "FIELD_ACTION_REQUIRED", category: "Control Board TCP", status: "DRY_RUN_SAFE", message: "Live TCP missing.", closeWhen: "Run rehearsal." },
        { actionType: "SECURITY_REVIEW_REQUIRED", category: "Security Evidence", status: "BLOCKED", message: "Scanner evidence missing.", closeWhen: "Run scanners." },
      ],
    },
  },
  closurePlan: { path: "artifacts/field-closure-plan/20260101-000000/manifest.json", data: {} },
  handoverPackage: { path: "artifacts/handover-package/20260101-000000/manifest.json", data: {} },
  manualEvidence: [
    {
      type: "Operator UI Walkthrough",
      path: "artifacts/manual/operator-ui-walkthrough.md",
      template: "docs/ops/operator-ui-walkthrough-template.md",
      status: "MISSING",
      validationReason: "Evidence file does not exist.",
      doneWhen: "Walkthrough result is PASS.",
    },
  ],
});

assert(openPlan.status === "OPEN", "open final status should produce OPEN execution plan");
assert(openPlan.remainingGateCount === 3, "execution plan should preserve remaining gate count");
assert(openPlan.orderedCommands.some((item) => item.id === "manual-evidence-readiness"), "manual gate should include manual evidence readiness command");
assert(openPlan.orderedCommands.some((item) => item.id === "control-board-field-rehearsal"), "field gate should include control-board rehearsal command");
assert(openPlan.orderedCommands.some((item) => item.id === "security-evidence"), "security gate should include strict security evidence command");
assert(openPlan.orderedCommands.some((item) => item.command.includes("http://field.local:8080")), "commands should use the requested base URL");

const openMarkdown = buildMarkdown(openPlan);
assert(openMarkdown.includes("Final Execution Plan"), "markdown should include title");
assert(openMarkdown.includes("This execution plan does not prove field completion"), "markdown should include guardrail");
assert(openMarkdown.includes("Ordered Commands"), "markdown should include ordered command table");

const readyPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      status: "READY_TO_CLOSE",
      remainingGates: [],
    },
  },
  manualEvidence: [],
});

assert(readyPlan.status === "READY_TO_CLOSE", "ready final status should produce READY_TO_CLOSE execution plan");
assert(readyPlan.canMarkGoalComplete === true, "ready execution plan should allow close");
assert(readyPlan.orderedCommands.length === 0, "ready execution plan should not invent commands");
const missingFinalStatusPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: null,
  manualEvidence: [],
});
assert(missingFinalStatusPlan.status === "FINAL_STATUS_MISSING", "missing final status should be explicit");
assert(missingFinalStatusPlan.remainingGateCount === 1, "missing final status should create one planning gate");
assert(missingFinalStatusPlan.orderedCommands.some((item) => item.id === "final-status"), "missing final status should include final status command");
assert(buildOrderedCommands([{ actionType: "REVIEW_REQUIRED" }], "http://localhost:8080").some((item) => item.id === "final-status"), "review gates should still include final status refresh");
assert(commandCatalog("http://localhost:8080").some((item) => item.id === "field-acceptance" && item.command.includes("-RequireScanners")), "catalog should include strict field acceptance command");

console.log("final execution plan contracts ok");
