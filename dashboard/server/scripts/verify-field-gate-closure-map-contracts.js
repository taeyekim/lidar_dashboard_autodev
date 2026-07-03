const fs = require("fs");
const path = require("path");

const {
  buildCommandGroups,
  buildManifest,
  buildMarkdown,
} = require("./generate-field-gate-closure-map");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-gate-closure-map.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  "artifacts/field-gate-closure-map",
  "Field Gate Closure Map",
  "Command Summary",
  "Closure Map",
  "Execution Queue Linkage",
  "sourceFieldActionBoard",
  "commandGroups",
  "executionOrder",
  "openGateCount",
  "categoryCounts",
  "statusCounts",
].forEach((token) => assertIncludes(generator, token, "field gate closure map generator"));

[
  "field:gate-closure-map",
  "verify:field-gate-closure-map",
  "generate-field-gate-closure-map.js",
  "verify-field-gate-closure-map-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-gate-closure-map-contracts.js", "server verify chain");
assertIncludes(handoverPackage, "field:gate-closure-map", "handover package generator");
assertIncludes(handoverPackage, "fieldGateClosureMap", "handover package generator");
assertIncludes(handoverIndex, "Field Gate Closure Map", "handover index generator");
assertIncludes(runbook, "npm.cmd run field:gate-closure-map", "delivery runbook");
assertIncludes(runbook, "artifacts/field-gate-closure-map/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(runbook, "Execution Queue Linkage", "delivery runbook");
assertIncludes(checklist, "npm run field:gate-closure-map", "acceptance checklist");
assertIncludes(checklist, "Execution Queue Linkage", "acceptance checklist");

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
        gateCount: 2,
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
    actionItems: [
      {
        id: "GATE-001",
        owner: "Auth/Security",
        phase: "Security Evidence",
        priority: "P0",
        actionType: "SECURITY_REVIEW_REQUIRED",
        category: "Security Evidence",
        status: "DELIVERY_FIX_REQUIRED",
        evidence: "artifacts/security/example/manifest.json",
        closeWhen: "Fix reported security findings and rerun strict security evidence.",
        command: "npm.cmd run security:evidence -- --require-scanners",
      },
      {
        id: "GATE-002",
        owner: "Auth/Security",
        phase: "Security Evidence",
        priority: "P1",
        actionType: "SECURITY_REVIEW_REQUIRED",
        category: "Security Evidence",
        status: "BLOCKED",
        evidence: "artifacts/security/example/manifest.json",
        closeWhen: "Run scanners or attach accepted risk evidence.",
        command: "npm.cmd run security:evidence -- --require-scanners",
      },
      {
        id: "GATE-003",
        owner: "Control-board TCP",
        phase: "Field Rehearsal",
        priority: "P0",
        actionType: "FIELD_ACTION_REQUIRED",
        category: "Control Board TCP",
        status: "DRY_RUN_SAFE",
        evidence: "artifacts/field-control-board-rehearsal/example/manifest.json",
        closeWhen: "Record live TCP or approved dry-run rehearsal evidence.",
        command: "powershell.exe -File scripts/control-board-field-rehearsal.ps1",
      },
    ],
  },
};

const groups = buildCommandGroups(actionBoard);
assert(groups.length === 2, "command groups should group repeated commands");
assert(groups[0].commandId === "CMD-001" && groups[1].commandId === "CMD-002", "command ids should be renumbered after execution-order sorting");
assert(groups[0].executionOrder === 1, "command groups should preserve execution queue order");
assert(groups[0].executionPriority === "P0", "command groups should preserve execution queue priority");
assert(groups[0].executionGateCount === 2, "command groups should preserve execution queue gate count");
assert(groups[0].gateCount === 2, "largest command group should preserve gate count");
assert(groups[0].gateIds.includes("GATE-001") && groups[0].gateIds.includes("GATE-002"), "group should preserve gate ids");
assert(groups[0].owners.includes("Auth/Security"), "group should preserve owners");
assert(groups[0].phases.includes("Security Evidence"), "group should preserve phases");
assert(groups[0].categoryCounts["Security Evidence"] === 2, "group should count categories");
assert(groups[0].statusCounts.DELIVERY_FIX_REQUIRED === 1, "group should preserve delivery-fix status count");
assert(groups[0].evidencePaths.length === 1, "group should de-duplicate evidence paths");
assert(groups[0].closeCriteria.length === 2, "group should preserve distinct close criteria");
assert(
  groups[0].closeCriteria.some((item) => item.includes("Fix reported security findings")),
  "group should preserve delivery-fix close criteria",
);

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "tester",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard,
});

assert(manifest.status === "OPEN", "fixture with gates should be OPEN");
assert(manifest.commandCount === 2, "manifest should preserve command count");
assert(manifest.openGateCount === 3, "manifest should preserve open gate count");
assert(manifest.sourceFieldActionBoard === actionBoard.path, "manifest should reference action board");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Gate Closure Map"), "markdown should include title");
assert(markdown.includes("Command Summary"), "markdown should include command summary");
assert(markdown.includes("Execution Queue Linkage"), "markdown should include execution queue linkage");
assert(markdown.includes("Closure Map"), "markdown should include closure map");
assert(markdown.includes("DELIVERY_FIX_REQUIRED"), "markdown should include delivery-fix status");
assert(markdown.includes("GATE-001, GATE-002"), "markdown should include grouped gate ids");

const ready = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard: {
    path: "artifacts/field-action-board/20260101-000000/manifest.json",
    data: { actionItems: [] },
  },
});
assert(ready.status === "READY_TO_CLOSE", "empty action board should produce READY_TO_CLOSE map");
assert(ready.openGateCount === 0, "empty action board should have no open gates");

const placeholderMetadata = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "field-reviewer",
  siteName: "field-site",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard: {
    path: "artifacts/field-action-board/20260101-000000/manifest.json",
    data: { actionItems: [] },
  },
});
assert(placeholderMetadata.status === "OPEN", "placeholder metadata should keep gate closure map open");
assert(placeholderMetadata.openGateCount === 2, "placeholder reviewer/site should create metadata closure gates");

const missing = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  actionBoard: null,
});
assert(missing.status === "ACTION_BOARD_MISSING", "missing action board should be explicit");

console.log("field gate closure map contracts ok");
