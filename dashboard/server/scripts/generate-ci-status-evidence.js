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

function latestRunForHead(runs, commit) {
  return runs.find((item) => item.headSha === commit) || runs[0] || null;
}

function buildCiStatusEvidence(input = {}) {
  const git = input.git || buildGitState();
  const workflow = input.workflow || "CI";
  const branch = input.branch || "dev";
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
      "databaseId,headSha,conclusion,status,url,createdAt,updatedAt,workflowName,displayTitle",
    ]);
  const runs = input.runs || parseJsonArray(ghResult.stdout);
  const latestRun = latestRunForHead(runs, git.commit);
  const toolAvailable = ghResult.exitCode === 0;
  const runMatchesHead = Boolean(latestRun && latestRun.headSha === git.commit);
  const runCompleted = latestRun?.status === "completed";
  const runSucceeded = latestRun?.conclusion === "success";
  const status = toolAvailable && runMatchesHead && runCompleted && runSucceeded ? "PASS" : "REVIEW";
  const reviewReasons = [
    toolAvailable ? "" : `GitHub CLI run lookup failed: ${ghResult.error || ghResult.stderr || "gh unavailable or unauthenticated"}.`,
    latestRun ? "" : `No ${workflow} workflow run was found for branch ${branch}.`,
    latestRun && !runMatchesHead ? `Latest ${workflow} run headSha ${latestRun.headSha || "missing"} does not match ${git.commit}.` : "",
    latestRun && !runCompleted ? `Latest ${workflow} run status is ${latestRun.status || "missing"}.` : "",
    latestRun && runCompleted && !runSucceeded ? `Latest ${workflow} run conclusion is ${latestRun.conclusion || "missing"}.` : "",
    git.branch === branch ? "" : `Current branch is ${git.branch || "missing"} instead of ${branch}.`,
    git.upstream === `origin/${branch}` ? "" : `Current upstream is ${git.upstream || "missing"} instead of origin/${branch}.`,
    git.pushed ? "" : `Current commit is not proven pushed to origin/${branch}.`,
  ].filter(Boolean);

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
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
    latestRun: latestRun
      ? {
          databaseId: latestRun.databaseId ?? null,
          workflowName: latestRun.workflowName || null,
          displayTitle: latestRun.displayTitle || null,
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
    reviewReasons,
    nextAction:
      status === "PASS"
        ? "Attach this CI status evidence to the final handover package."
        : `Confirm the ${workflow} GitHub Actions run for ${git.commit} on ${branch} is completed with conclusion=success. If no run exists, trigger it with gh workflow run ${workflow} --ref ${branch}, wait for completion, then rerun npm.cmd run ci:status.`,
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
    `| run id | ${markdownCell(manifest.latestRun?.databaseId || "missing")} |`,
    `| head sha | ${markdownCell(manifest.latestRun?.headSha || "missing")} |`,
    `| status | ${markdownCell(manifest.latestRun?.status || "missing")} |`,
    `| conclusion | ${markdownCell(manifest.latestRun?.conclusion || "missing")} |`,
    `| URL | ${manifest.latestRun?.url || "missing"} |`,
    "",
    "## Review Reasons",
    "",
    ...(manifest.reviewReasons.length > 0 ? manifest.reviewReasons.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Next Action",
    "",
    `- ${manifest.nextAction}`,
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
};
