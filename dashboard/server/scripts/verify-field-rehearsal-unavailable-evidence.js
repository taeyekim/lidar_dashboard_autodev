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

const generator = readProjectFile("dashboard/server/scripts/generate-field-rehearsal-unavailable-evidence.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "FIELD_REHEARSAL_UNAVAILABLE",
  "artifacts/field-db-rehearsal",
  "artifacts/field-lidar-rehearsal",
  "artifacts/field-control-board-rehearsal",
  "DB And Prisma",
  "Lidar Ingest",
  "Control Board TCP",
  "requiredCommand",
  "replacementOwner",
  "targetRecheckDate",
  "approvalNote",
  "buildGitState",
  "git: buildGitState",
  "Git commit",
  "Git pushed to origin/dev",
  "Working tree clean",
  "unavailableAcceptance",
  "ownerStatus",
  "recheckStatus",
  "isPlaceholderValue",
  "isIsoDate",
  "ownerQualityStatus",
  "recheckQualityStatus",
  "UNASSIGNED",
  "REQUIRED_BEFORE_HANDOVER",
  "RECORDED",
  "SCHEDULED",
  "nextActions",
  "status: \"REVIEW\"",
].forEach((token) => assertIncludes(generator, token, "field rehearsal unavailable generator"));

[
  "field:rehearsal-unavailable",
  "verify:field-rehearsal-unavailable",
  "generate-field-rehearsal-unavailable-evidence.js",
  "verify-field-rehearsal-unavailable-evidence.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-rehearsal-unavailable-evidence.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run field:rehearsal-unavailable", "delivery runbook");
assertIncludes(runbook, "FIELD_REHEARSAL_UNAVAILABLE", "delivery runbook");
assertIncludes(runbook, "--replacement-owner", "delivery runbook");
assertIncludes(runbook, "--target-recheck-date", "delivery runbook");
assertIncludes(runbook, "YYYY-MM-DD", "delivery runbook");
assertIncludes(acceptance, "field:rehearsal-unavailable", "acceptance checklist");
assertIncludes(acceptance, "--target-recheck-date=YYYY-MM-DD", "acceptance checklist");
assertIncludes(matrix, "field:rehearsal-unavailable", "delivery evidence matrix");

console.log("field rehearsal unavailable evidence contracts ok");
