const fs = require("fs");
const path = require("path");
const { parseWorkflowList } = require("./ci-closeout");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const rootPackage = readProjectFile("package.json");
const serverPackage = readProjectFile("dashboard/server/package.json");
const script = readProjectFile("dashboard/server/scripts/ci-closeout.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");

[
  [rootPackage, "ci:closeout", "root package scripts"],
  [rootPackage, "verify:ci-closeout", "root package scripts"],
  [rootPackage, "verify-ci-closeout-contracts.js", "root smoke chain"],
  [serverPackage, "verify-ci-closeout-contracts.js", "server verify chain"],
  [script, 'hasFlag("dispatch")', "CI closeout script"],
  [script, '"workflow", "run"', "CI closeout script"],
  [script, "Rerun with --dispatch", "CI closeout script"],
  [script, "approved external CI closeout window", "CI closeout script"],
  [script, "workflow_dispatch trigger is not configured", "CI closeout script"],
  [script, "Working tree must be clean", "CI closeout script"],
  [script, "not proven pushed to origin/${branch}", "CI closeout script"],
  [script, "origin/${branch}", "CI closeout script"],
  [script, "ci:status", "CI closeout script"],
  [runbook, "npm.cmd run ci:closeout", "delivery runbook"],
  [checklist, "npm run ci:closeout", "acceptance checklist"],
  [finalExecutionPlan, "ci:closeout", "final execution plan generator"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const workflow = parseWorkflowList("CI\tactive\t305833028\nOther\tdisabled_manually\t1\n", "CI");
assert(workflow.name === "CI", "workflow list parser should return the requested workflow");
assert(workflow.state === "active", "workflow list parser should expose active state");
assert(workflow.id === "305833028", "workflow list parser should expose workflow id");
assert(parseWorkflowList("Other\tactive\t1\n", "CI") === null, "workflow list parser should return null for missing workflow");

console.log("CI closeout contracts ok");
