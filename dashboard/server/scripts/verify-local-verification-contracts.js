const fs = require("fs");
const path = require("path");

const {
  buildCommands,
  buildManifest,
  buildMarkdown,
} = require("./generate-local-verification-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-local-verification-evidence.js");
const packageJson = readProjectFile("package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  "artifacts/local-verification",
  "Local Verification Evidence",
  "run\", \"smoke",
  "include-server-test",
  "include-web-lint",
  "include-docker-config",
  "failedCommandCount",
  "passedCommandCount",
  "does not replace field runtime, hardware TCP ACK, external CI, or reviewer-signed evidence",
].forEach((token) => assertIncludes(generator, token, "local verification generator"));

[
  "local:verification",
  "verify:local-verification",
  "generate-local-verification-evidence.js",
  "verify-local-verification-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

const commandSpecs = buildCommands({
  timeoutMs: 1000,
  includeServerTest: true,
  includeWebLint: true,
  includeDockerConfig: true,
});
assert(commandSpecs.some((item) => item.label === "smoke" && item.args.join(" ") === "run smoke"), "local verification should run smoke by default");
assert(commandSpecs.some((item) => item.label === "server test"), "local verification should optionally include server tests");
assert(commandSpecs.some((item) => item.label === "frontend lint"), "local verification should optionally include frontend lint");
assert(commandSpecs.some((item) => item.label === "docker compose config"), "local verification should optionally include docker compose config");

const manifest = buildManifest({
  generatedBy: "reviewer",
  siteName: "site",
  commands: [
    { label: "smoke", command: "npm.cmd run smoke", exitCode: 0, logFile: "smoke.log" },
    { label: "server test", command: "npm.cmd run server:test", exitCode: 1, logFile: "server-test.log" },
  ],
});
assert(manifest.status === "REVIEW", "failed local verification command should set REVIEW status");
assert(manifest.passedCommandCount === 1, "manifest should count passed commands");
assert(manifest.failedCommandCount === 1, "manifest should count failed commands");

const markdown = buildMarkdown(manifest);
[
  "Local Verification Evidence",
  "Failed command count: 1",
  "npm.cmd run smoke",
  "does not replace field runtime",
].forEach((token) => assert(markdown.includes(token), `markdown should include ${token}`));

assertIncludes(runbook, "local:verification", "delivery runbook");
assertIncludes(runbook, "artifacts/local-verification/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "local:verification", "acceptance checklist");

console.log("local verification contracts ok");
