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

const generator = readProjectFile("dashboard/server/scripts/generate-field-readiness-report.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-readiness",
  "Field Readiness Report",
  "Docker daemon",
  "Nginx/API health",
  "DEVICE_INGEST_API_KEY",
  "NGINX_SWAGGER_ALLOW",
  "gitleaks",
  "trivy",
  "zap-baseline.py",
  "missingExampleKeys",
].forEach((token) => assertIncludes(generator, token, "field readiness generator"));

[
  "field:readiness",
  "verify:field-readiness",
  "generate-field-readiness-report.js",
  "verify-field-readiness-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-readiness-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run field:readiness", "delivery runbook");
assertIncludes(checklist, "npm run field:readiness", "acceptance checklist");
assertIncludes(matrix, "npm run field:readiness", "delivery evidence matrix");

console.log("field readiness contracts ok");
