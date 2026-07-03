const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/handover-package",
  "delivery:evidence",
  "completion:audit",
  "handover:index",
  "field:closure-plan",
  "field:readiness",
  "evidenceRefs",
  "canMarkGoalComplete",
  "controlBoardSafetyStatus",
  "Control-board safety status",
  "failedCommandCount",
  "strictFailureReasons",
  "--strict",
  "handover package strict gate failed",
].forEach((token) => assertIncludes(generator, token, "handover package generator"));

[
  "handover:package",
  "verify:handover-package",
  "generate-handover-package.js",
  "verify-handover-package-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-handover-package-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run handover:package", "delivery runbook");
assertIncludes(runbook, "artifacts/handover-package/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run handover:package", "acceptance checklist");
assertIncludes(matrix, "npm run handover:package", "delivery evidence matrix");

console.log("handover package contracts ok");
