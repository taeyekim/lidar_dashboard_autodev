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

const script = readProjectFile("scripts/db-field-rehearsal.ps1");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const acceptance = readProjectFile("docs/ops/acceptance-checklist.md");
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const packageJson = readProjectFile("package.json");

[
  "BaseUrl",
  "Reviewer",
  "SiteName",
  "UserId",
  "Password",
  "SEED_ADMIN_USER_ID",
  "SEED_ADMIN_PASSWORD",
  "/api/auth/login",
  "CookieJar",
  "operator cookie auth login",
  "RunDeploy",
  "RunSeed",
  "npm run db:status",
  "npm run db:deploy",
  "npm run db:seed",
  "/api/database/health",
  "/api/status",
  "/api/devices/status",
  "/api/sites",
  "/api/zones",
  "/api/devices",
  "vehicleTracks",
  "controlCommands",
  "eventLogs",
  "controlCommandLogs",
  "deviceStatusLogs",
  "manifest.json",
  "manifest.md",
  "FIELD_REHEARSAL_PASS",
  "hostName",
  "db prisma field rehearsal ok",
].forEach((token) => assertIncludes(script, token, "DB field rehearsal script"));

[
  "scripts/db-field-rehearsal.ps1",
  "-RunDeploy",
  "-RunSeed",
  "artifacts/field-db-rehearsal",
].forEach((token) => assertIncludes(runbook, token, "delivery runbook"));

[
  "scripts/db-field-rehearsal.ps1",
  "DB And Prisma",
  "Field seed data reviewed",
].forEach((token) => assertIncludes(matrix, token, "delivery evidence matrix"));

[
  "scripts/db-field-rehearsal.ps1",
  "database/health",
  "Prisma seed",
].forEach((token) => assertIncludes(acceptance, token, "acceptance checklist"));

assertIncludes(deliveryEvidence, "field-db-rehearsal", "delivery evidence generator");
assertIncludes(deliveryEvidence, "DB And Prisma", "delivery evidence generator");
assertIncludes(packageJson, "verify:db-field-rehearsal", "package scripts");
assertIncludes(packageJson, "verify-db-field-rehearsal-contracts.js", "package scripts");

console.log("DB field rehearsal contracts ok");
