const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const envContracts = readProjectFile("dashboard/server/scripts/verify-env-contracts.js");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  "Requirements",
  "API And Swagger",
  "DB And Prisma",
  "Lidar Ingest",
  "Control Board TCP",
  "Frontend Control UI",
  "Traffic Statistics",
  "Authentication",
  "Nginx And Runtime",
  "Security",
  "Delivery Evidence",
].forEach((area) => {
  assert(matrix.includes(`| ${area} |`), `delivery evidence matrix is missing area: ${area}`);
});

[
  "npm run verify:swagger-contracts",
  "npm run verify:prisma-contracts",
  "npm run ci:db",
  "npm run verify:wrongway-contracts",
  "npm run verify:control-board-protocol",
  "npm run verify:control-board-tcp",
  "npm run verify:frontend-ui-contracts",
  "npm run verify:statistics-contracts",
  "npm run verify:auth-cookie",
  "npm run verify:delivery-proxy-contracts",
  "npm run runtime:evidence",
  "npm run verify:audit-policy",
  "npm run security:evidence",
  "npm run delivery:evidence",
  "artifacts/delivery/<timestamp>/runtime/",
  "artifacts/delivery/<timestamp>/security/",
  "scripts/runtime-smoke.ps1",
  "CONTROL_BOARD_DRY_RUN=false",
].forEach((token) => {
  assert(matrix.includes(token), `delivery evidence matrix is missing token: ${token}`);
});

[
  [packageJson, "verify:delivery-evidence-matrix", "root package scripts"],
  [packageJson, "verify:delivery-evidence-matrix", "root smoke chain"],
  [serverPackageJson, "verify-delivery-evidence-matrix.js", "server verify chain"],
  [deliveryEvidence, "Delivery Evidence Matrix", "delivery evidence generator"],
  [deliveryEvidence, "delivery-evidence-matrix.md", "delivery evidence generator"],
  [deliveryEvidence, "parseEvidenceMatrix", "delivery evidence generator"],
  [deliveryEvidence, "buildAutomatedEvidenceCoverage", "delivery evidence generator"],
  [deliveryEvidence, "automatedEvidenceCoverage", "delivery evidence generator"],
  [deliveryEvidence, "Automated Evidence Coverage", "delivery evidence generator"],
  [deliveryEvidence, "Companion Evidence", "delivery evidence generator"],
  [deliveryEvidence, "COMPANION_EVIDENCE", "delivery evidence generator"],
  [deliveryEvidence, "OPTIONAL_SECURITY_FIELD", "delivery evidence generator"],
  [deliveryEvidence, "SELF", "delivery evidence generator"],
  [deliveryEvidence, "runtime:evidence", "delivery evidence generator"],
  [deliveryEvidence, "security:evidence", "delivery evidence generator"],
  [deliveryEvidence, "DB_REQUIRED", "delivery evidence generator"],
  [deliveryEvidence, "RUNTIME_OR_FIELD", "delivery evidence generator"],
  [deliveryEvidence, "fieldEvidenceStillRequired", "delivery evidence generator"],
  [deliveryEvidence, "Requirement Area | Field Evidence", "delivery evidence generator"],
  [envContracts, "delivery-evidence-matrix.md", "environment contract verifier"],
  [deliveryRunbook, "delivery-evidence-matrix.md", "delivery runbook"],
  [acceptanceChecklist, "delivery-evidence-matrix.md", "acceptance checklist"],
].forEach(([content, token, label]) => {
  assert(content.includes(token), `${label} is missing ${token}`);
});

console.log("delivery evidence matrix contracts ok");
