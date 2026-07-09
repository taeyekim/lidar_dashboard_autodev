const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { timestampForPath } = require("./generate-delivery-evidence");

const root = path.join(__dirname, "..", "..", "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    command: [command, ...args].join(" "),
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function gitValue(args) {
  return run("git", args).stdout.trim();
}

function buildGitState() {
  const upstream = gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstreamCommit = upstream ? gitValue(["rev-parse", "@{u}"]) : "";
  const commit = gitValue(["rev-parse", "HEAD"]);
  return {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit,
    clean: gitValue(["status", "--short"]) === "",
    upstream: upstream || null,
    upstreamCommit: upstreamCommit || null,
    pushed: Boolean(commit && upstreamCommit && commit === upstreamCommit),
  };
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function latestRunForHead(runs, commit) {
  return runs.find((item) => item.headSha === commit) || runs[0] || null;
}

function buildRecentRunEventSummary(runs = []) {
  const byEvent = runs.reduce((summary, run) => {
    const event = run.event || "unknown";
    summary[event] = (summary[event] || 0) + 1;
    return summary;
  }, {});
  const pushRunCount = Number(byEvent.push || 0);
  const workflowDispatchRunCount = Number(byEvent.workflow_dispatch || 0);
  return {
    totalRuns: runs.length,
    byEvent,
    pushRunCount,
    workflowDispatchRunCount,
    pushRunObserved: pushRunCount > 0,
    onlyWorkflowDispatchObserved: runs.length > 0 && workflowDispatchRunCount === runs.length,
  };
}

function workflowFileText() {
  try {
    return fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  } catch {
    return "";
  }
}

function workflowDispatchConfigured(workflowText = workflowFileText()) {
  return /^\s*workflow_dispatch\s*:/m.test(workflowText);
}

function workflowPushConfiguredForBranch(branch, workflowText = workflowFileText()) {
  const pushIndex = workflowText.search(/^\s*push\s*:/m);
  if (pushIndex < 0) return false;
  const pushBlock = workflowText.slice(pushIndex).split(/\r?\n(?=\S)/)[0] || "";
  return new RegExp(`-\\s*${branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(pushBlock);
}

function remoteSlug() {
  const remote = gitValue(["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/i);
  return match ? match[1].replace(/\.git$/i, "") : "";
}

function parseWorkflowList(text, workflow) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, state, id] = line.split(/\t+/);
      return { name: name || "", state: state || "", id: id || "" };
    })
    .find((item) => item.name === workflow) || null;
}

function buildActionsPermissions(input = {}) {
  const slug = input.remoteSlug || remoteSlug();
  if (!slug) {
    return {
      command: null,
      exitCode: null,
      available: false,
      enabled: null,
      allowedActions: null,
      shaPinningRequired: null,
      error: "GitHub origin remote could not be parsed.",
      stderr: "",
    };
  }
  const result = input.result || run("gh", ["api", `repos/${slug}/actions/permissions`]);
  const data = parseJsonObject(result.stdout);
  return {
    command: result.command,
    exitCode: result.exitCode,
    available: result.exitCode === 0 && Boolean(data),
    enabled: typeof data?.enabled === "boolean" ? data.enabled : null,
    allowedActions: data?.allowed_actions || null,
    shaPinningRequired: typeof data?.sha_pinning_required === "boolean" ? data.sha_pinning_required : null,
    error: result.error || null,
    stderr: result.stderr || "",
  };
}

function buildCiCloseoutChecklist({ git, workflow, branch, workflowInfo, dispatchConfigured, pushConfigured, actionsPermissions, runMatchesHead, runCompleted, runSucceeded }) {
  return [
    {
      item: "Source branch",
      status: git.branch === branch ? "PASS" : "REVIEW",
      detail: `Current branch is ${git.branch || "missing"}; expected ${branch}.`,
      closeWhen: `Checkout ${branch} before CI closeout.`,
    },
    {
      item: "Source pushed",
      status: git.pushed ? "PASS" : "REVIEW",
      detail: `HEAD ${git.commit || "missing"} pushed to origin/${branch}: ${git.pushed ? "yes" : "no"}.`,
      closeWhen: `Push HEAD to origin/${branch} before CI closeout.`,
    },
    {
      item: "Workflow active",
      status: workflowInfo && workflowInfo.state === "active" ? "PASS" : "REVIEW",
      detail: `${workflow} workflow state is ${workflowInfo?.state || "missing"}.`,
      closeWhen: "Enable the CI workflow in GitHub Actions.",
    },
    {
      item: "Manual dispatch configured",
      status: dispatchConfigured ? "PASS" : "REVIEW",
      detail: `${workflow} workflow_dispatch configured: ${dispatchConfigured ? "yes" : "no"}.`,
      closeWhen: "Add workflow_dispatch to .github/workflows/ci.yml or rely on an automatic pushed-head run.",
    },
    {
      item: "Push trigger configured",
      status: pushConfigured ? "PASS" : "REVIEW",
      detail: `${workflow} push trigger for ${branch}: ${pushConfigured ? "yes" : "no"}.`,
      closeWhen: `Configure push trigger for ${branch} or intentionally dispatch during the approved closeout window.`,
    },
    {
      item: "Actions enabled",
      status: actionsPermissions.available && actionsPermissions.enabled === true ? "PASS" : "REVIEW",
      detail: `GitHub Actions enabled: ${actionsPermissions.enabled === null ? "unknown" : actionsPermissions.enabled ? "yes" : "no"}.`,
      closeWhen: "Enable GitHub Actions repository permissions or attach admin review evidence.",
    },
    {
      item: "Matching HEAD run",
      status: runMatchesHead ? "PASS" : "REVIEW",
      detail: `Visible CI run matches HEAD ${git.commit || "missing"}: ${runMatchesHead ? "yes" : "no"}.`,
      closeWhen: "Wait for the pushed-head run or use approved ci:closeout dispatch.",
    },
    {
      item: "Run completed successfully",
      status: runMatchesHead && runCompleted && runSucceeded ? "PASS" : "REVIEW",
      detail: `Matching run completed=${runCompleted ? "yes" : "no"}, success=${runSucceeded ? "yes" : "no"}.`,
      closeWhen: "Wait for completion and resolve CI failures until conclusion=success.",
    },
  ];
}

function buildCiStatusEvidence(input = {}) {
  const git = input.git || buildGitState();
  const workflow = input.workflow || "CI";
  const branch = input.branch || "dev";
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const workflowText = typeof input.workflowText === "string" ? input.workflowText : workflowFileText();
  const workflowListResult = input.workflowListResult || run("gh", ["workflow", "list", "--all"]);
  const workflowInfo = input.workflowInfo || parseWorkflowList(workflowListResult.stdout, workflow);
  const dispatchConfigured =
    typeof input.workflowDispatchConfigured === "boolean" ? input.workflowDispatchConfigured : workflowDispatchConfigured(workflowText);
  const pushConfigured =
    typeof input.workflowPushConfiguredForBranch === "boolean" ? input.workflowPushConfiguredForBranch : workflowPushConfiguredForBranch(branch, workflowText);
  const actionsPermissions = input.actionsPermissions || buildActionsPermissions(input.actionsPermissionsInput || {});
  const ghResult =
    input.ghResult ||
    run("gh", [
      "run",
      "list",
      "--workflow",
      workflow,
      "--branch",
      branch,
      "--limit",
      "10",
      "--json",
      "databaseId,headSha,conclusion,status,url,createdAt,updatedAt,workflowName,displayTitle,event",
    ]);
  const runs = input.runs || parseJsonArray(ghResult.stdout);
  const recentRunEventSummary = buildRecentRunEventSummary(runs);
  const latestRun = latestRunForHead(runs, git.commit);
  const toolAvailable = ghResult.exitCode === 0;
  const runMatchesHead = Boolean(latestRun && latestRun.headSha === git.commit);
  const runCompleted = latestRun?.status === "completed";
  const runSucceeded = latestRun?.conclusion === "success";
  const ciRunOk = toolAvailable && runMatchesHead && runCompleted && runSucceeded;
  const workflowReadyForRun =
    Boolean(workflowInfo) &&
    workflowInfo.state === "active" &&
    actionsPermissions.available === true &&
    actionsPermissions.enabled === true &&
    dispatchConfigured === true &&
    pushConfigured === true;
  const runListEmpty = toolAvailable && runs.length === 0;
  const noRunForPushedHead = workflowReadyForRun && git.pushed === true && !runMatchesHead;
  const ciTriggerDiagnosis = {
    workflowReadyForRun,
    runListEmpty,
    noRunForPushedHead,
    diagnosis:
      noRunForPushedHead && runListEmpty
        ? `${workflow} workflow is active and Actions are enabled, but no run is visible for pushed ${branch} commit ${git.commit}.`
        : noRunForPushedHead && recentRunEventSummary.onlyWorkflowDispatchObserved
          ? `${workflow} workflow is active and Actions are enabled, but recent visible runs are all workflow_dispatch and none match pushed ${branch} commit ${git.commit}.`
        : noRunForPushedHead
          ? `${workflow} workflow is active and Actions are enabled, but the visible run does not match pushed ${branch} commit ${git.commit}.`
          : ciRunOk
            ? `${workflow} workflow completed successfully for pushed ${branch} commit ${git.commit}.`
            : `${workflow} workflow run evidence is not ready for final close.`,
    recommendedAction:
      noRunForPushedHead
        ? "Check repository Actions trigger history and branch workflow settings. If no run appears, use the approved external CI closeout window before dispatching CI."
        : ciRunOk
          ? "Attach this CI evidence to the final handover package."
          : "Resolve CI workflow, permission, run status, or branch freshness review reasons.",
  };
  const reviewReasons = [
    workflowInfo ? "" : `${workflow} workflow is not listed by gh workflow list --all.`,
    workflowInfo && workflowInfo.state !== "active" ? `${workflow} workflow state is ${workflowInfo.state || "missing"} instead of active.` : "",
    actionsPermissions.available ? "" : `GitHub Actions permissions lookup failed: ${actionsPermissions.error || actionsPermissions.stderr || "gh api unavailable or unauthenticated"}.`,
    actionsPermissions.available && actionsPermissions.enabled !== true ? `GitHub Actions repository permission enabled=${actionsPermissions.enabled}.` : "",
    dispatchConfigured ? "" : `${workflow} workflow_dispatch trigger is not configured in .github/workflows/ci.yml.`,
    pushConfigured ? "" : `${workflow} push trigger for branch ${branch} is not configured in .github/workflows/ci.yml.`,
    toolAvailable ? "" : `GitHub CLI run lookup failed: ${ghResult.error || ghResult.stderr || "gh unavailable or unauthenticated"}.`,
    latestRun ? "" : `No ${workflow} workflow run was found for branch ${branch}.`,
    latestRun && !runMatchesHead ? `Latest ${workflow} run headSha ${latestRun.headSha || "missing"} does not match ${git.commit}.` : "",
    latestRun && !runCompleted ? `Latest ${workflow} run status is ${latestRun.status || "missing"}.` : "",
    latestRun && runCompleted && !runSucceeded ? `Latest ${workflow} run conclusion is ${latestRun.conclusion || "missing"}.` : "",
    git.branch === branch ? "" : `Current branch is ${git.branch || "missing"} instead of ${branch}.`,
    git.upstream === `origin/${branch}` ? "" : `Current upstream is ${git.upstream || "missing"} instead of origin/${branch}.`,
    git.pushed ? "" : `Current commit is not proven pushed to origin/${branch}.`,
  ].filter(Boolean);
  const status = ciRunOk && reviewReasons.length === 0 ? "PASS" : "REVIEW";
  const ciCloseoutChecklist = buildCiCloseoutChecklist({
    git,
    workflow,
    branch,
    workflowInfo,
    dispatchConfigured,
    pushConfigured,
    actionsPermissions,
    runMatchesHead,
    runCompleted,
    runSucceeded,
  });

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    hostName: input.hostName || os.hostname(),
    workflow,
    branch,
    git,
    status,
    canUseForFinalClose: status === "PASS",
    tool: {
      command: ghResult.command,
      exitCode: ghResult.exitCode,
      available: toolAvailable,
      error: ghResult.error,
      stderr: ghResult.stderr,
    },
    workflowState: {
      command: workflowListResult.command,
      exitCode: workflowListResult.exitCode,
      listed: Boolean(workflowInfo),
      name: workflowInfo?.name || workflow,
      state: workflowInfo?.state || null,
      id: workflowInfo?.id || null,
      dispatchConfigured,
      pushConfigured,
    },
    actionsPermissions,
    latestRun: latestRun
      ? {
          databaseId: latestRun.databaseId ?? null,
          workflowName: latestRun.workflowName || null,
          displayTitle: latestRun.displayTitle || null,
          event: latestRun.event || null,
          headSha: latestRun.headSha || null,
          status: latestRun.status || null,
          conclusion: latestRun.conclusion || null,
          url: latestRun.url || null,
          createdAt: latestRun.createdAt || null,
          updatedAt: latestRun.updatedAt || null,
        }
      : null,
    runMatchesHead,
    runCompleted,
    runSucceeded,
    recentRunEventSummary,
    ciTriggerDiagnosis,
    ciCloseoutChecklist,
    reviewReasons,
    closeoutCommands: {
      readOnlyStatus: `npm.cmd run ci:status -- --generated-by=${generatedBy}`,
      intentionalDispatch: `npm.cmd run ci:closeout -- --dispatch --generated-by=${generatedBy}`,
      manualWorkflowDispatch: `gh workflow run ${workflow} --ref ${branch}`,
    },
    nextAction:
      status === "PASS"
        ? "Attach this CI status evidence to the final handover package."
        : `Confirm the ${workflow} GitHub Actions run for ${git.commit} on ${branch} is completed with conclusion=success. npm.cmd run ci:status is read-only and does not start CI. If no run exists, intentionally start external GitHub Actions during the approved CI closeout window with npm.cmd run ci:closeout -- --dispatch --generated-by=<field-reviewer>, wait for completion, then rerun npm.cmd run ci:status.`,
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# CI Status Evidence",
    "",
    `- Status: ${manifest.status}`,
    `- Can use for final close: ${manifest.canUseForFinalClose}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Host name: ${manifest.hostName}`,
    `- Workflow: ${manifest.workflow}`,
    `- Workflow listed: ${manifest.workflowState.listed ? "yes" : "no"}`,
    `- Workflow state: ${manifest.workflowState.state || "missing"}`,
    `- Workflow dispatch configured: ${manifest.workflowState.dispatchConfigured ? "yes" : "no"}`,
    `- Workflow push trigger for ${manifest.branch}: ${manifest.workflowState.pushConfigured ? "yes" : "no"}`,
    `- GitHub Actions enabled: ${manifest.actionsPermissions.enabled === null ? "unknown" : manifest.actionsPermissions.enabled ? "yes" : "no"}`,
    `- Branch: ${manifest.branch}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## GitHub Actions Run",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| gh command | \`${markdownCell(manifest.tool.command)}\` |`,
    `| gh available | ${manifest.tool.available ? "yes" : "no"} |`,
    `| workflow list command | \`${markdownCell(manifest.workflowState.command)}\` |`,
    `| workflow listed | ${manifest.workflowState.listed ? "yes" : "no"} |`,
    `| workflow state | ${markdownCell(manifest.workflowState.state || "missing")} |`,
    `| workflow id | ${markdownCell(manifest.workflowState.id || "missing")} |`,
    `| workflow_dispatch | ${manifest.workflowState.dispatchConfigured ? "yes" : "no"} |`,
    `| push trigger for branch | ${manifest.workflowState.pushConfigured ? "yes" : "no"} |`,
    `| actions permissions command | \`${markdownCell(manifest.actionsPermissions.command || "missing")}\` |`,
    `| actions enabled | ${manifest.actionsPermissions.enabled === null ? "unknown" : manifest.actionsPermissions.enabled ? "yes" : "no"} |`,
    `| allowed actions | ${markdownCell(manifest.actionsPermissions.allowedActions || "missing")} |`,
    `| workflow ready for run | ${manifest.ciTriggerDiagnosis.workflowReadyForRun ? "yes" : "no"} |`,
    `| run list empty | ${manifest.ciTriggerDiagnosis.runListEmpty ? "yes" : "no"} |`,
    `| no run for pushed head | ${manifest.ciTriggerDiagnosis.noRunForPushedHead ? "yes" : "no"} |`,
    `| recent run count | ${manifest.recentRunEventSummary.totalRuns} |`,
    `| recent run events | ${markdownCell(Object.entries(manifest.recentRunEventSummary.byEvent).map(([event, count]) => `${event}:${count}`).join(", ") || "none")} |`,
    `| push run observed | ${manifest.recentRunEventSummary.pushRunObserved ? "yes" : "no"} |`,
    `| only workflow_dispatch observed | ${manifest.recentRunEventSummary.onlyWorkflowDispatchObserved ? "yes" : "no"} |`,
    `| trigger diagnosis | ${markdownCell(manifest.ciTriggerDiagnosis.diagnosis)} |`,
    `| trigger recommended action | ${markdownCell(manifest.ciTriggerDiagnosis.recommendedAction)} |`,
    `| run id | ${markdownCell(manifest.latestRun?.databaseId || "missing")} |`,
    `| run event | ${markdownCell(manifest.latestRun?.event || "missing")} |`,
    `| head sha | ${markdownCell(manifest.latestRun?.headSha || "missing")} |`,
    `| status | ${markdownCell(manifest.latestRun?.status || "missing")} |`,
    `| conclusion | ${markdownCell(manifest.latestRun?.conclusion || "missing")} |`,
    `| URL | ${manifest.latestRun?.url || "missing"} |`,
    "",
    "## Review Reasons",
    "",
    ...(manifest.reviewReasons.length > 0 ? manifest.reviewReasons.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## CI Closeout Checklist",
    "",
    "| Item | Status | Detail | Close When |",
    "| --- | --- | --- | --- |",
    ...(manifest.ciCloseoutChecklist.length > 0
      ? manifest.ciCloseoutChecklist.map(
          (item) =>
            `| ${markdownCell(item.item)} | ${markdownCell(item.status)} | ${markdownCell(item.detail)} | ${markdownCell(item.closeWhen)} |`,
        )
      : ["| none | PASS | No CI closeout checklist items. | - |"]),
    "",
    "## Next Action",
    "",
    `- ${manifest.nextAction}`,
    "",
    "## Closeout Commands",
    "",
    "| Purpose | Command |",
    "| --- | --- |",
    `| Read-only status refresh | \`${markdownCell(manifest.closeoutCommands.readOnlyStatus)}\` |`,
    `| Approved CI closeout dispatch | \`${markdownCell(manifest.closeoutCommands.intentionalDispatch)}\` |`,
    `| Underlying GitHub workflow dispatch | \`${markdownCell(manifest.closeoutCommands.manualWorkflowDispatch)}\` |`,
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/ci-status");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildCiStatusEvidence({
    workflow: argValue("workflow", "CI"),
    branch: argValue("branch", "dev"),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`ci status evidence written to ${path.relative(root, outputDir)}`);
  console.log(`ci status evidence status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCiStatusEvidence,
  buildMarkdown,
  buildCiCloseoutChecklist,
};
