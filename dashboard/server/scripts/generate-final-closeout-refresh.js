const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { buildGitState } = require("./generate-final-status-report");

const root = path.join(__dirname, "..", "..", "..");

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
  const result = spawnSync(step.command, step.args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const accepted = exitCode === 0 || (step.acceptReviewExitCodes || []).includes(exitCode);
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
      args: ["run", "security:evidence", "--", "--use-docker-scanners", `--target-url=${baseUrl}`],
      purpose: "Refresh security evidence with Docker scanner fallback readiness.",
      doneWhen: "Scanner evidence is verified, or Docker/runtime skip reason is explicit.",
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
      purpose: "Record field acceptance REVIEW/SKIPPED state without requiring unavailable field hardware.",
      doneWhen: "Field acceptance is PASS after strict field evidence exists, or current REVIEW manifest is available.",
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
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
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
      args: ["run", "handover:package", "--", `--base-url=${baseUrl}`, `--generated-by=${reviewer}`, `--site-name=${siteName}`],
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
    `- Latest final execution plan: ${manifest.latestFinalExecutionPlan.status} (${manifest.latestFinalExecutionPlan.path || "missing"})`,
    `- Latest final execution plan remaining gates: ${manifest.latestFinalExecutionPlan.remainingGateCount ?? "unknown"}`,
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
  const latestFinalExecutionPlan = readLatestJsonManifest("artifacts/final-execution-plan");
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
    latestFinalExecutionPlan: {
      path: latestFinalExecutionPlan?.path || null,
      status: latestFinalExecutionPlan?.data?.status || "MISSING",
      canMarkGoalComplete: latestFinalExecutionPlan?.data?.canMarkGoalComplete === true,
      remainingGateCount: latestFinalExecutionPlan?.data?.remainingGateCount ?? null,
    },
    includeFieldAcceptance: options.includeFieldAcceptance,
    externalCiDispatch: false,
    guardrails: [
      "This refresh does not dispatch external GitHub Actions.",
      "OPEN_GATES means the refresh commands completed, but final field/security/manual gates remain open.",
      "REVIEW_RECORDED means an individual command wrote evidence but still needs field/security/manual closeout.",
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
    baseUrl: argValue("base-url", "http://localhost:8080"),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
    includeFieldAcceptance: hasFlag("include-field-acceptance"),
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
