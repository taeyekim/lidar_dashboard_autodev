const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  buildMarkdown,
  buildSteps,
} = require("./generate-final-closeout-refresh");

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
const generator = readProjectFile("dashboard/server/scripts/generate-final-closeout-refresh.js");

[
  [packageJson, "final:refresh", "root package scripts"],
  [packageJson, "verify:final-refresh", "root package scripts"],
  [packageJson, "verify-final-closeout-refresh-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-closeout-refresh-contracts.js", "server verify chain"],
  [generator, "artifacts/final-closeout-refresh", "final closeout refresh generator"],
  [generator, "externalCiDispatch: false", "final closeout refresh generator"],
  [generator, "skip-field-acceptance", "final closeout refresh generator"],
  [generator, "REVIEW_RECORDED", "final closeout refresh generator"],
  [generator, "OPEN_GATES", "final closeout refresh generator"],
  [generator, "latestFinalStatus", "final closeout refresh generator"],
  [generator, "latestHandoverPackage", "final closeout refresh generator"],
  [generator, "latestFinalExecutionPlan", "final closeout refresh generator"],
  [generator, "latestFinalBundleHandoff", "final closeout refresh generator"],
  [generator, "latestFinalGateClassification", "final closeout refresh generator"],
  [generator, "refreshOnlyCount", "final closeout refresh generator"],
  [generator, "Can mark goal complete", "final closeout refresh generator"],
  [generator, "acceptReviewExitCodes", "final closeout refresh generator"],
  [generator, "acceptTimeoutAsReview", "final closeout refresh generator"],
  [generator, "timeoutMs", "final closeout refresh generator"],
  [generator, "Step exceeded", "final closeout refresh generator"],
  [generator, "manual:evidence-readiness", "final closeout refresh generator"],
  [generator, "ci:status", "final closeout refresh generator"],
  [generator, "security:evidence", "final closeout refresh generator"],
  [generator, "--include-container-images", "final closeout refresh generator"],
  [generator, "--include-zap", "final closeout refresh generator"],
  [generator, "--require-scanners", "final closeout refresh generator"],
  [generator, "--use-docker-scanners", "final closeout refresh generator"],
  [generator, "preserving scanner blockers as review evidence", "final closeout refresh generator"],
  [generator, "runtime:evidence", "final closeout refresh generator"],
  [generator, "--run-smoke", "final closeout refresh generator"],
  [generator, "--use-existing-stack", "final closeout refresh generator"],
  [generator, "field:preflight", "final closeout refresh generator"],
  [generator, "field:readiness", "final closeout refresh generator"],
  [generator, "field:env-closeout", "final closeout refresh generator"],
  [generator, "redacted owner closeout board", "final closeout refresh generator"],
  [generator, "field:rehearsal-unavailable", "final closeout refresh generator"],
  [generator, "temporary local refresh evidence", "final closeout refresh generator"],
  [generator, "completion:audit", "final closeout refresh generator"],
  [generator, "handover:index", "final closeout refresh generator"],
  [generator, "field:closure-plan", "final closeout refresh generator"],
  [generator, "handover:package", "final closeout refresh generator"],
  [generator, "final:status", "final closeout refresh generator"],
  [generator, "field:risk-register", "final closeout refresh generator"],
  [generator, "field:action-board", "final closeout refresh generator"],
  [generator, "field:gate-closure-map", "final closeout refresh generator"],
  [generator, "field:owner-briefs", "final closeout refresh generator"],
  [generator, "final:execution-plan", "final closeout refresh generator"],
  [generator, "final:bundle-handoff", "final closeout refresh generator"],
  [generator, "final:gate-classification", "final closeout refresh generator"],
  [generator, "handover-package-final-index", "final closeout refresh generator"],
  [generator, "final-status-final-index", "final closeout refresh generator"],
  [generator, "final-execution-plan-final-index", "final closeout refresh generator"],
  [generator, "final-bundle-handoff-final-index", "final closeout refresh generator"],
  [generator, "final-gate-classification-final-index", "final closeout refresh generator"],
  [generator, "evidenceRefs.finalBundleHandoff points to the latest final-bundle-handoff manifest", "final closeout refresh generator"],
  [generator, "evidenceRefs.handoverPackage points to the latest handover-package manifest", "final closeout refresh generator"],
  [generator, "sourceFinalStatus points to final-status-final-index", "final closeout refresh generator"],
  [generator, "sourceFinalExecutionPlan points to final-execution-plan-final-index", "final closeout refresh generator"],
  [generator, "routing evidence for auto-mode triage", "final closeout refresh generator"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const steps = buildSteps({
  baseUrl: "http://field.local:8080",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  includeFieldAcceptance: true,
});

const ids = steps.map((step) => step.id);
[
  "manual-evidence-readiness",
  "ci-status",
  "security-evidence",
  "runtime-evidence",
  "field-preflight",
  "field-readiness",
  "field-env-closeout",
  "field-rehearsal-unavailable",
  "field-acceptance",
  "completion-audit-pass-1",
  "handover-index-pass-1",
  "field-closure-plan-pass-1",
  "handover-package-pass-1",
  "final-status-pass-1",
  "field-risk-register",
  "field-action-board",
  "field-gate-closure-map",
  "field-owner-briefs",
  "handover-package-pass-2",
  "final-status-pass-2",
  "final-execution-plan",
  "final-bundle-handoff",
  "final-gate-classification",
  "handover-package-final-index",
  "final-status-final-index",
  "final-execution-plan-final-index",
  "final-bundle-handoff-final-index",
  "final-gate-classification-final-index",
].forEach((id) => assert(ids.includes(id), `steps should include ${id}`));

assert(
  ids.indexOf("final-status-pass-1") < ids.indexOf("field-action-board") &&
    ids.indexOf("field-action-board") < ids.indexOf("handover-package-pass-2") &&
    ids.indexOf("handover-package-pass-2") < ids.indexOf("final-status-pass-2") &&
    ids.indexOf("final-status-pass-2") < ids.indexOf("final-execution-plan") &&
    ids.indexOf("final-execution-plan") < ids.indexOf("final-bundle-handoff") &&
    ids.indexOf("final-bundle-handoff") < ids.indexOf("final-gate-classification") &&
    ids.indexOf("final-gate-classification") < ids.indexOf("handover-package-final-index") &&
    ids.indexOf("handover-package-final-index") < ids.indexOf("final-status-final-index") &&
    ids.indexOf("final-status-final-index") < ids.indexOf("final-execution-plan-final-index") &&
    ids.indexOf("final-execution-plan-final-index") < ids.indexOf("final-bundle-handoff-final-index") &&
    ids.indexOf("final-bundle-handoff-final-index") < ids.indexOf("final-gate-classification-final-index") &&
    ids.indexOf("final-status-final-index") < ids.indexOf("final-gate-classification-final-index"),
  "refresh should converge final status, action artifacts, handover package, final status, execution plan, bundle handoff, gate classification, final handover package index, final status, final execution plan, final bundle handoff, then final gate classification",
);
assert(
  ids.indexOf("field-readiness") < ids.indexOf("field-env-closeout") &&
    ids.indexOf("field-env-closeout") < ids.indexOf("field-rehearsal-unavailable") &&
    ids.indexOf("field-rehearsal-unavailable") < ids.indexOf("completion-audit-pass-1"),
  "refresh should turn readiness env gaps into a closeout board, then record unavailable field rehearsal evidence before completion audit",
);
assert(
  ids.indexOf("security-evidence") < ids.indexOf("runtime-evidence") &&
    ids.indexOf("runtime-evidence") < ids.indexOf("field-readiness"),
  "refresh should record strict security and runtime evidence before field readiness",
);
assert(
  steps.find((step) => step.id === "ci-status").command.includes("npm"),
  "CI status step should record CI evidence through npm",
);
assert(
  !steps.some((step) => step.command.includes("ci:closeout") || step.args.includes("--dispatch")),
  "refresh must not dispatch external CI",
);
assert(
  steps.find((step) => step.id === "field-acceptance").acceptReviewExitCodes.includes(1),
  "field acceptance REVIEW exit should be recorded without failing refresh",
);
assert(
  steps.find((step) => step.id === "field-acceptance-carry-forward").acceptReviewExitCodes.includes(1),
  "field acceptance carry-forward runtime-change exit should be recorded without failing refresh",
);
assert(
  steps.find((step) => step.id === "security-evidence").acceptReviewExitCodes.includes(1),
  "strict security REVIEW exit should be recorded without failing refresh",
);
assert(
  steps.find((step) => step.id === "security-evidence").acceptTimeoutAsReview === true,
  "strict security timeout should be recorded without failing refresh",
);
assert(
  steps.find((step) => step.id === "security-evidence").timeoutMs > 0,
  "strict security refresh should define a bounded timeout",
);
assert(
  steps.find((step) => step.id === "security-evidence").args.includes("--require-scanners"),
  "security refresh should require scanners",
);
assert(
  steps.find((step) => step.id === "security-evidence").args.includes("--use-docker-scanners"),
  "security refresh should use Docker scanner fallback when available",
);
assert(
  steps.find((step) => step.id === "runtime-evidence").args.includes("--run-smoke"),
  "runtime refresh should run smoke checks",
);
assert(
  !buildSteps({
    baseUrl: "http://field.local:8080",
    generatedBy: "reviewer-a",
    siteName: "delivery-site",
    includeFieldAcceptance: false,
  })
    .map((step) => step.id)
    .includes("field-acceptance"),
  "field acceptance should be explicitly skippable for quick refresh runs",
);
assert(
  steps.find((step) => step.id === "field-preflight").args.includes("http://field.local:8080"),
  "field preflight should use requested base URL",
);

const manifest = buildManifest(
  {
    baseUrl: "http://field.local:8080",
    generatedBy: "reviewer-a",
    siteName: "delivery-site",
    includeFieldAcceptance: true,
  },
  [
    {
      order: 1,
      id: "field-acceptance",
      phase: "Pre Evidence",
      command: "npm.cmd run field:acceptance",
      status: "REVIEW_RECORDED",
      exitCode: 1,
      acceptedReviewExitCodes: [1],
      logPath: "artifacts/final-closeout-refresh/example/01-field-acceptance.log",
      purpose: "Record review.",
      doneWhen: "PASS.",
    },
  ],
);

assert(manifest.status === "OPEN_GATES", "accepted review exits should keep refresh open until final status is ready");
assert(manifest.canMarkGoalComplete === false, "open refresh should not allow goal completion");
assert(manifest.reviewRecordedStepCount === 1, "manifest should count review-recorded steps");
assert(manifest.externalCiDispatch === false, "manifest should record that external CI dispatch did not occur");
assert(manifest.latestFinalStatus, "manifest should include latest final status summary");
assert(manifest.latestHandoverPackage, "manifest should include latest handover package summary");
assert(manifest.latestFinalExecutionPlan, "manifest should include latest final execution plan summary");
assert(manifest.latestFinalBundleHandoff, "manifest should include latest final bundle handoff summary");
assert(manifest.latestFinalGateClassification, "manifest should include latest final gate classification summary");

const failedManifest = buildManifest(
  {
    baseUrl: "http://field.local:8080",
    generatedBy: "reviewer-a",
    siteName: "delivery-site",
    includeFieldAcceptance: false,
  },
  [
    {
      order: 1,
      id: "security-evidence",
      phase: "Pre Evidence",
      command: "npm.cmd run security:evidence",
      status: "FAIL",
      exitCode: 1,
      acceptedReviewExitCodes: [],
      logPath: "artifacts/final-closeout-refresh/example/01-security-evidence.log",
      purpose: "Record security.",
      doneWhen: "PASS.",
    },
  ],
);

assert(failedManifest.status === "FAILED", "failed steps should fail refresh manifest");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Final Closeout Refresh"), "markdown should include title");
assert(markdown.includes("This refresh does not dispatch external GitHub Actions"), "markdown should include external CI guardrail");
assert(markdown.includes("OPEN_GATES"), "markdown should include open gate status");
assert(markdown.includes("Latest final status"), "markdown should include latest final status summary");
assert(markdown.includes("Latest handover package"), "markdown should include latest handover package summary");
assert(markdown.includes("Latest final bundle handoff"), "markdown should include latest final bundle handoff summary");
assert(markdown.includes("Latest final gate classification"), "markdown should include latest final gate classification summary");
assert(
  markdown.includes("authoritative latest final-bundle-handoff pointer"),
  "markdown should identify final closeout refresh as the latest bundle pointer",
);
assert(
  markdown.includes("routing evidence for auto-mode triage"),
  "markdown should explain gate classification is routing evidence",
);

console.log("final closeout refresh contracts ok");
