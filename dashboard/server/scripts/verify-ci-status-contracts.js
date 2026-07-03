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
assert(passManifest.reviewReasons.length === 0, "PASS CI evidence should have no review reasons");

const staleManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git,
  ghResult: { command: "gh run list", exitCode: 0, stdout: "[]", stderr: "", error: null },
  runs: [{ headSha: "older-sha", status: "completed", conclusion: "success" }],
});
assert(staleManifest.status === "REVIEW", "stale CI run should require review");
assert(staleManifest.reviewReasons.some((item) => item.includes("does not match")), "stale CI run should explain headSha mismatch");

const failedToolManifest = buildCiStatusEvidence({
  generatedAt: "2026-01-01T00:00:00.000Z",
  git,
  ghResult: { command: "gh run list", exitCode: 1, stdout: "", stderr: "not authenticated", error: null },
  runs: [],
});
assert(failedToolManifest.status === "REVIEW", "missing gh/auth should require review");
assert(failedToolManifest.reviewReasons.some((item) => item.includes("GitHub CLI run lookup failed")), "missing gh/auth should explain lookup failure");

const markdown = buildMarkdown(passManifest);
["CI Status Evidence", "GitHub Actions Run", "Can use for final close", "Git pushed to origin/dev"].forEach((token) =>
  assert(markdown.includes(token), `CI status markdown should include ${token}`),
);

console.log("CI status contracts ok");
