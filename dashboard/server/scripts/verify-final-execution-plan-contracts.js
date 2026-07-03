const fs = require("fs");
const path = require("path");
const {
  buildFinalExecutionPlan,
  buildMarkdown,
  buildCommandGateCoverage,
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
  [generator, "sourceFieldGateClosureMap", "final execution plan generator"],
  [generator, "buildGitState", "final execution plan generator"],
  [generator, "gatesByActionType", "final execution plan generator"],
  [generator, "orderedCommands", "final execution plan generator"],
  [generator, "commandGateCoverage", "final execution plan generator"],
  [generator, "Command Gate Coverage", "final execution plan generator"],
  [generator, "gateCount", "final execution plan generator"],
  [generator, "source-revision-closeout", "final execution plan generator"],
  [generator, "docs-text-quality", "final execution plan generator"],
  [generator, "npm.cmd run verify:docs-text-quality", "final execution plan generator"],
  [generator, "ci-status", "final execution plan generator"],
  [generator, "ci-closeout", "final execution plan generator"],
  [generator, "npm.cmd run ci:status", "final execution plan generator"],
  [generator, "Git pushed to origin/dev", "final execution plan generator"],
  [generator, "git push origin dev", "final execution plan generator"],
  [generator, "HEAD matches origin/dev", "final execution plan generator"],
  [generator, "manualEvidenceTargets", "final execution plan generator"],
  [generator, "isPlaceholderFieldText", "final execution plan generator"],
  [generator, "Final Execution Plan Metadata", "final execution plan generator"],
  [generator, "manual:evidence-readiness -- --generated-by", "final execution plan generator"],
  [generator, "This execution plan does not prove field completion", "final execution plan generator"],
  [generator, "npm.cmd run final:status", "final execution plan generator"],
  [generator, "npm.cmd run handover:package", "final execution plan generator"],
  [generator, "npm.cmd run handover:index", "final execution plan generator"],
  [generator, "npm.cmd run field:closure-plan", "final execution plan generator"],
  [generator, "npm.cmd run field:gate-closure-map", "final execution plan generator"],
  [generator, "Field Action Artifact Actions", "final execution plan generator"],
  [generator, "execution phase", "final execution plan generator"],
  [generator, "scripts/control-board-field-rehearsal.ps1", "final execution plan generator"],
  [generator, "scripts/lidar-ingest-rehearsal.ps1", "final execution plan generator"],
  [generator, "scripts/db-field-rehearsal.ps1", "final execution plan generator"],
  [generator, "FIELD_REVIEWER", "final execution plan generator"],
  [generator, "FIELD_SITE_NAME", "final execution plan generator"],
  [generator, "--require-scanners", "final execution plan generator"],
  [runbook, "npm.cmd run final:execution-plan", "delivery runbook"],
  [runbook, "FIELD_REVIEWER", "delivery runbook"],
  [runbook, "FIELD_SITE_NAME", "delivery runbook"],
  [runbook, "source revision closeout", "delivery runbook"],
  [runbook, "verify:docs-text-quality", "delivery runbook"],
  [runbook, "ci:status", "delivery runbook"],
  [runbook, "git push origin dev", "delivery runbook"],
  [runbook, "field:gate-closure-map", "delivery runbook"],
  [runbook, "completion:audit", "delivery runbook"],
  [runbook, "handover:index", "delivery runbook"],
  [runbook, "field:closure-plan", "delivery runbook"],
  [runbook, "Field Action Artifact Actions", "delivery runbook"],
  [runbook, "artifacts/final-execution-plan/<timestamp>/manifest.json", "delivery runbook"],
  [checklist, "npm run final:execution-plan", "acceptance checklist"],
  [checklist, "source revision closeout", "acceptance checklist"],
  [checklist, "verify:docs-text-quality", "acceptance checklist"],
  [checklist, "ci:status", "acceptance checklist"],
  [checklist, "git push origin dev", "acceptance checklist"],
  [checklist, "Field Action Artifact Actions", "acceptance checklist"],
  [checklist, "Command Gate Coverage", "acceptance checklist"],
  [checklist, "artifacts/final-execution-plan/<timestamp>/manifest.json", "acceptance checklist"],
  [matrix, "final:execution-plan", "delivery evidence matrix"],
  [matrix, "source-revision-closeout", "delivery evidence matrix"],
  [matrix, "docs-text-quality", "delivery evidence matrix"],
  [matrix, "verify:docs-text-quality", "delivery evidence matrix"],
  [matrix, "ci:status", "delivery evidence matrix"],
  [matrix, "git push origin dev", "delivery evidence matrix"],
  [matrix, "Command Gate Coverage", "delivery evidence matrix"],
  [matrix, "strict `handover:package`", "delivery evidence matrix"],
  [matrix, "artifacts/final-execution-plan/<timestamp>/manifest.json", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const openPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  baseUrl: "http://field.local:8080",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      status: "FIELD_OR_SECURITY_REVIEW_REQUIRED",
      siteName: "field-site",
      remainingGates: [
        { actionType: "MANUAL_EVIDENCE_REQUIRED", category: "Manual Evidence", status: "MISSING", message: "Operator walkthrough missing.", closeWhen: "Attach evidence." },
        { actionType: "FIELD_ACTION_REQUIRED", category: "Control Board TCP", status: "DRY_RUN_SAFE", message: "Live TCP missing.", closeWhen: "Run rehearsal." },
        { actionType: "SECURITY_REVIEW_REQUIRED", category: "Security Evidence", status: "DELIVERY_FIX_REQUIRED", message: "Security delivery fix required.", closeWhen: "Fix findings and rerun scanners." },
        { actionType: "AUTOMATED_REFRESH_AVAILABLE", category: "Source Code State", status: "UNPUSHED", message: "Source revision needs push and evidence refresh.", closeWhen: "Push dev and regenerate final evidence." },
      ],
    },
  },
  closurePlan: { path: "artifacts/field-closure-plan/20260101-000000/manifest.json", data: {} },
  gateClosureMap: { path: "artifacts/field-gate-closure-map/20260101-000000/manifest.json", data: {} },
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
assert(
  openPlan.orderedCommands.some((item) => item.command.includes("FIELD_REVIEWER") && item.command.includes("FIELD_SITE_NAME")),
  "field execution commands should use concrete reviewer/site environment variables",
);
assert(
  openPlan.orderedCommands.every((item) => !item.command.includes("field-reviewer-name") && !item.command.includes("delivery-site-name")),
  "field execution commands must not emit copy-paste placeholder reviewer/site values",
);
assert(openPlan.remainingGateCount === 4, "execution plan should preserve remaining gate count");
assert(openPlan.git.upstream === "origin/dev", "execution plan should expose git upstream");
assert(openPlan.git.pushed === true, "execution plan should expose pushed source state");
assert(openPlan.commandGateCoverage.some((item) => item.id === "security-evidence" && item.gateCount === 1), "security command coverage should count matching security gates");
assert(
  openPlan.commandGateCoverage.some(
    (item) => item.id === "field-acceptance" && item.categories.includes("Control Board TCP") && item.statuses.includes("DRY_RUN_SAFE"),
  ),
  "field acceptance command coverage should expose matched field gate categories and statuses",
);
assert(
  openPlan.commandGateCoverage.some((item) => item.id === "manual-evidence-readiness" && item.categories.includes("Manual Evidence")),
  "manual evidence readiness coverage should expose manual evidence gates",
);
assert(openPlan.orderedCommands.some((item) => item.id === "manual-evidence-readiness"), "manual gate should include manual evidence readiness command");
assert(
  openPlan.orderedCommands.some(
    (item) => item.id === "manual-evidence-readiness" && item.command.includes("--generated-by=") && item.command.includes("--site-name="),
  ),
  "manual evidence readiness command should pass concrete reviewer/site metadata args",
);
assert(openPlan.orderedCommands.some((item) => item.id === "control-board-field-rehearsal"), "field gate should include control-board rehearsal command");
assert(openPlan.orderedCommands.some((item) => item.id === "security-evidence"), "security gate should include strict security evidence command");
assert(openPlan.gatesByActionType.SECURITY_REVIEW_REQUIRED.some((gate) => gate.status === "DELIVERY_FIX_REQUIRED"), "security delivery-fix status should be preserved in gate groups");
assert(openPlan.orderedCommands.some((item) => item.id === "field-gate-closure-map"), "open plan should include field gate closure map refresh command");
assert(openPlan.orderedCommands.some((item) => item.id === "handover-index"), "open plan should include handover index refresh command");
assert(openPlan.orderedCommands.some((item) => item.id === "field-closure-plan"), "open plan should include field closure plan refresh command");
assert(
  openPlan.orderedCommands.findIndex((item) => item.id === "completion-audit") <
    openPlan.orderedCommands.findIndex((item) => item.id === "handover-index") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "handover-index") <
    openPlan.orderedCommands.findIndex((item) => item.id === "field-closure-plan") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "field-closure-plan") <
    openPlan.orderedCommands.findIndex((item) => item.id === "handover-package"),
  "open plan should refresh completion audit, handover index, closure plan, then handover package in order",
);
assert(
    openPlan.orderedCommands.findIndex((item) => item.id === "source-revision-closeout") <
    openPlan.orderedCommands.findIndex((item) => item.id === "docs-text-quality") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "docs-text-quality") <
    openPlan.orderedCommands.findIndex((item) => item.id === "ci-closeout") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "ci-closeout") <
    openPlan.orderedCommands.findIndex((item) => item.id === "ci-status") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "ci-status") <
    openPlan.orderedCommands.findIndex((item) => item.id === "completion-audit"),
  "open plan should close source revision, verify docs text quality, run CI closeout, and record CI status before Git-bearing evidence refresh commands",
);
assert(openPlan.orderedCommands.some((item) => item.command.includes("http://field.local:8080")), "commands should use the requested base URL");
assert(openPlan.sourceFieldGateClosureMap.includes("artifacts/field-gate-closure-map"), "execution plan should reference gate closure map");

const openMarkdown = buildMarkdown(openPlan);
assert(openMarkdown.includes("Final Execution Plan"), "markdown should include title");
assert(openMarkdown.includes("This execution plan does not prove field completion"), "markdown should include guardrail");
assert(openMarkdown.includes("Ordered Commands"), "markdown should include ordered command table");
assert(openMarkdown.includes("Command Gate Coverage"), "markdown should include command gate coverage table");
assert(openMarkdown.includes("Git upstream: origin/dev"), "markdown should include git upstream");
assert(openMarkdown.includes("Git pushed to origin/dev: yes"), "markdown should include git pushed state");

const readyPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      status: "READY_TO_CLOSE",
      siteName: "delivery-site",
      remainingGates: [],
    },
  },
  manualEvidence: [],
});

assert(readyPlan.status === "READY_TO_CLOSE", "ready final status should produce READY_TO_CLOSE execution plan");
assert(readyPlan.canMarkGoalComplete === true, "ready execution plan should allow close");
assert(readyPlan.orderedCommands.length === 0, "ready execution plan should not invent commands");
assert(readyPlan.commandGateCoverage.length === 0, "ready execution plan should not invent command coverage");
const placeholderMetadataPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "field-reviewer",
  siteName: "field-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      status: "READY_TO_CLOSE",
      siteName: "field-site",
      remainingGates: [],
    },
  },
  manualEvidence: [],
});
assert(placeholderMetadataPlan.status === "OPEN", "placeholder execution-plan metadata should keep the plan open");
assert(placeholderMetadataPlan.canMarkGoalComplete === false, "placeholder execution-plan metadata must block goal completion");
assert(placeholderMetadataPlan.remainingGateCount === 2, "placeholder execution-plan metadata should add reviewer and site gates");
assert(
  placeholderMetadataPlan.gatesByActionType.FIELD_ACTION_REQUIRED.every((gate) => gate.status === "PLACEHOLDER_METADATA"),
  "placeholder execution-plan metadata should expose placeholder metadata gates",
);
const missingFinalStatusPlan = buildFinalExecutionPlan({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus: null,
  manualEvidence: [],
});
assert(missingFinalStatusPlan.status === "FINAL_STATUS_MISSING", "missing final status should be explicit");
assert(missingFinalStatusPlan.remainingGateCount === 1, "missing final status should create one planning gate");
assert(missingFinalStatusPlan.orderedCommands.some((item) => item.id === "final-status"), "missing final status should include final status command");
const automatedRefreshCommands = buildOrderedCommands([{ actionType: "AUTOMATED_REFRESH_AVAILABLE" }], "http://localhost:8080");
assert(
  automatedRefreshCommands.some((item) => item.id === "field-action-board"),
  "automated refresh gates should include field action board refresh",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "field-gate-closure-map"),
  "automated refresh gates should include field gate closure map refresh",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "field-owner-briefs"),
  "automated refresh gates should include field owner briefs refresh",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "source-revision-closeout"),
  "automated refresh gates should include source revision closeout",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "docs-text-quality"),
  "automated refresh gates should include docs text quality verification",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "ci-status"),
  "automated refresh gates should include CI status evidence",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "ci-closeout"),
  "automated refresh gates should include CI closeout",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "handover-index"),
  "automated refresh gates should include handover index refresh",
);
assert(
  automatedRefreshCommands.some((item) => item.id === "field-closure-plan"),
  "automated refresh gates should include field closure plan refresh",
);
assert(buildOrderedCommands([{ actionType: "REVIEW_REQUIRED" }], "http://localhost:8080").some((item) => item.id === "final-status"), "review gates should still include final status refresh");
assert(buildOrderedCommands([{ actionType: "REVIEW_REQUIRED" }], "http://localhost:8080").some((item) => item.id === "field-gate-closure-map"), "review gates should include gate closure map refresh");
assert(commandCatalog("http://localhost:8080").some((item) => item.id === "field-acceptance" && item.command.includes("-RequireScanners")), "catalog should include strict field acceptance command");
const directCoverage = buildCommandGateCoverage(
  [{ order: 1, id: "security-evidence", phase: "Security", command: "npm.cmd run security:evidence", actionTypes: ["SECURITY_REVIEW_REQUIRED"], doneWhen: "done" }],
  [
    { actionType: "SECURITY_REVIEW_REQUIRED", category: "Security Scanner Closeout", status: "BLOCKING", evidence: "artifacts/security/latest/manifest.json" },
    { actionType: "FIELD_ACTION_REQUIRED", category: "Control Board TCP", status: "LIVE_TCP_REVIEW", evidence: "artifacts/field-readiness/latest/manifest.json" },
  ],
);
assert(directCoverage[0].gateCount === 1, "direct command coverage should only count matching action types");
assert(directCoverage[0].categories.includes("Security Scanner Closeout"), "direct command coverage should retain matched categories");
assert(directCoverage[0].evidence.includes("artifacts/security/latest/manifest.json"), "direct command coverage should retain evidence paths");

console.log("final execution plan contracts ok");
