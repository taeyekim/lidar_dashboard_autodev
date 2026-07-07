const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { buildGitState } = require("./generate-final-status-report");
const { DEFAULT_FIELD_BASE_URL, resolveFieldBaseUrl } = require("./field-env");

const root = path.join(__dirname, "..", "..", "..");
const HANDOVER_PACKAGE_TIMEOUT_MS = 900000;
const FIELD_REFRESH_DEFAULTS = Object.freeze({
  baseUrl: DEFAULT_FIELD_BASE_URL,
  unavailableReason: "Delivery runtime or field hardware is unavailable in this local closeout refresh.",
  replacementOwner: "field-owner",
  targetRecheckDate: "2026-08-01",
  approvalNote: "temporary local refresh evidence",
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function runStep(step, outputDir) {
  const startedAt = new Date();
  const timeoutMs = step.timeoutMs || 600000;
  const result = spawnSync(step.command, step.args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: timeoutMs,
  });
  const timedOut = result.error?.code === "ETIMEDOUT";
  if (timedOut && process.platform === "win32" && result.pid) {
    spawnSync("taskkill", ["/PID", String(result.pid), "/T", "/F"], { encoding: "utf8" });
  }
  const exitCode = timedOut ? 124 : result.status ?? (result.error ? 1 : 0);
  const accepted = exitCode === 0 || (step.acceptReviewExitCodes || []).includes(exitCode) || (timedOut && step.acceptTimeoutAsReview === true);
  const status = exitCode === 0 ? "PASS" : accepted ? "REVIEW_RECORDED" : "FAIL";
  const logPath = path.join(outputDir, `${String(step.order).padStart(2, "0")}-${step.id}.log`);
  fs.writeFileSync(
    logPath,
    [
      `$ ${commandLine(step.command, step.args)}`,
      "",
      "## stdout",
      result.stdout || "",
      "",
      "## stderr",
      result.stderr || "",
      timedOut ? `\n## timeout\nStep exceeded ${timeoutMs}ms and was recorded as ${status}.` : "",
      result.error ? `\n## error\n${result.error.message}` : "",
    ].join("\n"),
  );
  return {
    order: step.order,
    id: step.id,
    phase: step.phase,
    command: commandLine(step.command, step.args),
    status,
    exitCode,
    acceptedReviewExitCodes: step.acceptReviewExitCodes || [],
    acceptTimeoutAsReview: step.acceptTimeoutAsReview === true,
    timeoutMs,
    timedOut,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    logPath: path.relative(root, logPath).replace(/\\/g, "/"),
    purpose: step.purpose,
    doneWhen: step.doneWhen,
  };
}

function buildSteps(options) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const ps = "powershell.exe";
  const baseUrl = options.baseUrl;
  const reviewer = options.generatedBy;
  const siteName = options.siteName;
  const unavailableReason = process.env.FIELD_REHEARSAL_UNAVAILABLE_REASON || FIELD_REFRESH_DEFAULTS.unavailableReason;
  const replacementOwner = process.env.FIELD_REHEARSAL_REPLACEMENT_OWNER || FIELD_REFRESH_DEFAULTS.replacementOwner;
  const targetRecheckDate = process.env.FIELD_REHEARSAL_TARGET_RECHECK_DATE || FIELD_REFRESH_DEFAULTS.targetRecheckDate;
  const approvalNote = process.env.FIELD_REHEARSAL_APPROVAL_NOTE || FIELD_REFRESH_DEFAULTS.approvalNote;
  const steps = [
    {
      id: "manual-evidence-readiness",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "manual:evidence-readiness", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh manual evidence readiness before completion audit.",
      doneWhen: "Manual evidence readiness is READY or lists exact open manual fields.",
    },
    {
      id: "ci-status",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "ci:status", "--", `--generated-by=${reviewer}`],
      purpose: "Record GitHub Actions status without dispatching external CI.",
      doneWhen: "CI status evidence is PASS for the pushed dev commit, or review reason is explicit.",
    },
    {
      id: "security-evidence",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "security:evidence", "--", "--include-container-images", "--include-zap", "--require-scanners", "--use-docker-scanners", `--target-url=${baseUrl}`],
      acceptReviewExitCodes: [1],
      acceptTimeoutAsReview: true,
      timeoutMs: 600000,
      purpose: "Refresh strict security evidence, preserving scanner blockers as review evidence instead of stopping closeout refresh.",
      doneWhen: "Required scanner evidence is PASS, or the latest security manifest lists exact blocking scanners and closeout commands.",
    },
    {
      id: "runtime-evidence",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "runtime:evidence", "--", "--run-smoke", "--use-existing-stack", `--base-url=${baseUrl}`],
      purpose: "Refresh runtime smoke evidence against the delivery Nginx entrypoint before readiness and handover packaging.",
      doneWhen: "Runtime evidence has no failed required delivery checks for health, headers, API, statistics, and control-board status.",
    },
    {
      id: "delivery-evidence",
      phase: "Pre Evidence",
      command: npm,
      args: [
        "run",
        "delivery:evidence",
        "--",
        "--run-smoke",
        "--use-existing-stack",
        "--include-container-images",
        "--include-zap",
        "--require-scanners",
        "--use-docker-scanners",
        `--base-url=${baseUrl}`,
        `--target-url=${baseUrl}`,
      ],
      acceptReviewExitCodes: [1],
      acceptTimeoutAsReview: true,
      timeoutMs: 900000,
      purpose: "Refresh the handover delivery evidence with the same strict runtime and scanner options used by final closeout.",
      doneWhen: "Delivery evidence companion runtime/security summaries have zero REVIEW/SKIPPED items.",
    },
    {
      id: "field-preflight",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "field:preflight", "--", "-BaseUrl", baseUrl, "-Reviewer", reviewer, "-SiteName", siteName],
      purpose: "Refresh .env, auth cookie, device key, Swagger, Nginx, and control-board TCP preflight evidence.",
      doneWhen: "Field preflight is PASS or closeoutChecklist lists all open REVIEW/SKIPPED checks.",
    },
    {
      id: "field-readiness",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "field:readiness", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh delivery readiness, runtime, env, scanner, and control-board safety summary.",
      doneWhen: "Field readiness is PASS or lists exact owner actions.",
    },
    {
      id: "field-env-closeout",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "field:env-closeout", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Convert latest field readiness .env gaps into a redacted owner closeout board.",
      doneWhen: "Field environment closeout is READY_TO_CLOSE or lists exact owner/key actions without secret values.",
    },
    {
      id: "field-rehearsal-unavailable",
      phase: "Pre Evidence",
      command: npm,
      args: [
        "run",
        "field:rehearsal-unavailable",
        "--",
        `--reason=${unavailableReason}`,
        `--reviewer=${reviewer}`,
        `--site-name=${siteName}`,
        `--replacement-owner=${replacementOwner}`,
        `--target-recheck-date=${targetRecheckDate}`,
        `--approval-note=${approvalNote}`,
      ],
      purpose: "Refresh unavailable DB, LiDAR, and control-board rehearsal REVIEW evidence for the current source revision.",
      doneWhen: "Unavailable rehearsal manifests are current, or PASS rehearsal manifests replace them.",
    },
  ];

  if (options.includeFieldAcceptance) {
    steps.push({
      id: "field-acceptance",
      phase: "Pre Evidence",
      command: npm,
      args: [
        "run",
        "field:acceptance",
        "--",
        "-BaseUrl",
        baseUrl,
        "-Reviewer",
        reviewer,
        "-SiteName",
        siteName,
        "-OperatorUiWalkthroughEvidence",
        "artifacts/manual/operator-ui-walkthrough.md",
        "-SkipRuntime",
        "-SkipDb",
        "-SkipLidar",
        "-SkipControlBoard",
        "-SkipSecurity",
        "-SkipDeliveryEvidence",
      ],
      acceptReviewExitCodes: [1],
      acceptTimeoutAsReview: true,
      timeoutMs: 180000,
      purpose: "Record field acceptance REVIEW/SKIPPED state without requiring unavailable field hardware.",
      doneWhen: "Field acceptance is PASS after strict field evidence exists, or current REVIEW manifest is available.",
    });
    steps.push({
      id: "field-acceptance-carry-forward",
      phase: "Pre Evidence",
      command: npm,
      args: ["run", "field:acceptance-carry-forward", "--", `--base-url=${baseUrl}`],
      acceptReviewExitCodes: [1],
      purpose: "Record current-commit carry-forward evidence for an earlier PASS field acceptance when runtime sources did not change.",
      doneWhen: "Carry-forward PASS evidence exists for the current clean dev commit, or REVIEW records that runtime sources changed and full field acceptance must be rerun.",
    });
  }

  steps.push(
    {
      id: "completion-audit-pass-1",
      phase: "Package Refresh",
      command: npm,
      args: ["run", "completion:audit"],
      purpose: "Recompute completion blockers from latest field/manual/security evidence.",
      doneWhen: "Completion audit reflects the latest pre-evidence manifests.",
    },
    {
      id: "handover-index-pass-1",
      phase: "Package Refresh",
      command: npm,
      args: ["run", "handover:index", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Index the latest evidence before closure planning.",
      doneWhen: "Handover index references current evidence manifests.",
    },
    {
      id: "field-closure-plan-pass-1",
      phase: "Package Refresh",
      command: npm,
      args: ["run", "field:closure-plan", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Build the closure plan from latest completion audit and handover index.",
      doneWhen: "Closure plan lists current blockers and next actions.",
    },
    {
      id: "handover-package-pass-1",
      phase: "Package Refresh",
      command: npm,
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`, "--reuse-existing-evidence"],
      timeoutMs: HANDOVER_PACKAGE_TIMEOUT_MS,
      purpose: "Package the latest evidence before final status.",
      doneWhen: "Handover package has current field/manual/security refs.",
    },
    {
      id: "final-status-pass-1",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:status", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Create final status for the first refreshed package pass.",
      doneWhen: "Final status exposes current remaining gates.",
    },
    {
      id: "field-risk-register",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:risk-register", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh risk register from latest final status gates.",
      doneWhen: "Risk register rows match latest final status.",
    },
    {
      id: "field-action-board",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:action-board", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh owner/priority action board from latest final status gates.",
      doneWhen: "Action board sourceFinalStatus points to latest final status pass.",
    },
    {
      id: "field-gate-closure-map",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:gate-closure-map", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh command-to-gate closure map from latest action board.",
      doneWhen: "Gate closure map source action board is current.",
    },
    {
      id: "field-owner-briefs",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:owner-briefs", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh owner briefs from latest action board.",
      doneWhen: "Owner briefs source action board is current.",
    },
    {
      id: "handover-package-pass-2",
      phase: "Package Refresh",
      command: npm,
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`, "--reuse-existing-evidence"],
      timeoutMs: HANDOVER_PACKAGE_TIMEOUT_MS,
      purpose: "Repackage after field action artifacts are refreshed.",
      doneWhen: "Handover package references latest field action artifacts.",
    },
    {
      id: "final-status-pass-2",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:status", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Create final status after action artifacts and handover package converge.",
      doneWhen: "Final status references latest handover package and action artifacts.",
    },
    {
      id: "final-execution-plan",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:execution-plan", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Create final execution plan from the latest final status.",
      doneWhen: "Final execution plan sourceFinalStatus points to final-status-pass-2.",
    },
    {
      id: "final-bundle-handoff",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:bundle-handoff", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Split final execution plan closure bundles into reviewer-facing handoff files.",
      doneWhen: "Bundle handoff files exist for every open closure bundle and point to the latest final execution plan.",
    },
    {
      id: "final-gate-classification",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:gate-classification", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Classify remaining final-status gates into local, conditional, field, hardware, security, CI, and reviewer buckets.",
      doneWhen: "Gate classification points to the latest final status and identifies what Codex may continue without fabricating field evidence.",
    },
    {
      id: "handover-package-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`, "--reuse-existing-evidence"],
      timeoutMs: HANDOVER_PACKAGE_TIMEOUT_MS,
      purpose: "Repackage the handover bundle after final bundle handoff is generated so the delivery package indexes the latest reviewer-facing closeout files.",
      doneWhen: "Handover package evidenceRefs.finalBundleHandoff points to the latest final-bundle-handoff manifest.",
    },
    {
      id: "final-status-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:status", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh final status after the final handover package index so remaining gates point at the latest handover manifest.",
      doneWhen: "Final status evidenceRefs.handoverPackage points to the latest handover-package manifest.",
    },
    {
      id: "field-risk-register-final-index",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:risk-register", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh risk register once more from the final indexed final-status gate set.",
      doneWhen: "Risk register counts match final-status-final-index remaining gates.",
    },
    {
      id: "field-action-board-final-index",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:action-board", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh action board once more from the final indexed final-status gate set.",
      doneWhen: "Action board counts match final-status-final-index remaining gates.",
    },
    {
      id: "field-gate-closure-map-final-index",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:gate-closure-map", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh gate closure map from the final indexed action board.",
      doneWhen: "Gate closure map counts match the final indexed action board.",
    },
    {
      id: "field-owner-briefs-final-index",
      phase: "Field Action Artifacts",
      command: npm,
      args: ["run", "field:owner-briefs", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh owner briefs from the final indexed action board.",
      doneWhen: "Owner brief counts match the final indexed action board.",
    },
    {
      id: "handover-package-action-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`, "--reuse-existing-evidence"],
      timeoutMs: HANDOVER_PACKAGE_TIMEOUT_MS,
      purpose: "Repackage once more after final indexed action artifacts so handover strict counts match the final gate set.",
      doneWhen: "Handover package references final indexed field action artifacts.",
    },
    {
      id: "final-status-action-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:status", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Refresh final status after final indexed action artifacts and handover package converge.",
      doneWhen: "Final status shows action board, gate map, owner brief, and handover counts from the final indexed action artifacts.",
    },
    {
      id: "final-execution-plan-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:execution-plan", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Rebuild the final execution plan from the action-indexed final-status manifest.",
      doneWhen: "Final execution plan sourceFinalStatus points to final-status-action-index.",
    },
    {
      id: "field-closure-plan-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "field:closure-plan", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Rebuild the field closure plan after the final execution plan so Closure Command Queue points to the latest ordered commands.",
      doneWhen: "Field closure plan sourceFinalExecutionPlan points to final-execution-plan-final-index.",
    },
    {
      id: "final-bundle-handoff-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:bundle-handoff", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Rebuild reviewer-facing bundle files from the final indexed execution plan.",
      doneWhen: "Final bundle handoff sourceFinalExecutionPlan points to final-execution-plan-final-index.",
    },
    {
      id: "final-gate-classification-final-index",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:gate-classification", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Reclassify remaining gates after final status has indexed the latest handover package.",
      doneWhen: "Final gate classification sourceFinalStatus points to the latest final-status manifest.",
    },
    {
      id: "handover-index-closeout-sync",
      phase: "Final Decision",
      command: npm,
      args: ["run", "handover:index", "--", `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Re-index handover evidence after the final field closure plan so the package does not report stale closure-plan evidence.",
      doneWhen: "Handover index source references match the latest completion audit and field closure plan.",
    },
    {
      id: "handover-package-closeout-sync",
      phase: "Final Decision",
      command: npm,
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`, "--reuse-existing-evidence"],
      timeoutMs: HANDOVER_PACKAGE_TIMEOUT_MS,
      purpose: "Repackage the synced handover index after final field closure planning.",
      doneWhen: "Handover package status reflects REVIEW/READY rather than stale evidence ordering.",
    },
    {
      id: "final-status-closeout-sync",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:status", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Create the final status after closeout handover sync.",
      doneWhen: "Final status contains no stale handover package gate when only field/security/CI evidence remains open.",
    },
    {
      id: "final-gate-classification-closeout-sync",
      phase: "Final Decision",
      command: npm,
      args: ["run", "final:gate-classification", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
      purpose: "Reclassify gates from the closeout-synced final status so package-refresh examples do not point at stale handover evidence.",
      doneWhen: "Final gate classification sourceFinalStatus points to final-status-closeout-sync.",
    },
  );

  return steps.map((step, index) => ({ order: index + 1, ...step }));
}

function buildMarkdown(manifest) {
  const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    "# Final Closeout Refresh",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Latest final status: ${manifest.latestFinalStatus.status} (${manifest.latestFinalStatus.path || "missing"})`,
    `- Latest final status remaining gates: ${manifest.latestFinalStatus.remainingGateCount ?? "unknown"}`,
    `- Latest handover package: ${manifest.latestHandoverPackage.status} (${manifest.latestHandoverPackage.path || "missing"})`,
    `- Latest field closure plan: ${manifest.latestFieldClosurePlan.status} (${manifest.latestFieldClosurePlan.path || "missing"})`,
    `- Latest field closure queue count: ${manifest.latestFieldClosurePlan.closureCommandQueueCount ?? "unknown"}`,
    `- Latest final execution plan: ${manifest.latestFinalExecutionPlan.status} (${manifest.latestFinalExecutionPlan.path || "missing"})`,
    `- Latest final execution plan remaining gates: ${manifest.latestFinalExecutionPlan.remainingGateCount ?? "unknown"}`,
    `- Latest final bundle handoff: ${manifest.latestFinalBundleHandoff.status} (${manifest.latestFinalBundleHandoff.path || "missing"})`,
    `- Latest final bundle handoff bundle count: ${manifest.latestFinalBundleHandoff.bundleCount ?? "unknown"}`,
    `- Latest final gate classification: ${manifest.latestFinalGateClassification.status} (${manifest.latestFinalGateClassification.path || "missing"})`,
    `- Field-required gate count: ${manifest.latestFinalGateClassification.fieldRequiredCount ?? "unknown"}`,
    `- Refresh-only gate count: ${manifest.latestFinalGateClassification.refreshOnlyCount ?? "unknown"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Steps",
    "",
    "| Order | Status | Phase | Step | Exit | Log | Purpose | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...manifest.steps.map(
      (step) =>
        `| ${step.order} | ${step.status} | ${cell(step.phase)} | ${cell(step.id)} | ${step.exitCode} | ${cell(step.logPath)} | ${cell(step.purpose)} | ${cell(step.doneWhen)} |`,
    ),
    "",
  ].join("\n");
}

function buildManifest(options, stepResults) {
  const failedSteps = stepResults.filter((step) => step.status === "FAIL");
  const reviewSteps = stepResults.filter((step) => step.status === "REVIEW_RECORDED");
  const latestFinalStatus = readLatestJsonManifest("artifacts/final-status");
  const latestHandoverPackage = readLatestJsonManifest("artifacts/handover-package");
  const latestFieldClosurePlan = readLatestJsonManifest("artifacts/field-closure-plan");
  const latestFinalExecutionPlan = readLatestJsonManifest("artifacts/final-execution-plan");
  const latestFinalBundleHandoff = readLatestJsonManifest("artifacts/final-bundle-handoff");
  const latestFinalGateClassification = readLatestJsonManifest("artifacts/final-gate-classification");
  const canMarkGoalComplete =
    latestFinalStatus?.data?.status === "READY_TO_CLOSE" &&
    latestFinalStatus?.data?.canMarkGoalComplete === true &&
    latestFinalExecutionPlan?.data?.status === "READY_TO_CLOSE" &&
    latestFinalExecutionPlan?.data?.canMarkGoalComplete === true;
  return {
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy,
    siteName: options.siteName,
    hostName: os.hostname(),
    baseUrl: options.baseUrl,
    git: buildGitState(),
    status: failedSteps.length > 0 ? "FAILED" : canMarkGoalComplete ? "READY_TO_CLOSE" : "OPEN_GATES",
    canMarkGoalComplete,
    failedStepCount: failedSteps.length,
    reviewRecordedStepCount: reviewSteps.length,
    latestFinalStatus: {
      path: latestFinalStatus?.path || null,
      status: latestFinalStatus?.data?.status || "MISSING",
      canMarkGoalComplete: latestFinalStatus?.data?.canMarkGoalComplete === true,
      remainingGateCount: latestFinalStatus?.data?.remainingGates?.length ?? null,
    },
    latestHandoverPackage: {
      path: latestHandoverPackage?.path || null,
      status: latestHandoverPackage?.data?.status || "MISSING",
      finalBundleHandoff: latestHandoverPackage?.data?.evidenceRefs?.finalBundleHandoff || null,
    },
    latestFieldClosurePlan: {
      path: latestFieldClosurePlan?.path || null,
      status: latestFieldClosurePlan?.data?.status || "MISSING",
      sourceFinalExecutionPlan: latestFieldClosurePlan?.data?.sourceFinalExecutionPlan || null,
      closureCommandQueueCount: latestFieldClosurePlan?.data?.counts?.closureCommandQueueCount ?? null,
    },
    latestFinalExecutionPlan: {
      path: latestFinalExecutionPlan?.path || null,
      status: latestFinalExecutionPlan?.data?.status || "MISSING",
      canMarkGoalComplete: latestFinalExecutionPlan?.data?.canMarkGoalComplete === true,
      remainingGateCount: latestFinalExecutionPlan?.data?.remainingGateCount ?? null,
    },
    latestFinalBundleHandoff: {
      path: latestFinalBundleHandoff?.path || null,
      status: latestFinalBundleHandoff?.data?.status || "MISSING",
      bundleCount: latestFinalBundleHandoff?.data?.bundleCount ?? null,
      totalBundleGateCount: latestFinalBundleHandoff?.data?.totalBundleGateCount ?? null,
    },
    latestFinalGateClassification: {
      path: latestFinalGateClassification?.path || null,
      status: latestFinalGateClassification?.data?.status || "MISSING",
      remainingGateCount: latestFinalGateClassification?.data?.summary?.remainingGateCount ?? null,
      fieldRequiredCount: latestFinalGateClassification?.data?.summary?.fieldRequiredCount ?? null,
      conditionalLocalCount: latestFinalGateClassification?.data?.summary?.conditionalLocalCount ?? null,
      localOnlyClosableCount: latestFinalGateClassification?.data?.summary?.localOnlyClosableCount ?? null,
      refreshOnlyCount: latestFinalGateClassification?.data?.summary?.refreshOnlyCount ?? null,
    },
    includeFieldAcceptance: options.includeFieldAcceptance,
    externalCiDispatch: false,
    guardrails: [
      "This refresh does not dispatch external GitHub Actions.",
      "OPEN_GATES means the refresh commands completed, but final field/security/manual gates remain open.",
      "REVIEW_RECORDED means an individual command wrote evidence but still needs field/security/manual closeout.",
      "The final closeout refresh manifest is the authoritative latest final-bundle-handoff pointer after the refresh sequence completes.",
      "The latest final gate classification is routing evidence for auto-mode triage and does not close field evidence gates.",
      "Do not mark the Codex goal complete until final:status reports READY_TO_CLOSE and canMarkGoalComplete=true.",
    ],
    steps: stepResults,
  };
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/final-closeout-refresh");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const options = {
    baseUrl: argValue("base-url", resolveFieldBaseUrl(undefined, FIELD_REFRESH_DEFAULTS.baseUrl)),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
    includeFieldAcceptance: !hasFlag("skip-field-acceptance"),
  };
  const stepResults = [];
  for (const step of buildSteps(options)) {
    const result = runStep(step, outputDir);
    stepResults.push(result);
    console.log(`[${result.status}] ${result.id}`);
    if (result.status === "FAIL") break;
  }
  const manifest = buildManifest(options, stepResults);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`final closeout refresh written to ${path.relative(root, outputDir)}`);
  console.log(`final closeout refresh status: ${manifest.status}`);
  if (manifest.status === "FAILED") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManifest,
  buildMarkdown,
  buildSteps,
};
