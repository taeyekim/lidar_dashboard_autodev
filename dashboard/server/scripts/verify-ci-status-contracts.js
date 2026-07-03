const fs = require("fs");
const path = require("path");
const { buildCiStatusEvidence, buildMarkdown } = require("./generate-ci-status-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-ci-status-evidence.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "ci:status", "root package scripts"],
  [packageJson, "verify:ci-status", "root package scripts"],
  [packageJson, "verify-ci-status-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-ci-status-contracts.js", "server verify chain"],
  [generator, "gh", "CI status generator"],
  [generator, '"run"', "CI status generator"],
  [generator, '"list"', "CI status generator"],
  [generator, "--workflow", "CI status generator"],
  [generator, "headSha", "CI status generator"],
  [generator, "conclusion", "CI status generator"],
  [generator, "canUseForFinalClose", "CI status generator"],
  [generator, "npm.cmd run ci:status is read-only", "CI status generator"],
  [generator, "ci:closeout -- --dispatch", "CI status generator"],
  [generator, "approved CI closeout window", "CI status generator"],
  [generator, "workflow list", "CI status generator"],
  [generator, "workflowDispatchConfigured", "CI status generator"],
  [generator, "workflowState", "CI status generator"],
  [generator, "closeoutCommands", "CI status generator"],
  [generator, "Read-only status refresh", "CI status generator"],
  [generator, "Approved CI closeout dispatch", "CI status generator"],
  [generator, "Underlying GitHub workflow dispatch", "CI status generator"],
  [generator, "artifacts/ci-status", "CI status generator"],
  [generator, "Git pushed to origin/dev", "CI status generator"],
  [runbook, "npm.cmd run ci:status", "delivery runbook"],
  [checklist, "npm run ci:status", "acceptance checklist"],
  [matrix, "npm run ci:status", "delivery evidence matrix"],
  [matrix, "artifacts/ci-status/<timestamp>/manifest.json", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const git = {
  branch: "dev",
  commit: "fixture-sha",
  clean: true,
  upstream: "origin/dev",
  upstreamCommit: "fixture-sha",
  pushed: true,
};

const passManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  hostName: "delivery-host",
  git,
  workflowListResult: { command: "gh workflow list --all", exitCode: 0, stdout: "CI\tactive\t123\n", stderr: "", error: null },
  workflowDispatchConfigured: true,
  ghResult: { command: "gh run list", exitCode: 0, stdout: "[]", stderr: "", error: null },
  runs: [
    {
      databaseId: 123,
      workflowName: "CI",
      displayTitle: "CI",
      headSha: "fixture-sha",
      status: "completed",
      conclusion: "success",
      url: "https://github.example/run/123",
    },
  ],
});
assert(passManifest.status === "PASS", "matching successful CI run should PASS");
assert(passManifest.canUseForFinalClose === true, "PASS CI evidence should be usable for final close");
assert(passManifest.workflowState.state === "active", "PASS CI evidence should expose active workflow state");
assert(passManifest.workflowState.dispatchConfigured === true, "PASS CI evidence should expose workflow_dispatch support");
assert(passManifest.closeoutCommands.readOnlyStatus === "npm.cmd run ci:status -- --generated-by=reviewer-a", "CI evidence should expose the read-only refresh command");
assert(passManifest.closeoutCommands.intentionalDispatch === "npm.cmd run ci:closeout -- --dispatch --generated-by=reviewer-a", "CI evidence should expose the approved dispatch closeout command");
assert(passManifest.closeoutCommands.manualWorkflowDispatch === "gh workflow run CI --ref dev", "CI evidence should expose the underlying workflow dispatch command");
assert(passManifest.reviewReasons.length === 0, "PASS CI evidence should have no review reasons");

const staleManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git,
  workflowListResult: { command: "gh workflow list --all", exitCode: 0, stdout: "CI\tactive\t123\n", stderr: "", error: null },
  workflowDispatchConfigured: true,
  ghResult: { command: "gh run list", exitCode: 0, stdout: "[]", stderr: "", error: null },
  runs: [{ headSha: "older-sha", status: "completed", conclusion: "success" }],
});
assert(staleManifest.status === "REVIEW", "stale CI run should require review");
assert(staleManifest.reviewReasons.some((item) => item.includes("does not match")), "stale CI run should explain headSha mismatch");

const inactiveWorkflowManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git,
  workflowListResult: { command: "gh workflow list --all", exitCode: 0, stdout: "CI\tdisabled_manually\t123\n", stderr: "", error: null },
  workflowDispatchConfigured: true,
  ghResult: { command: "gh run list", exitCode: 0, stdout: "[]", stderr: "", error: null },
  runs: [{ headSha: "fixture-sha", status: "completed", conclusion: "success" }],
});
assert(inactiveWorkflowManifest.status === "REVIEW", "inactive workflow should require review even when latest run succeeded");
assert(inactiveWorkflowManifest.reviewReasons.some((item) => item.includes("instead of active")), "inactive workflow should explain inactive state");

const failedToolManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git,
  workflowListResult: { command: "gh workflow list --all", exitCode: 0, stdout: "", stderr: "", error: null },
  workflowDispatchConfigured: false,
  ghResult: { command: "gh run list", exitCode: 1, stdout: "", stderr: "not authenticated", error: null },
  runs: [],
});
assert(failedToolManifest.status === "REVIEW", "missing gh/auth should require review");
assert(failedToolManifest.reviewReasons.some((item) => item.includes("GitHub CLI run lookup failed")), "missing gh/auth should explain lookup failure");
assert(failedToolManifest.reviewReasons.some((item) => item.includes("workflow is not listed")), "missing workflow listing should explain workflow list failure");
assert(failedToolManifest.reviewReasons.some((item) => item.includes("workflow_dispatch trigger is not configured")), "missing dispatch config should explain manual trigger gap");
assert(failedToolManifest.nextAction.includes("npm.cmd run ci:status is read-only"), "missing CI evidence should make ci:status read-only behavior explicit");
assert(failedToolManifest.nextAction.includes("ci:closeout -- --dispatch"), "missing CI evidence should point to intentional CI closeout dispatch");
assert(failedToolManifest.nextAction.includes("approved CI closeout window"), "missing CI evidence should require an approved CI closeout window");

const markdown = buildMarkdown(passManifest);
["CI Status Evidence", "GitHub Actions Run", "Can use for final close", "Workflow dispatch configured", "Git pushed to origin/dev", "Closeout Commands"].forEach((token) =>
  assert(markdown.includes(token), `CI status markdown should include ${token}`),
);

console.log("CI status contracts ok");
