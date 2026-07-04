const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", filePath), "utf8");
}

const generator = read("dashboard/server/scripts/generate-field-acceptance-carry-forward.js");
const packageJson = read("package.json");
const serverPackageJson = read("dashboard/server/package.json");
const finalRefresh = read("dashboard/server/scripts/generate-final-closeout-refresh.js");

[
  "FIELD_ACCEPTANCE_CARRY_FORWARD",
  "BLOCKING_RUNTIME_PREFIXES",
  "dashboard/server/src/",
  "dashboard/dashboard-web/src/",
  "Runtime-affecting files changed after source acceptance",
  "readyForHandover: true",
  "requiresFieldReview: false",
  "does not close field preflight",
].forEach((token) => assert(generator.includes(token), `carry-forward generator must include ${token}`));

assert(packageJson.includes("field:acceptance-carry-forward"), "root package should expose carry-forward script");
assert(packageJson.includes("verify:field-acceptance-carry-forward"), "root package should expose carry-forward verifier");
assert(packageJson.includes("verify:field-acceptance-carry-forward") && packageJson.includes("verify:field-acceptance"), "root smoke chain should include acceptance verifiers");
assert(serverPackageJson.includes("verify-field-acceptance-carry-forward-contracts.js"), "server verify chain should include carry-forward verifier");
assert(finalRefresh.includes("field:acceptance-carry-forward"), "final refresh should generate carry-forward acceptance evidence");
assert(finalRefresh.includes("Record current-commit carry-forward evidence"), "final refresh should describe carry-forward purpose");

console.log("field acceptance carry-forward contracts ok");
