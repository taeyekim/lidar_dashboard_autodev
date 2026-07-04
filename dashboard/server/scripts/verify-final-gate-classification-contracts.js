const fs = require("fs");
const path = require("path");
const {
  bucketForGate,
  buildManifest,
  buildMarkdown,
  summarizeBuckets,
} = require("./generate-final-gate-classification");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const generator = readProjectFile("dashboard/server/scripts/generate-final-gate-classification.js");
const finalRefresh = readProjectFile("dashboard/server/scripts/generate-final-closeout-refresh.js");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  [packageJson, "final:gate-classification", "root package scripts"],
  [packageJson, "verify:final-gate-classification", "root package scripts"],
  [packageJson, "verify-final-gate-classification-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-gate-classification-contracts.js", "server verify chain"],
  [generator, "artifacts/final-gate-classification", "final gate classification generator"],
  [generator, "OPEN_GATES_CLASSIFIED", "final gate classification generator"],
  [generator, "localOnlyClosableCount", "final gate classification generator"],
  [generator, "conditionalLocalCount", "final gate classification generator"],
  [generator, "refreshOnlyCount", "final gate classification generator"],
  [generator, "fieldRequiredCount", "final gate classification generator"],
  [generator, "All Gates By Bucket", "final gate classification generator"],
  [generator, "Codex must not fabricate reviewer signatures", "final gate classification generator"],
  [generator, "final:status READY_TO_CLOSE", "final gate classification generator"],
  [generator, "security-tooling-closeout", "final gate classification generator"],
  [generator, "ci-status-readonly", "final gate classification generator"],
  [generator, "field-owner-bundle", "final gate classification generator"],
  [finalRefresh, "final-gate-classification", "final closeout refresh generator"],
  [finalRefresh, "latestFinalGateClassification", "final closeout refresh generator"],
  [checklist, "npm run final:gate-classification", "acceptance checklist"],
  [checklist, "artifacts/final-gate-classification/<timestamp>/manifest.json", "acceptance checklist"],
  [checklist, "auto-mode routing evidence", "acceptance checklist"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

assert(bucketForGate({ category: "Control Board TCP", message: "LIVE_TCP ACK required" }) === "hardware_runtime", "control-board gates should route to hardware runtime");
assert(bucketForGate({ category: "Security Scanner Closeout", message: "Trivy filesystem scanner closeout" }) === "security_tooling", "scanner gates should route to security tooling");
assert(bucketForGate({ category: "Manual Evidence", message: "Operator UI Walkthrough evidence is INVALID" }) === "manual_reviewer", "manual evidence gates should route to manual reviewer");
assert(bucketForGate({ category: "CI Status", message: "No CI workflow run was found" }) === "external_ci", "CI gates should route to external CI");
assert(bucketForGate({ category: "Field Evidence", message: "JWT secret placeholder" }) === "field_configuration", "env gates should route to field configuration");

const buckets = summarizeBuckets([
  { category: "Control Board TCP", status: "DRY_RUN_SAFE", actionType: "FIELD_ACTION_REQUIRED", message: "LIVE_TCP ACK required" },
  { category: "Security Scanner Closeout", status: "UNVERIFIED", actionType: "SECURITY_REVIEW_REQUIRED", message: "gitleaks scanner closeout" },
  { category: "Manual Evidence", status: "INVALID", actionType: "MANUAL_EVIDENCE_REQUIRED", message: "Operator UI Walkthrough evidence is INVALID" },
]);

assert(buckets.some((bucket) => bucket.id === "hardware_runtime" && bucket.gateCount === 1), "summary should include hardware runtime bucket");
assert(buckets.some((bucket) => bucket.id === "security_tooling" && bucket.gateCount === 1), "summary should include security tooling bucket");
assert(buckets.some((bucket) => bucket.id === "manual_reviewer" && bucket.gateCount === 1), "summary should include manual reviewer bucket");
assert(buckets.every((bucket) => bucket.gates.length === bucket.gateCount), "each bucket should retain every classified gate row");
assert(
  buckets.reduce((sum, bucket) => sum + bucket.gates.length, 0) === 3,
  "bucket gate rows should cover the full remaining gate set",
);

const manifest = buildManifest({
  baseUrl: "http://field.local:8080",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
});
assert(manifest.sourceFinalStatus, "manifest should include source final status");
assert(manifest.summary, "manifest should include summary");
assert(Array.isArray(manifest.buckets), "manifest should include buckets");
assert(
  manifest.buckets.reduce((sum, bucket) => sum + (bucket.gates || []).length, 0) === manifest.summary.remainingGateCount,
  "manifest bucket gate rows should add up to the remaining gate count",
);
assert(Array.isArray(manifest.nextCodexActions), "manifest should include next Codex actions");
assert(manifest.guardrails.some((item) => item.includes("must not fabricate")), "manifest should include fabrication guardrail");

const markdown = buildMarkdown({
  ...manifest,
  status: "OPEN_GATES_CLASSIFIED",
  summary: {
    remainingGateCount: 3,
    localOnlyClosableCount: 0,
    conditionalLocalCount: 1,
    refreshOnlyCount: 0,
    fieldRequiredCount: 2,
    bucketCount: 2,
  },
  buckets,
});
assert(markdown.includes("Final Gate Classification"), "markdown should include title");
assert(markdown.includes("Field-required gates"), "markdown should include field-required summary");
assert(markdown.includes("Refresh-only gates"), "markdown should include refresh-only summary");
assert(markdown.includes("Next Codex Actions"), "markdown should include next action table");
assert(markdown.includes("All Gates By Bucket"), "markdown should include the full gate table section");
assert(markdown.includes("This classification is routing evidence"), "markdown should include evidence guardrail");

console.log("final gate classification contracts ok");
