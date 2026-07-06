const fs = require("fs");
const path = require("path");

const {
  buildManifest,
  buildMarkdown,
  buildActionItems,
  buildExecutionQueue,
  commandForGate,
  groupByOwner,
  groupByPhase,
  ownerForGate,
  phaseForGate,
  priorityForGate,
  prerequisiteHintsForGate,
} = require("./generate-field-action-board");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-action-board.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-action-board",
  "Owner Summary",
  "Owner Commands",
  "Execution Queue",
  "Phase Summary",
  "This board organizes final-status gates for field execution",
  "Field Env Closeout",
  "field:env-closeout",
  "Auth/Security",
  "LiDAR Ingest",
  "Control-board TCP",
  "Nginx Delivery",
  "PM/QA",
  "Backend/Runtime",
  "P0",
  "P1",
  "P2",
  "phaseForGate",
  "phaseGroups",
  "byPhase",
  "sourceFinalStatus",
  "sourceGateId",
  "Source Gate ID",
  "sourceGateIds",
  "FIELD_REVIEWER",
  "FIELD_SITE_NAME",
  "closeoutCommands",
  "dockerScannerRuntime",
  "runtimeNoteForGate",
  "Runtime Note",
  "Risk Acceptance Evidence",
  "prerequisiteHintsForGate",
  "prerequisites",
  "Prerequisites",
  "CONTROL_BOARD_HOST",
  "CONTROL_BOARD_LIVE_APPROVED",
  "DEVICE_INGEST_API_KEY",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "NGINX_SWAGGER_ALLOW",
].forEach((token) => assertIncludes(generator, token, "field action board generator"));

[
  "field:action-board",
  "verify:field-action-board",
  "generate-field-action-board.js",
  "verify-field-action-board-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-action-board-contracts.js", "server verify chain");
assertIncludes(handoverPackage, "field:action-board", "handover package generator");
assertIncludes(handoverPackage, "fieldActionBoard", "handover package generator");
assertIncludes(handoverIndex, "Field Action Board", "handover index generator");
assertIncludes(finalExecutionPlan, "field-action-board", "final execution plan generator");
assertIncludes(finalExecutionPlan, "npm.cmd run field:action-board", "final execution plan generator");
assertIncludes(runbook, "npm.cmd run field:action-board", "delivery runbook");
assertIncludes(runbook, "artifacts/field-action-board/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(runbook, "Execution Queue", "delivery runbook");
assertIncludes(checklist, "npm run field:action-board", "acceptance checklist");
assertIncludes(checklist, "artifacts/field-action-board/<timestamp>/manifest.json", "acceptance checklist");
assertIncludes(checklist, "Execution Queue", "acceptance checklist");
assertIncludes(matrix, "field:action-board", "delivery evidence matrix");
assertIncludes(matrix, "artifacts/field-action-board/<timestamp>/manifest.json", "delivery evidence matrix");
assertIncludes(matrix, "Execution Queue", "delivery evidence matrix");

const gates = [
  {
    id: "final-security-delivery-fix",
    area: "Security Evidence",
    gate: "Security Evidence: DELIVERY_FIX_REQUIRED",
    actionType: "SECURITY_REVIEW_REQUIRED",
    category: "Security Evidence",
    status: "DELIVERY_FIX_REQUIRED",
    message: "1 security check requires delivery fixes.",
    closeWhen: "Fix the reported security findings and rerun strict security evidence.",
    evidence: "artifacts/security/example/manifest.json",
  },
  {
    id: "final-security-scanner-closeout",
    area: "Security Scanner Closeout",
    gate: "Security Scanner Closeout: UNVERIFIED",
    actionType: "SECURITY_REVIEW_REQUIRED",
    category: "Security Scanner Closeout",
    status: "UNVERIFIED",
    message: "gitleaks scanner closeout is UNVERIFIED.",
    closeWhen: "Install gitleaks or document reviewer risk acceptance.",
    evidence: "artifacts/security/example/manifest.json",
    scanner: "gitleaks",
    closeoutCommands: {
      nativeCommand: "gitleaks detect --source . --redact",
      dockerFallbackCommand: "npm.cmd run security:evidence -- --require-scanners --use-docker-scanners",
      riskAcceptanceEvidence: "artifacts/manual/field-risk-acceptance.md",
    },
    dockerScannerRuntime: {
      ready: false,
      error: "Docker daemon is not reachable.",
    },
  },
  {
    id: "final-control-board-tcp",
    area: "Control Board TCP",
    gate: "Control Board TCP: DRY_RUN_SAFE",
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Control Board TCP",
    status: "DRY_RUN_SAFE",
    message: "Control-board safety is not LIVE_TCP_READY.",
    closeWhen: "Configure field host/port, record CONTROL_BOARD_LIVE_APPROVED=true, and capture live TCP rehearsal evidence.",
    evidence: "artifacts/field-readiness/example/manifest.json",
  },
  {
    id: "final-manual-evidence",
    area: "Manual Evidence",
    gate: "Manual Evidence: INVALID",
    actionType: "MANUAL_EVIDENCE_REQUIRED",
    category: "Manual Evidence",
    status: "INVALID",
    message: "Operator UI Walkthrough evidence is INVALID.",
    closeWhen: "Operator UI walkthrough evidence is attached.",
    evidence: "artifacts/manual/operator-ui-walkthrough.md",
  },
  {
    id: "final-field-readiness",
    area: "Field Readiness",
    gate: "Field Readiness: REVIEW",
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Field Readiness",
    status: "REVIEW",
    message: "CORS_ORIGINS is open-or-wildcard and Nginx content security policy needs review.",
    closeWhen: "Set CORS_ORIGINS to explicit operator UI origins and refresh field preflight.",
    evidence: "artifacts/field-readiness/example/manifest.json",
  },
  {
    id: "final-field-env-closeout",
    area: "Field Env Closeout",
    gate: "Field Env Closeout: OPEN",
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Field Env Closeout",
    status: "OPEN",
    message: "Field environment closeout has 18 open .env item(s): blocking=16, review=2.",
    closeWhen: "Close the owner/key items in field:env-closeout, rerun strict field preflight, field readiness, field env closeout, and final:status.",
    evidence: "artifacts/field-env-closeout/example/manifest.json",
  },
];

assert(ownerForGate(gates[0]) === "Auth/Security", "security gate should map to Auth/Security");
assert(ownerForGate(gates[1]) === "Auth/Security", "scanner closeout gate should map to Auth/Security");
assert(ownerForGate(gates[2]) === "Control-board TCP", "control-board gate should map to Control-board TCP");
assert(ownerForGate(gates[3]) === "PM/QA", "manual operator gate should map to PM/QA");
assert(ownerForGate(gates[4]) === "Auth/Security", "CORS gate should map to Auth/Security");
assert(ownerForGate(gates[5]) === "Field Operations", "field env closeout gate should map to Field Operations");
assert(priorityForGate(gates[0]) === "P0", "blocked security gate should be P0");
assert(priorityForGate(gates[5]) === "P1", "open field env closeout gate should be P1");
assert(phaseForGate(gates[0]) === "Security Evidence", "security gate should map to Security Evidence phase");
assert(phaseForGate(gates[1]) === "Security Evidence", "scanner closeout gate should map to Security Evidence phase");
assert(commandForGate(gates[1], "http://field.local:8080").includes("--use-docker-scanners"), "scanner closeout gate should prefer specific Docker fallback command");
assert(phaseForGate(gates[2]) === "Field Rehearsal", "control-board gate should map to Field Rehearsal phase");
assert(commandForGate(gates[2], "http://field.local:8080").includes("FIELD_REVIEWER"), "field command should use reviewer environment variable");
assert(commandForGate(gates[2], "http://field.local:8080").includes("FIELD_SITE_NAME"), "field command should use site environment variable");
assert(!commandForGate(gates[2], "http://field.local:8080").includes("field-reviewer-name"), "field command should not emit reviewer placeholder");
assert(commandForGate(gates[2], "http://field.local:8080").includes("-AllowLiveTcp"), "live TCP closeout command should include explicit -AllowLiveTcp approval switch");
assert(phaseForGate(gates[3]) === "Manual Evidence", "manual gate should map to Manual Evidence phase");
assert(phaseForGate(gates[4]) === "Field Preflight", "CORS/CSP gate should map to Field Preflight phase");
assert(phaseForGate(gates[5]) === "Field Env Closeout", "field env closeout gate should map to Field Env Closeout phase");
assert(commandForGate(gates[2], "http://field.local:8080").includes("control-board-field-rehearsal.ps1"), "control-board gate should map to control-board rehearsal command");
assert(commandForGate(gates[0], "http://field.local:8080").includes("security:evidence"), "delivery-fix security gate should map to security evidence command");
assert(commandForGate(gates[4], "http://field.local:8080").includes("field:preflight"), "CORS/CSP gate should map to field preflight command");
assert(commandForGate(gates[5], "http://field.local:8080").includes("field:env-closeout"), "field env closeout gate should map to env closeout command");
assert(commandForGate(gates[4], "http://field.local:8080").includes("-Strict"), "field preflight command should use the field-preflight.ps1 -Strict flag");
assert(!commandForGate(gates[4], "http://field.local:8080").includes("-StrictPreflight"), "field preflight command must not use the field-acceptance.ps1 -StrictPreflight flag");
assert(
  prerequisiteHintsForGate(gates[1]).runtime.some((item) => item.includes("gitleaks")),
  "scanner gate should expose scanner runtime prerequisite",
);
assert(
  prerequisiteHintsForGate(gates[1]).evidence.includes("artifacts/manual/field-risk-acceptance.md"),
  "scanner gate should expose risk acceptance evidence prerequisite",
);
assert(
  prerequisiteHintsForGate(gates[2]).env.includes("CONTROL_BOARD_HOST") &&
    prerequisiteHintsForGate(gates[2]).env.includes("CONTROL_BOARD_LIVE_APPROVED"),
  "control-board gate should expose live TCP env prerequisites",
);
assert(
  prerequisiteHintsForGate(gates[4]).env.includes("CORS_ORIGINS"),
  "CORS gate should expose CORS env prerequisite",
);
assert(
  prerequisiteHintsForGate(gates[5]).env.includes("JWT_SECRET") &&
    prerequisiteHintsForGate(gates[5]).env.includes("NGINX_CONTENT_SECURITY_POLICY"),
  "field env closeout gate should expose env closeout prerequisites",
);
const cookieGate = { category: "Field Evidence", message: "Field Preflight: auth cookie delivery settings", closeWhen: "Set HTTPS cookie posture." };
assert(prerequisiteHintsForGate(cookieGate).env.includes("AUTH_COOKIE_SECURE"), "cookie gate should expose AUTH_COOKIE_SECURE env prerequisite");
assert(prerequisiteHintsForGate(cookieGate).env.includes("AUTH_COOKIE_SAMESITE"), "cookie gate should expose AUTH_COOKIE_SAMESITE env prerequisite");
assert(!prerequisiteHintsForGate(cookieGate).env.includes("COOKIE_SECURE"), "cookie gate should not expose non-existent COOKIE_SECURE env name");
const swaggerGate = { category: "Field Evidence", message: "Field Preflight: Swagger allowlist", closeWhen: "Restrict Swagger exposure." };
assert(prerequisiteHintsForGate(swaggerGate).env.includes("NGINX_SWAGGER_ALLOW"), "Swagger gate should expose NGINX_SWAGGER_ALLOW env prerequisite");
assert(!prerequisiteHintsForGate(swaggerGate).env.includes("SWAGGER_ALLOWED_CIDRS"), "Swagger gate should not expose non-existent SWAGGER_ALLOWED_CIDRS env name");
const rateLimitGate = { category: "Field Evidence", message: "Field Preflight: Nginx wrong-way rate limit", closeWhen: "Set Nginx rate limit and burst." };
assert(ownerForGate(rateLimitGate) === "Nginx Delivery", "Nginx rate limit gate should map to Nginx Delivery");
assert(prerequisiteHintsForGate(rateLimitGate).env.includes("NGINX_WRONGWAY_RATE_LIMIT"), "rate limit gate should expose NGINX_WRONGWAY_RATE_LIMIT");
assert(prerequisiteHintsForGate(rateLimitGate).env.includes("NGINX_WRONGWAY_BURST"), "rate limit gate should expose NGINX_WRONGWAY_BURST");
const cspGate = { category: "Field Evidence", message: "Field Preflight: Nginx content security policy", closeWhen: "Set content security policy." };
assert(ownerForGate(cspGate) === "Nginx Delivery", "CSP gate should map to Nginx Delivery");
assert(prerequisiteHintsForGate(cspGate).env.includes("NGINX_CONTENT_SECURITY_POLICY"), "CSP gate should expose NGINX_CONTENT_SECURITY_POLICY");
assert(
  commandForGate(gates[3], "http://field.local:8080").includes("manual:evidence-readiness -- --generated-by="),
  "manual evidence gate should pass reviewer/site metadata args to readiness",
);
assert(
  commandForGate({ category: "Handover Package", message: "handover package needs refresh" }, "http://field.local:8080").includes("--generated-by="),
  "handover gate should pass reviewer/site metadata args to package refresh",
);
assert(
  commandForGate({ category: "Handover Package", message: "Field Preflight field evidence has 5 REVIEW item(s)." }, "http://field.local:8080").includes("handover:package"),
  "handover package gate should not be rerouted to preflight by embedded reason text",
);
assert(
  commandForGate(
    {
      category: "Evidence Source Revision",
      message: "fieldAcceptance evidence is not tied to the clean final source revision.",
      closeWhen: "Regenerate the referenced evidence after the final delivery commit and rerun final:status.",
    },
    "http://field.local:8080",
  ).includes("field:acceptance"),
  "stale fieldAcceptance source evidence should map to field acceptance rerun",
);
assert(
  commandForGate(
    {
      category: "Evidence Source Revision",
      message: "ciStatus evidence is not tied to the clean final source revision.",
      closeWhen: "Regenerate the referenced evidence after the final delivery commit and rerun final:status.",
    },
    "http://field.local:8080",
  ).includes("ci:status"),
  "stale ciStatus source evidence should map to read-only CI status rerun",
);

const actionItems = buildActionItems({ data: { remainingGates: gates } }, "http://field.local:8080");
assert(actionItems.length === 6, "action items should preserve gate count");
assert(actionItems.every((item) => item.id.startsWith("GATE-")), "action item ids should be stable gate ids");
assert(actionItems.every((item) => item.sourceGateId?.startsWith("final-")), "action items should preserve source final-status gate ids");
assert(actionItems.every((item) => item.sourceGate && item.area), "action items should preserve source final-status gate labels");
assert(actionItems.every((item) => item.phase), "action items should expose execution phase");
assert(actionItems.every((item) => item.prerequisites?.env?.includes("FIELD_REVIEWER")), "action items should expose common field metadata prerequisites");
assert(actionItems.some((item) => item.scanner === "gitleaks" && item.closeoutCommands?.riskAcceptanceEvidence), "action items should preserve scanner closeout details");
assert(actionItems.some((item) => item.scanner === "gitleaks" && item.runtimeNote.includes("Docker daemon")), "action items should preserve scanner runtime notes");
assert(groupByOwner(actionItems).some((group) => group.owner === "Auth/Security" && group.total === 3), "owner grouping should count security/CORS owner");
assert(groupByOwner(actionItems).some((group) => group.owner === "Field Operations" && group.total === 1), "owner grouping should count field env closeout owner");
assert(groupByOwner(actionItems).some((group) => group.byPhase["Security Evidence"] === 2), "owner grouping should count phases");
assert(groupByPhase(actionItems).some((group) => group.phase === "Security Evidence" && group.total === 2), "phase grouping should count security phase");
assert(groupByPhase(actionItems).some((group) => group.phase === "Field Preflight" && group.total === 1), "phase grouping should count CORS/CSP preflight phase");
const executionQueue = buildExecutionQueue(actionItems);
assert(executionQueue.length === 6, "execution queue should dedupe commands by phase");
assert(executionQueue[0].phase === "Manual Evidence", "execution queue should start with manual evidence phase");
assert(executionQueue.some((item) => item.phase === "Security Evidence" && item.command.includes("--use-docker-scanners")), "execution queue should expose scanner closeout command");
assert(executionQueue.some((item) => (item.runtimeNotes || []).some((note) => note.includes("Docker daemon"))), "execution queue should expose scanner runtime notes");
assert(executionQueue.some((item) => item.prerequisites?.runtime?.some((entry) => entry.includes("OWASP ZAP"))), "execution queue should aggregate runtime prerequisites");
assert(executionQueue.some((item) => item.prerequisites?.env?.includes("CONTROL_BOARD_PORT")), "execution queue should aggregate control-board env prerequisites");
assert(executionQueue.some((item) => (item.sourceGateIds || []).includes("final-control-board-tcp")), "execution queue should aggregate source gate ids");
assert(executionQueue.every((item, index) => item.order === index + 1), "execution queue order should be stable and one-based");

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "tester",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      baseUrl: "http://field.local:8080",
      siteName: "delivery-site-a",
      remainingGates: gates,
    },
  },
});

assert(manifest.status === "OPEN", "fixture with gates should produce OPEN board");
assert(manifest.openActionCount === 6, "manifest should preserve open action count");
assert(manifest.ownerGroups.length === 4, "manifest should group by owner");
assert(manifest.phaseGroups.length === 5, "manifest should group by phase");
assert(manifest.executionQueue.length === 6, "manifest should expose execution queue");
assert(manifest.sourceFinalStatus.includes("artifacts/final-status"), "manifest should reference final status");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Action Board"), "markdown should include title");
assert(markdown.includes("Owner Summary"), "markdown should include owner summary");
assert(markdown.includes("Owner Commands"), "markdown should include owner commands");
assert(markdown.includes("Execution Queue"), "markdown should include execution queue");
assert(markdown.includes("Source Gate ID"), "markdown should include source gate id column");
assert(markdown.includes("final-control-board-tcp"), "markdown should include source final-status gate id");
assert(markdown.includes("Phase Summary"), "markdown should include phase summary");
assert(markdown.includes("control-board-field-rehearsal.ps1"), "markdown should include mapped field command");
assert(markdown.includes("field:preflight"), "markdown should include mapped preflight command");
assert(markdown.includes("field:env-closeout"), "markdown should include mapped field env closeout command");
assert(markdown.includes("Risk Acceptance Evidence"), "markdown should include scanner risk acceptance column");
assert(markdown.includes("Runtime Note"), "markdown should include runtime note column");
assert(markdown.includes("Prerequisites"), "markdown should include prerequisites column");
assert(markdown.includes("CONTROL_BOARD_HOST"), "markdown should include control-board prerequisites");
assert(markdown.includes("field-risk-acceptance.md"), "markdown should include scanner risk acceptance evidence path");
assert(markdown.includes("Docker daemon is not reachable."), "markdown should include scanner runtime note");

const ready = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site-a",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: {
      remainingGates: [],
    },
  },
});
assert(ready.status === "READY_TO_CLOSE", "empty final gates should produce READY_TO_CLOSE board");
assert(ready.openActionCount === 0, "empty final gates should have zero actions");

const placeholderMetadata = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "field-reviewer",
  siteName: "field-site",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus: {
    path: "artifacts/final-status/20260101-000000/manifest.json",
    data: { remainingGates: [] },
  },
});
assert(placeholderMetadata.status === "OPEN", "placeholder metadata should keep action board open");
assert(placeholderMetadata.openActionCount === 2, "placeholder reviewer/site should create metadata action items");
assert(
  placeholderMetadata.actionItems.every((item) => item.category === "Field Metadata"),
  "placeholder metadata action items should be categorized",
);

console.log("field action board contracts ok");
