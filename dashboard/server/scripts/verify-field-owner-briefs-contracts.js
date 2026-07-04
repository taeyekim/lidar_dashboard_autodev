const fs = require("fs");
const path = require("path");

const {
  buildManifest,
  buildMarkdown,
  buildOwnerBrief,
  ownerExecutionQueue,
  slug,
} = require("./generate-field-owner-briefs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-owner-briefs.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-owner-briefs",
  "Field Owner Briefs",
  "sourceFieldActionBoard",
  "Owner briefs split the latest field action board",
  "do not replace manual evidence",
  "Phase counts",
  "Execution Queue",
  "executionQueueCount",
  "ownerExecutionQueue",
  "phaseCounts",
  "buildOwnerBrief",
  "writeOwnerBriefs",
].forEach((token) => assertIncludes(generator, token, "field owner briefs generator"));

[
  "field:owner-briefs",
  "verify:field-owner-briefs",
  "generate-field-owner-briefs.js",
  "verify-field-owner-briefs-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-owner-briefs-contracts.js", "server verify chain");
assertIncludes(handoverPackage, "field:owner-briefs", "handover package generator");
assertIncludes(handoverPackage, "fieldOwnerBriefs", "handover package generator");
assertIncludes(handoverIndex, "Field Owner Briefs", "handover index generator");
assertIncludes(finalExecutionPlan, "field-owner-briefs", "final execution plan generator");
assertIncludes(finalExecutionPlan, "npm.cmd run field:owner-briefs", "final execution plan generator");
assertIncludes(runbook, "npm.cmd run field:owner-briefs", "delivery runbook");
assertIncludes(runbook, "artifacts/field-owner-briefs/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(runbook, "owner-specific `Execution Queue` rows", "delivery runbook");
assertIncludes(checklist, "npm run field:owner-briefs", "acceptance checklist");
assertIncludes(checklist, "artifacts/field-owner-briefs/<timestamp>/manifest.json", "acceptance checklist");
assertIncludes(checklist, "owner-specific `Execution Queue` rows", "acceptance checklist");
assertIncludes(matrix, "field:owner-briefs", "delivery evidence matrix");
assertIncludes(matrix, "artifacts/field-owner-briefs/<timestamp>/manifest.json", "delivery evidence matrix");

assert(slug("Control-board TCP") === "control-board-tcp", "slug should normalize owner names");

const actionBoard = {
  path: "artifacts/field-action-board/20260101-000000/manifest.json",
  data: {
    siteName: "delivery-site-a",
    baseUrl: "http://field.local:8080",
    executionQueue: [
      {
        order: 1,
        phase: "Security Evidence",
        priority: "P0",
        gateCount: 1,
        command: "npm.cmd run security:evidence -- --require-scanners",
      },
      {
        order: 2,
        phase: "Field Rehearsal",
        priority: "P0",
        gateCount: 1,
        command: "powershell.exe -File scripts/control-board-field-rehearsal.ps1",
      },
    ],
    ownerGroups: [
      {
        owner: "Auth/Security",
        total: 2,
        byPriority: { P0: 1, P1: 1 },
        byPhase: { "Security Evidence": 1, "Field Preflight": 1 },
        byActionType: { SECURITY_REVIEW_REQUIRED: 1, FIELD_ACTION_REQUIRED: 1 },
        commands: ["npm.cmd run security:evidence -- --require-scanners"],
        items: [
          {
            id: "GATE-001",
            priority: "P0",
            phase: "Security Evidence",
            actionType: "SECURITY_REVIEW_REQUIRED",
            category: "Security Evidence",
            status: "DELIVERY_FIX_REQUIRED",
            message: "Security delivery fix is required.",
            closeWhen: "Fix reported findings and rerun strict security evidence.",
            evidence: "artifacts/security/example/manifest.json",
          },
        ],
      },
    ],
  },
};

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "tester",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard,
});

assert(manifest.status === "OPEN", "fixture with owner groups should be OPEN");
assert(manifest.ownerCount === 1, "manifest should preserve owner count");
assert(manifest.openItemCount === 2, "manifest should sum open item counts");
assert(manifest.briefs[0].fileName === "auth-security.md", "manifest should expose owner brief file names");
assert(manifest.briefs[0].phaseCounts["Security Evidence"] === 1, "manifest should expose phase counts");
assert(manifest.briefs[0].executionQueueCount === 1, "manifest should expose owner execution queue count");
assert(manifest.sourceFieldActionBoard === actionBoard.path, "manifest should reference source action board");
assert(ownerExecutionQueue(actionBoard.data.ownerGroups[0], actionBoard.data.executionQueue).length === 1, "owner execution queue should filter by owner commands");

const indexMarkdown = buildMarkdown(manifest);
assert(indexMarkdown.includes("Field Owner Briefs"), "index markdown should include title");
assert(indexMarkdown.includes("auth-security.md"), "index markdown should include brief file");
assert(indexMarkdown.includes("Queue Items"), "index markdown should include queue item counts");
assert(indexMarkdown.includes("Phase Counts"), "index markdown should include phase counts");

const ownerMarkdown = buildOwnerBrief(actionBoard.data.ownerGroups[0], actionBoard.path, actionBoard.data.executionQueue);
assert(ownerMarkdown.includes("Field Owner Brief - Auth/Security"), "owner markdown should include owner title");
assert(ownerMarkdown.includes("Execution Queue"), "owner markdown should include owner execution queue");
assert(ownerMarkdown.includes("| 1 | Security Evidence | P0 | 1 |"), "owner markdown should include queued command order");
assert(ownerMarkdown.includes("GATE-001"), "owner markdown should include action items");
assert(ownerMarkdown.includes("Security Evidence"), "owner markdown should include item phase");
assert(ownerMarkdown.includes("DELIVERY_FIX_REQUIRED"), "owner markdown should include delivery-fix status");
assert(ownerMarkdown.includes("Security delivery fix is required."), "owner markdown should include message");
assert(ownerMarkdown.includes("This owner brief is an execution aid"), "owner markdown should include guardrail");

const placeholderMetadata = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "field-reviewer",
  siteName: "field-site",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard: {
    path: "artifacts/field-action-board/20260101-000000/manifest.json",
    data: { ownerGroups: [] },
  },
});
assert(placeholderMetadata.status === "OPEN", "placeholder metadata should keep owner briefs open");
assert(placeholderMetadata.ownerCount === 1, "placeholder metadata should create PM/QA owner brief");
assert(placeholderMetadata.openItemCount === 2, "placeholder reviewer/site should create metadata owner items");

const missing = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard: null,
});
assert(missing.status === "ACTION_BOARD_MISSING", "missing action board should be explicit");

console.log("field owner briefs contracts ok");
