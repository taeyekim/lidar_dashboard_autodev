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

const generator = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/handover-index",
  "Delivery Evidence",
  "Completion Audit",
  "Field Preflight",
  "Field Acceptance",
  "Field Readiness",
  "DB And Prisma Field Rehearsal",
  "Lidar Ingest Field Rehearsal",
  "Control Board Field Rehearsal",
  "Runtime Evidence",
  "Security Evidence",
  "missingRequiredAreas",
  "staleAreas",
  "reviewAreas",
  "consistencyIssues",
  "sourceDeliveryManifest",
  "staleEntryCount",
  "STALE",
  "canMarkGoalComplete",
].forEach((token) => assertIncludes(generator, token, "handover index generator"));

[
  "handover:index",
  "verify:handover-index",
  "generate-handover-index.js",
  "verify-handover-index-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-handover-index-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run handover:index", "delivery runbook");
assertIncludes(runbook, "artifacts/handover-index/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run handover:index", "acceptance checklist");
assertIncludes(matrix, "npm run handover:index", "delivery evidence matrix");

console.log("handover index contracts ok");
