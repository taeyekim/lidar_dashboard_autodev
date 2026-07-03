const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..", "..");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function workflowDispatchConfigured() {
  try {
    const workflowText = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    return /^\s*workflow_dispatch\s*:/m.test(workflowText);
  } catch {
    return false;
  }
}

function latestRunForCommit({ workflow, branch, commit }) {
  const result = run("gh", [
    "run",
    "list",
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--limit",
    "20",
    "--json",
    "databaseId,headSha,conclusion,status,url,createdAt,updatedAt,workflowName,displayTitle",
  ]);
  const runs = parseJsonArray(result.stdout);
  return {
    result,
    run: runs.find((item) => item.headSha === commit) || null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRun({ workflow, branch, commit, timeoutMs, intervalMs }) {
  const startedAt = Date.now();
  let last = null;

  while (Date.now() - startedAt <= timeoutMs) {
    last = latestRunForCommit({ workflow, branch, commit });
    if (last.result.exitCode !== 0) return { ...last, timedOut: false };
    if (last.run?.status === "completed") return { ...last, timedOut: false };
    await sleep(intervalMs);
  }

  return { ...(last || latestRunForCommit({ workflow, branch, commit })), timedOut: true };
}

function printRun(run) {
  if (!run) {
    console.log("CI run: missing for current commit");
    return;
  }
  console.log(`CI run: ${run.databaseId || "missing-id"} ${run.status || "missing-status"} ${run.conclusion || "pending"}`);
  console.log(`CI URL: ${run.url || "missing"}`);
}

function generateCiStatus(generatedBy) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npmCommand, ["run", "ci:status", "--", `--generated-by=${generatedBy}`]);
}

async function main() {
  const workflow = argValue("workflow", "CI");
  const branch = argValue("branch", "dev");
  const generatedBy = argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex");
  const timeoutMs = Number(argValue("timeout-ms", "600000"));
  const intervalMs = Number(argValue("interval-ms", "15000"));
  const shouldDispatch = hasFlag("dispatch");
  const skipStatus = hasFlag("skip-status");
  const commit = gitValue(["rev-parse", "HEAD"]);
  const currentBranch = gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstream = gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstreamCommit = upstream ? gitValue(["rev-parse", "@{u}"]) : "";
  const clean = gitValue(["status", "--short"]) === "";

  if (currentBranch !== branch) {
    throw new Error(`Current branch is ${currentBranch || "missing"} instead of ${branch}.`);
  }
  if (upstream !== `origin/${branch}`) {
    throw new Error(`Current upstream is ${upstream || "missing"} instead of origin/${branch}.`);
  }
  if (!clean) {
    throw new Error("Working tree must be clean before CI closeout.");
  }
  if (!upstreamCommit || upstreamCommit !== commit) {
    throw new Error(`Current HEAD ${commit || "missing"} is not proven pushed to origin/${branch}.`);
  }

  const workflowList = run("gh", ["workflow", "list", "--all"]);
  if (workflowList.exitCode !== 0) {
    throw new Error(`GitHub workflow lookup failed: ${workflowList.error || workflowList.stderr || "gh unavailable"}`);
  }
  const workflowInfo = parseWorkflowList(workflowList.stdout, workflow);
  if (!workflowInfo) throw new Error(`${workflow} workflow is not listed by gh workflow list --all.`);
  if (workflowInfo.state !== "active") throw new Error(`${workflow} workflow state is ${workflowInfo.state || "missing"} instead of active.`);
  if (!workflowDispatchConfigured()) throw new Error(`${workflow} workflow_dispatch trigger is not configured.`);

  let current = latestRunForCommit({ workflow, branch, commit });
  if (current.result.exitCode !== 0) {
    throw new Error(`GitHub run lookup failed: ${current.result.error || current.result.stderr || "gh unavailable"}`);
  }

  if (!current.run && shouldDispatch) {
    console.log(`Dispatching ${workflow} for ${branch} at ${commit}.`);
    const dispatch = run("gh", ["workflow", "run", workflow, "--ref", branch]);
    if (dispatch.exitCode !== 0) {
      throw new Error(`GitHub workflow dispatch failed: ${dispatch.error || dispatch.stderr || "unknown error"}`);
    }
  } else if (!current.run) {
    throw new Error(`No ${workflow} run exists for ${commit}. Rerun with --dispatch to intentionally start GitHub Actions.`);
  }

  current = await waitForRun({ workflow, branch, commit, timeoutMs, intervalMs });
  if (current.result.exitCode !== 0) {
    throw new Error(`GitHub run lookup failed while waiting: ${current.result.error || current.result.stderr || "gh unavailable"}`);
  }
  if (current.timedOut) {
    printRun(current.run);
    throw new Error(`${workflow} run did not complete within ${timeoutMs}ms.`);
  }
  printRun(current.run);
  if (!current.run) throw new Error(`No ${workflow} run exists for ${commit}.`);
  if (current.run.conclusion !== "success") {
    throw new Error(`${workflow} run completed with conclusion=${current.run.conclusion || "missing"}.`);
  }

  if (!skipStatus) {
    const status = generateCiStatus(generatedBy);
    process.stdout.write(status.stdout);
    process.stderr.write(status.stderr);
    if (status.exitCode !== 0) throw new Error(`ci:status generation failed with exit code ${status.exitCode}.`);
  }

  console.log("CI closeout ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  latestRunForCommit,
  parseWorkflowList,
  workflowDispatchConfigured,
};
