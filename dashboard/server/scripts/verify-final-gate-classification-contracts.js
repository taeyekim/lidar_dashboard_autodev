const fs = require("fs");
const path = require("path");
const {
  buildBucketGateCounts,
  bucketForGate,
  buildManifest,
  buildMarkdown,
  buildOwnerCloseoutMarkdown,
  buildOwnerCloseoutQueue,
  summarizeBuckets,
  slug,
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
  [generator, "bucketGateCounts", "final gate classification generator"],
  [generator, "buildBucketGateCounts", "final gate classification generator"],
  [generator, "ownerCloseoutQueue", "final gate classification generator"],
  [generator, "ownerCloseoutFileIndex", "final gate classification generator"],
  [generator, "buildOwnerCloseoutQueue", "final gate classification generator"],
  [generator, "buildOwnerCloseoutMarkdown", "final gate classification generator"],
  [generator, "writeOwnerCloseoutFiles", "final gate classification generator"],
  [generator, "id: gate.id || null", "final gate classification generator"],
  [generator, "Gate ID", "final gate classification generator"],
  [generator, "Owner Closeout Queue", "final gate classification generator"],
  [generator, "Owner Closeout Files", "final gate classification generator"],
  [generator, "This file is an execution aid, not completion evidence", "final gate classification generator"],
  [generator, "| Order | Bucket | Owner | Gates | Local Automation | Top Categories | Next Action | Done When |", "final gate classification generator"],
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
  [checklist, "Owner Closeout Queue", "acceptance checklist"],
  [checklist, "per-bucket owner closeout markdown files", "acceptance checklist"],
  [checklist, "auto-mode routing evidence", "acceptance checklist"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

assert(bucketForGate({ category: "Control Board TCP", message: "LIVE_TCP ACK required" }) === "hardware_runtime", "control-board gates should route to hardware runtime");
assert(bucketForGate({ category: "Strict Gate", message: "Control Board TCP field evidence has 1 REVIEW item" }) === "hardware_runtime", "control board strict gates should route to hardware runtime");
assert(bucketForGate({ category: "Security Scanner Closeout", message: "Trivy filesystem scanner closeout" }) === "security_tooling", "scanner gates should route to security tooling");
assert(bucketForGate({ category: "Manual Evidence", message: "Operator UI Walkthrough evidence is INVALID" }) === "manual_reviewer", "manual evidence gates should route to manual reviewer");
assert(bucketForGate({ category: "CI Status", message: "No CI workflow run was found" }) === "external_ci", "CI gates should route to external CI");
assert(bucketForGate({ category: "Field Evidence", message: "JWT secret placeholder" }) === "field_configuration", "env gates should route to field configuration");
assert(bucketForGate({ category: "Field Risk Register", message: "field risk register has 48 open risk items" }) === "field_acceptance", "field risk/action gates should route to field acceptance");

const buckets = summarizeBuckets([
  { id: "gate-control", area: "Control Board TCP", gate: "Control Board TCP: DRY_RUN_SAFE", category: "Control Board TCP", status: "DRY_RUN_SAFE", actionType: "FIELD_ACTION_REQUIRED", message: "LIVE_TCP ACK required" },
  { id: "gate-security", area: "Security Scanner Closeout", gate: "Security Scanner Closeout: UNVERIFIED", category: "Security Scanner Closeout", status: "UNVERIFIED", actionType: "SECURITY_REVIEW_REQUIRED", message: "gitleaks scanner closeout" },
  { id: "gate-manual", area: "Manual Evidence", gate: "Manual Evidence: INVALID", category: "Manual Evidence", status: "INVALID", actionType: "MANUAL_EVIDENCE_REQUIRED", message: "Operator UI Walkthrough evidence is INVALID" },
]);

assert(buckets.some((bucket) => bucket.id === "hardware_runtime" && bucket.gateCount === 1), "summary should include hardware runtime bucket");
assert(buckets.some((bucket) => bucket.id === "security_tooling" && bucket.gateCount === 1), "summary should include security tooling bucket");
assert(buckets.some((bucket) => bucket.id === "manual_reviewer" && bucket.gateCount === 1), "summary should include manual reviewer bucket");
assert(buckets.every((bucket) => bucket.gates.length === bucket.gateCount), "each bucket should retain every classified gate row");
assert(
  buckets.flatMap((bucket) => bucket.gates).every((gate) => gate.id && gate.area && gate.gate),
  "bucket gate rows should preserve final-status id, area, and gate tracking fields",
);
assert(
  buckets.reduce((sum, bucket) => sum + bucket.gates.length, 0) === 3,
  "bucket gate rows should cover the full remaining gate set",
);
const bucketGateCounts = buildBucketGateCounts(buckets);
assert(bucketGateCounts.hardware_runtime === 1, "bucket gate counts should expose hardware runtime count by id");
assert(bucketGateCounts.security_tooling === 1, "bucket gate counts should expose security tooling count by id");
const ownerQueue = buildOwnerCloseoutQueue(buckets);
assert(ownerQueue.length === buckets.length, "owner closeout queue should include every open bucket");
assert(ownerQueue[0].gateCount > 0, "owner closeout queue should preserve gate counts");
assert(ownerQueue.every((item) => item.fileName && item.fileName.endsWith(".md")), "owner closeout queue should expose markdown file names");
assert(slug("Hardware + Backend") === "hardware-backend", "slug should create stable owner file names");

const manifest = buildManifest({
  baseUrl: "http://field.local:8080",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
});
assert(manifest.sourceFinalStatus, "manifest should include source final status");
assert(manifest.summary, "manifest should include summary");
assert(manifest.summary.bucketGateCounts, "manifest summary should include bucket gate counts");
assert(Array.isArray(manifest.buckets), "manifest should include buckets");
assert(Array.isArray(manifest.ownerCloseoutQueue), "manifest should include owner closeout queue");
assert(Array.isArray(manifest.ownerCloseoutFileIndex), "manifest should include owner closeout file index");
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
    bucketGateCounts,
    bucketCount: 2,
  },
  buckets,
  ownerCloseoutQueue: ownerQueue,
  ownerCloseoutFileIndex: ownerQueue.map((item) => ({
    order: item.order,
    bucketId: item.bucketId,
    bucketLabel: item.bucketLabel,
    owner: item.owner,
    gateCount: item.gateCount,
    fileName: item.fileName,
  })),
});
assert(markdown.includes("Final Gate Classification"), "markdown should include title");
assert(markdown.includes("Field-required gates"), "markdown should include field-required summary");
assert(markdown.includes("Refresh-only gates"), "markdown should include refresh-only summary");
assert(markdown.includes("Bucket gate counts"), "markdown should include bucket gate count summary");
assert(markdown.includes("Owner Closeout Queue"), "markdown should include owner closeout queue");
assert(markdown.includes("Owner Closeout Files"), "markdown should include owner closeout files");
assert(markdown.includes("Next Codex Actions"), "markdown should include next action table");
assert(markdown.includes("All Gates By Bucket"), "markdown should include the full gate table section");
assert(markdown.includes("Gate ID"), "markdown should include gate id columns");
assert(markdown.includes("gate-control"), "markdown should preserve source gate ids");
assert(markdown.includes("This classification is routing evidence"), "markdown should include evidence guardrail");
const ownerMarkdown = buildOwnerCloseoutMarkdown(ownerQueue[0], buckets.find((bucket) => bucket.id === ownerQueue[0].bucketId), manifest);
assert(ownerMarkdown.includes("Owner Closeout"), "owner markdown should include title");
assert(ownerMarkdown.includes("execution aid, not completion evidence"), "owner markdown should include guardrail");
assert(ownerMarkdown.includes("## Gates"), "owner markdown should include gate table");
assert(ownerMarkdown.includes("Gate ID"), "owner markdown should include gate id columns");

console.log("final gate classification contracts ok");
