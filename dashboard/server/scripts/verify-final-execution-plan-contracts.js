const fs = require("fs");
const path = require("path");
const {
  buildFinalExecutionPlan,
  buildMarkdown,
  buildCommandGateCoverage,
  buildGateCommandHints,
  buildClosureBundles,
  buildOrderedCommands,
  buildRootCauseGroups,
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
  [generator, "sourceGateIds", "final execution plan generator"],
  [generator, "Source Gate IDs", "final execution plan generator"],
  [generator, "rootCauseGroups", "final execution plan generator"],
  [generator, "buildRootCauseGroups", "final execution plan generator"],
  [generator, "Root Cause Groups", "final execution plan generator"],
  [generator, "closureBundles", "final execution plan generator"],
  [generator, "buildClosureBundles", "final execution plan generator"],
  [generator, "Closure Bundles", "final execution plan generator"],
  [generator, "reviewerChecklist", "final execution plan generator"],
  [generator, "Reviewer Checklist", "final execution plan generator"],
  [generator, "Field Input And Risk Acceptance", "final execution plan generator"],
  [generator, "Runtime And Hardware Proof", "final execution plan generator"],
  [generator, "Security And CI Proof", "final execution plan generator"],
  [generator, "Final Handover Refresh", "final execution plan generator"],
  [generator, "Field Runtime And Hardware Rehearsal", "final execution plan generator"],
  [generator, "Delivery Environment Preflight", "final execution plan generator"],
  [generator, "field:env-closeout", "final execution plan generator"],
  [generator, "artifacts/field-env-closeout/<timestamp>/manifest.json", "final execution plan generator"],
  [generator, "Field environment closeout is READY_TO_CLOSE", "final execution plan generator"],
  [generator, "Manual Field Evidence", "final execution plan generator"],
  [generator, "Source Revision Closeout", "final execution plan generator"],
  [generator, "Field Readiness And Acceptance Summary", "final execution plan generator"],
  [generator, "evidenceTargets", "final execution plan generator"],
  [generator, "Evidence Targets", "final execution plan generator"],
  [generator, "artifacts/field-preflight/<timestamp>/manifest.json", "final execution plan generator"],
  [generator, "artifacts/manual/operator-ui-walkthrough.md", "final execution plan generator"],
  [generator, "commandHints", "final execution plan generator"],
  [generator, "buildGateCommandHints", "final execution plan generator"],
  [generator, "dockerFallbackCommand", "final execution plan generator"],
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
  [generator, "Create missing reviewer-fillable manual evidence drafts after the latest risk register rows are available", "final execution plan generator"],
  [generator, "risk-acceptance drafts include the latest copyable register rows", "final execution plan generator"],
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
  [runbook, "Closure Bundles", "delivery runbook"],
  [runbook, "Field Input And Risk Acceptance", "delivery runbook"],
  [runbook, "Runtime And Hardware Proof", "delivery runbook"],
  [runbook, "Security And CI Proof", "delivery runbook"],
  [runbook, "Final Handover Refresh", "delivery runbook"],
  [runbook, "artifacts/final-execution-plan/<timestamp>/manifest.json", "delivery runbook"],
  [checklist, "npm run final:execution-plan", "acceptance checklist"],
  [checklist, "source revision closeout", "acceptance checklist"],
  [checklist, "verify:docs-text-quality", "acceptance checklist"],
  [checklist, "ci:status", "acceptance checklist"],
  [checklist, "git push origin dev", "acceptance checklist"],
  [checklist, "Field Action Artifact Actions", "acceptance checklist"],
  [checklist, "Closure Bundles", "acceptance checklist"],
  [checklist, "Field Input And Risk Acceptance", "acceptance checklist"],
  [checklist, "Runtime And Hardware Proof", "acceptance checklist"],
  [checklist, "Security And CI Proof", "acceptance checklist"],
  [checklist, "Final Handover Refresh", "acceptance checklist"],
  [checklist, "Command Gate Coverage", "acceptance checklist"],
  [checklist, "artifacts/final-execution-plan/<timestamp>/manifest.json", "acceptance checklist"],
  [matrix, "final:execution-plan", "delivery evidence matrix"],
  [matrix, "source-revision-closeout", "delivery evidence matrix"],
  [matrix, "docs-text-quality", "delivery evidence matrix"],
  [matrix, "verify:docs-text-quality", "delivery evidence matrix"],
  [matrix, "ci:status", "delivery evidence matrix"],
  [matrix, "git push origin dev", "delivery evidence matrix"],
  [matrix, "Command Gate Coverage", "delivery evidence matrix"],
  [matrix, "Closure Bundles", "delivery evidence matrix"],
  [matrix, "Field Input And Risk Acceptance", "delivery evidence matrix"],
  [matrix, "Runtime And Hardware Proof", "delivery evidence matrix"],
  [matrix, "Security And CI Proof", "delivery evidence matrix"],
  [matrix, "Final Handover Refresh", "delivery evidence matrix"],
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
        { id: "final-manual-evidence", actionType: "MANUAL_EVIDENCE_REQUIRED", category: "Manual Evidence", status: "MISSING", message: "Operator walkthrough missing.", closeWhen: "Attach evidence." },
        { id: "final-control-board-tcp", actionType: "FIELD_ACTION_REQUIRED", category: "Control Board TCP", status: "DRY_RUN_SAFE", message: "Live TCP missing.", closeWhen: "Run rehearsal." },
        { id: "final-security-evidence", actionType: "SECURITY_REVIEW_REQUIRED", category: "Security Evidence", status: "DELIVERY_FIX_REQUIRED", message: "Security delivery fix required.", closeWhen: "Fix findings and rerun scanners." },
        { id: "final-source-revision", actionType: "AUTOMATED_REFRESH_AVAILABLE", category: "Source Code State", status: "UNPUSHED", message: "Source revision needs push and evidence refresh.", closeWhen: "Push dev and regenerate final evidence." },
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
assert(openPlan.rootCauseGroups.some((group) => group.id === "manual-field-evidence" && group.gateCount === 1), "manual evidence root cause should count manual gate");
assert(openPlan.rootCauseGroups.some((group) => group.id === "manual-field-evidence" && group.sourceGateIds.includes("final-manual-evidence")), "root cause groups should preserve source gate ids");
assert(openPlan.rootCauseGroups.some((group) => group.id === "field-runtime-rehearsal" && group.gateCount === 1), "field runtime root cause should count control-board gate");
assert(openPlan.rootCauseGroups.some((group) => group.id === "security-scanner-evidence" && group.gateCount === 1), "security root cause should count scanner gate");
assert(openPlan.rootCauseGroups.some((group) => group.id === "source-revision-closeout" && group.gateCount === 1), "source revision root cause should count source gate");
assert(openPlan.rootCauseGroups.some((group) => group.evidenceTargets?.length > 0), "root cause groups should expose evidence targets");
assert(openPlan.closureBundles.some((bundle) => bundle.id === "field-input-and-risk-acceptance" && bundle.gateCount === 1), "closure bundles should include manual field input bundle");
assert(openPlan.closureBundles.some((bundle) => bundle.id === "field-input-and-risk-acceptance" && bundle.sourceGateIds.includes("final-manual-evidence")), "closure bundles should preserve source gate ids");
assert(openPlan.closureBundles.some((bundle) => bundle.id === "runtime-and-hardware-proof" && bundle.gateCount === 1), "closure bundles should include runtime and hardware bundle");
assert(openPlan.closureBundles.some((bundle) => bundle.id === "security-and-ci-proof" && bundle.gateCount === 2), "closure bundles should include security and CI bundle");
assert(openPlan.closureBundles.some((bundle) => bundle.commandIds.includes("manual-evidence-readiness")), "closure bundles should expose command ids");
assert(
  openPlan.closureBundles.every((bundle) => bundle.commandIds.every((id) => bundle.commands.some((command) => command.id === id))),
  "closure bundles should include command detail rows for every closeout command id",
);
assert(
  openPlan.closureBundles.some((bundle) => bundle.id === "field-input-and-risk-acceptance" && bundle.commands.some((command) => command.id === "manual-evidence-drafts")),
  "field input bundle should include fallback manual evidence draft command details",
);
assert(openPlan.closureBundles.some((bundle) => bundle.commands.some((command) => command.id === "security-evidence")), "closure bundles should attach ordered command details");
assert(openPlan.closureBundles.every((bundle) => bundle.reviewerChecklist?.length > 0), "closure bundles should expose reviewer checklist rows");
assert(openPlan.git.upstream === "origin/dev", "execution plan should expose git upstream");
assert(openPlan.git.pushed === true, "execution plan should expose pushed source state");
assert(openPlan.commandGateCoverage.some((item) => item.id === "security-evidence" && item.gateCount === 1), "security command coverage should count matching security gates");
assert(openPlan.commandGateCoverage.some((item) => item.id === "security-evidence" && item.sourceGateIds.includes("final-security-evidence")), "command coverage should preserve source gate ids");
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
assert(openPlan.orderedCommands.some((item) => item.id === "field-risk-register"), "manual gate should include field risk register command");
assert(openPlan.orderedCommands.some((item) => item.id === "manual-evidence-drafts"), "manual gate should include manual evidence draft command");
assert(
  openPlan.orderedCommands.findIndex((item) => item.id === "field-risk-register") <
    openPlan.orderedCommands.findIndex((item) => item.id === "manual-evidence-drafts") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "manual-evidence-drafts") <
    openPlan.orderedCommands.findIndex((item) => item.id === "manual-evidence-readiness"),
  "open plan should create the risk register before manual evidence drafts, then validate manual evidence readiness",
);
assert(openPlan.orderedCommands.some((item) => item.id === "manual-evidence-readiness"), "manual gate should include manual evidence readiness command");
assert(
  openPlan.orderedCommands.some(
    (item) => item.id === "manual-evidence-readiness" && item.command.includes("--generated-by=") && item.command.includes("--site-name="),
  ),
  "manual evidence readiness command should pass concrete reviewer/site metadata args",
);
assert(openPlan.orderedCommands.some((item) => item.id === "control-board-field-rehearsal"), "field gate should include control-board rehearsal command");
assert(
  openPlan.orderedCommands.some((item) => item.id === "control-board-field-rehearsal" && item.command.includes("-AllowLiveTcp")),
  "final live TCP closeout command should include explicit -AllowLiveTcp approval switch",
);
assert(openPlan.orderedCommands.some((item) => item.id === "field-env-closeout"), "field gates should include env closeout command");
assert(
  openPlan.orderedCommands.findIndex((item) => item.id === "field-readiness") <
    openPlan.orderedCommands.findIndex((item) => item.id === "field-env-closeout") &&
    openPlan.orderedCommands.findIndex((item) => item.id === "field-env-closeout") <
    openPlan.orderedCommands.findIndex((item) => item.id === "field-preflight"),
  "open plan should run readiness, env closeout, then strict preflight for .env gates",
);
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
assert(openMarkdown.includes("Root Cause Groups"), "markdown should include root cause group table");
assert(openMarkdown.includes("Closure Bundles"), "markdown should include closure bundle table");
assert(openMarkdown.includes("Field Input And Risk Acceptance"), "markdown should include field input closure bundle");
assert(openMarkdown.includes("Reviewer Checklist"), "markdown should include reviewer checklist column");
assert(openMarkdown.includes("Evidence Targets"), "markdown should include evidence target column");
assert(openMarkdown.includes("Command Gate Coverage"), "markdown should include command gate coverage table");
assert(openMarkdown.includes("Source Gate IDs"), "markdown should include source gate id columns");
assert(openMarkdown.includes("final-control-board-tcp"), "markdown should include source final-status gate ids");
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
assert(readyPlan.rootCauseGroups.length === 0, "ready execution plan should not invent root causes");
assert(readyPlan.closureBundles.length === 0, "ready execution plan should not invent closure bundles");
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
assert(commandCatalog("http://localhost:8080").some((item) => item.id === "ci-closeout" && item.purpose.includes("approved external CI closeout window")), "CI closeout command should require the approved external CI closeout window");
const directCoverage = buildCommandGateCoverage(
  [{ order: 1, id: "security-evidence", phase: "Security", command: "npm.cmd run security:evidence", actionTypes: ["SECURITY_REVIEW_REQUIRED"], doneWhen: "done" }],
  [
    {
      actionType: "SECURITY_REVIEW_REQUIRED",
      category: "Security Scanner Closeout",
      status: "BLOCKING",
      evidence: "artifacts/security/latest/manifest.json",
      scanner: "gitleaks",
      closeoutCommands: {
        nativeCommand: "gitleaks detect --source . --redact",
        dockerFallbackCommand: "npm.cmd run security:evidence -- --require-scanners --use-docker-scanners",
        riskAcceptanceEvidence: "artifacts/manual/field-risk-acceptance.md",
      },
      dockerScannerRuntime: {
        ready: false,
        error: "Docker daemon is not reachable.",
      },
    },
    { actionType: "FIELD_ACTION_REQUIRED", category: "Control Board TCP", status: "LIVE_TCP_REVIEW", evidence: "artifacts/field-readiness/latest/manifest.json" },
  ],
);
const rootCauseGroups = buildRootCauseGroups([
  { id: "final-jwt", actionType: "FIELD_ACTION_REQUIRED", category: "Field Evidence", status: "REVIEW", message: "Field Preflight: JWT secret placeholder", evidence: "artifacts/field-preflight/latest/manifest.json" },
  { id: "final-env-closeout", actionType: "FIELD_ACTION_REQUIRED", category: "Field Env Closeout", status: "OPEN", message: "Field environment closeout has 3 open .env item(s).", evidence: "artifacts/field-env-closeout/latest/manifest.json" },
  { id: "final-operator-ui", actionType: "MANUAL_EVIDENCE_REQUIRED", category: "Manual Evidence", status: "INVALID", message: "Operator UI Walkthrough evidence is INVALID", evidence: "artifacts/manual/operator-ui-walkthrough.md" },
  { id: "final-ci-status", actionType: "REVIEW_REQUIRED", category: "CI Status", status: "REVIEW", message: "No CI workflow run was found for branch dev.", evidence: "artifacts/ci-status/latest/manifest.json" },
  { id: "final-field-acceptance", actionType: "FIELD_ACTION_REQUIRED", category: "Field Acceptance", status: "REVIEW", message: "Field acceptance status is REVIEW.", evidence: "artifacts/field-acceptance/latest/manifest.json" },
  { id: "final-handover-package", actionType: "REVIEW_REQUIRED", category: "Handover Package", status: "REVIEW", message: "handover package status is REVIEW.", evidence: "artifacts/handover-package/latest/manifest.json" },
]);
const closureBundles = buildClosureBundles(rootCauseGroups, commandCatalog("http://localhost:8080").map((item, index) => ({ order: index + 1, ...item })));
assert(closureBundles.some((bundle) => bundle.id === "field-input-and-risk-acceptance" && bundle.rootCauseIds.includes("manual-field-evidence")), "closure bundles should map manual root causes");
assert(closureBundles.some((bundle) => bundle.id === "field-input-and-risk-acceptance" && bundle.sourceGateIds.includes("final-operator-ui")), "closure bundles should preserve root-cause source gate ids");
assert(closureBundles.some((bundle) => bundle.id === "final-handover-refresh" && bundle.rootCauseIds.length > 0), "closure bundles should map final handover root causes");
assert(
  closureBundles.some((bundle) => bundle.id === "final-handover-refresh" && bundle.commands.some((command) => command.id === "final-execution-plan")),
  "final handover refresh bundle should include final execution plan command details",
);
assert(closureBundles.every((bundle) => bundle.evidenceTargets.length > 0), "closure bundles should expose evidence targets");
assert(closureBundles.every((bundle) => bundle.reviewerChecklist.length >= 3), "closure bundles should include reviewer handoff checklists");
assert(
  closureBundles.every((bundle) => bundle.commandIds.every((id) => bundle.commands.some((command) => command.id === id))),
  "closure bundles should include command detail rows for every closeout command id",
);
assert(
  closureBundles.some((bundle) => bundle.reviewerChecklist.some((item) => item.includes("canMarkGoalComplete"))),
  "closure bundles should include final reviewer completion checklist wording",
);
assert(rootCauseGroups.some((group) => group.id === "delivery-env-preflight" && group.closeoutCommandIds.includes("field-preflight")), "root cause groups should expose preflight closeout commands");
assert(rootCauseGroups.some((group) => group.id === "delivery-env-preflight" && group.closeoutCommandIds.includes("field-env-closeout")), "root cause groups should expose env closeout commands");
assert(rootCauseGroups.some((group) => group.id === "delivery-env-preflight" && group.evidenceTargets.includes("artifacts/field-env-closeout/<timestamp>/manifest.json")), "root cause groups should expose env closeout evidence targets");
assert(rootCauseGroups.some((group) => group.id === "manual-field-evidence" && group.owner === "Field Operations"), "root cause groups should expose manual evidence owner");
assert(rootCauseGroups.some((group) => group.id === "external-ci-evidence" && group.closeWhen.includes("GitHub Actions CI")), "root cause groups should expose external CI close condition");
assert(rootCauseGroups.some((group) => group.id === "field-readiness-acceptance" && group.evidenceTargets.includes("artifacts/field-acceptance/<timestamp>/manifest.json")), "root cause groups should expose field acceptance evidence target");
const fallbackClosureBundles = buildClosureBundles(
  rootCauseGroups,
  [{ id: "final-status", order: 1, phase: "Final Decision", command: "npm.cmd run final:status", doneWhen: "ready", actionTypes: ["REVIEW_REQUIRED"] }],
  "http://localhost:9090",
);
assert(
  fallbackClosureBundles.some((bundle) => bundle.commandIds.includes("manual-evidence-drafts") && bundle.commands.some((command) => command.id === "manual-evidence-drafts" && command.command.includes("http://localhost:9090"))),
  "closure bundles should fall back to command catalog details for command ids missing from ordered commands",
);
assert(directCoverage[0].gateCount === 1, "direct command coverage should only count matching action types");
assert(directCoverage[0].categories.includes("Security Scanner Closeout"), "direct command coverage should retain matched categories");
assert(directCoverage[0].evidence.includes("artifacts/security/latest/manifest.json"), "direct command coverage should retain evidence paths");
assert(
  directCoverage[0].commandHints.some(
    (item) =>
      item.source === "Security Scanner Closeout:gitleaks" &&
      item.dockerFallbackCommand.includes("--use-docker-scanners") &&
      item.riskAcceptanceEvidence === "artifacts/manual/field-risk-acceptance.md" &&
      item.runtimeNote.includes("Docker daemon"),
  ),
  "direct command coverage should retain scanner closeout commands and Docker runtime notes",
);
assert(
  buildGateCommandHints([
    {
      category: "Security Scanner Closeout",
      scanner: "gitleaks",
      closeoutCommands: { nativeCommand: "gitleaks detect", dockerFallbackCommand: "npm.cmd run security:evidence -- --use-docker-scanners" },
    },
  ]).length === 1,
  "scanner closeout gate hints should be extractable",
);
assert(
  buildMarkdown({
    ...openPlan,
    commandGateCoverage: directCoverage,
  }).includes("--use-docker-scanners"),
  "execution plan markdown should include scanner fallback command hints",
);

console.log("final execution plan contracts ok");
