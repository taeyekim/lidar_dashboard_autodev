const fs = require("fs");
const path = require("path");

const {
  buildBatchedQuestionPacket,
  buildFieldAnswerSheet,
  buildBacklogItems,
  buildManifest,
  buildMarkdown,
  questionForGate,
} = require("./generate-field-requirements-backlog");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-requirements-backlog.js");
const packageJson = readProjectFile("package.json");

[
  "artifacts/field-requirements-backlog",
  "Field Requirements Backlog",
  "Backlog Questions",
  "never paste real secret values",
  "questionForGate",
  "Confirm control-board host",
  "Confirm approved field .env values",
  "Confirm whether scanner evidence",
  "Confirm whether dev branch GitHub Actions",
  "FIELD_REVIEWER",
  "FIELD_SITE_NAME",
  "FIELD_BASE_URL",
  "buildBatchedQuestionPacket",
  "Batched Question Packet",
  "Questions By Owner",
  "Field Value Checklist",
  "Runtime Checklist",
  "Evidence Checklist",
  "Deferred Decisions",
  "Field Answer Sheet",
  "answerStatus",
  "riskAcceptanceNeeded",
  "YYYY-MM-DD recheck dates",
  "Collect every field-dependent answer",
].forEach((token) => assertIncludes(generator, token, "field requirements backlog generator"));

[
  "field:requirements-backlog",
  "verify:field-requirements-backlog",
  "generate-field-requirements-backlog.js",
  "verify-field-requirements-backlog-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

const gates = [
  {
    id: "gate-control-board",
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Control Board TCP",
    status: "DRY_RUN_SAFE",
    message: "Control-board safety is not LIVE_TCP_READY.",
    closeWhen: "Configure field host/port, record CONTROL_BOARD_LIVE_APPROVED=true, and capture live TCP rehearsal evidence.",
  },
  {
    id: "gate-env",
    actionType: "FIELD_ACTION_REQUIRED",
    category: "Field Evidence",
    status: "REVIEW",
    message: "Field Preflight: JWT secret placeholder",
    closeWhen: "Preflight manifest has no REVIEW or SKIPPED checks required by the field acceptance policy.",
  },
  {
    id: "gate-security",
    actionType: "SECURITY_REVIEW_REQUIRED",
    category: "Security Scanner Closeout",
    status: "BLOCKING",
    message: "Trivy images scanner closeout is BLOCKING.",
    closeWhen: "Build the delivery images and rerun image scans with native Trivy or --use-docker-scanners.",
  },
  {
    id: "gate-ci",
    actionType: "REVIEW_REQUIRED",
    category: "CI Status",
    status: "REVIEW",
    message: "CI status evidence is REVIEW: No CI workflow run was found for branch dev.",
    closeWhen: "Run ci:status or dispatch only during the approved external CI closeout window.",
  },
  {
    id: "gate-csp",
    actionType: "SECURITY_REVIEW_REQUIRED",
    category: "Field Evidence",
    status: "REVIEW",
    message: "Field Preflight: Nginx content security policy",
    closeWhen: "Preflight manifest has no REVIEW or SKIPPED checks required by the field acceptance policy.",
  },
  {
    id: "gate-handover-aggregate",
    actionType: "REVIEW_REQUIRED",
    category: "Handover Package",
    status: "REVIEW",
    message:
      "Site name metadata is missing or placeholder.; CI status evidence is REVIEW.; Field Preflight field evidence has 5 REVIEW and 3 SKIPPED item(s).; Control Board TCP field evidence has 1 REVIEW and 0 SKIPPED item(s).",
    closeWhen: "Resolve strictFailureReasons and rerun handover:package.",
    evidence: "artifacts/handover-package/fixture/manifest.json",
  },
];

assert(questionForGate(gates[0]).includes("control-board host"), "control-board question should ask for TCP field details");
assert(questionForGate(gates[1]).includes(".env values"), "env question should ask for field env values");
assert(questionForGate(gates[2]).includes("scanner evidence"), "security question should ask for scanner evidence route");
assert(questionForGate(gates[3]).includes("GitHub Actions"), "CI question should ask for GitHub Actions closeout");
assert(questionForGate(gates[4]).includes(".env values"), "CSP field gate should ask for approved env values, not scanner evidence");
assert(questionForGate(gates[5]).includes("aggregate closeout blockers"), "handover aggregate gate should stay an aggregate closeout question");

const finalStatus = {
  path: "artifacts/final-status/fixture/manifest.json",
  data: {
    baseUrl: "http://field.local:8080",
    siteName: "field-site",
    remainingGates: gates,
  },
};
const classification = {
  path: "artifacts/final-gate-classification/fixture/manifest.json",
  data: {
    summary: {
      remainingGateCount: 6,
      bucketGateCounts: { hardware_runtime: 1, field_configuration: 2, security_tooling: 1, external_ci: 1, package_refresh: 1 },
    },
  },
};

const items = buildBacklogItems(finalStatus, "http://field.local:8080");
assert(items.length === 6, "backlog should preserve distinct field questions");
assert(items.some((item) => item.owner === "Control-board TCP" && item.envKeys.includes("CONTROL_BOARD_HOST")), "control-board item should include host env key");
assert(items.some((item) => item.envKeys.includes("JWT_SECRET")), "env item should include JWT secret key without value");
assert(items.some((item) => item.runtime.some((entry) => entry.includes("gitleaks"))), "security item should include scanner runtime prerequisite");
assert(items.some((item) => item.command.includes("ci:status") || item.question.includes("GitHub Actions")), "CI item should include CI closeout path");
assert(
  items.some(
    (item) =>
      item.owner === "Field Operations" &&
      item.phase === "Final Status" &&
      item.question.includes("aggregate closeout blockers") &&
      item.envKeys.includes("FIELD_BASE_URL") &&
      !item.envKeys.includes("CONTROL_BOARD_HOST"),
  ),
  "aggregate handover gate should not inherit mixed control-board/nginx prerequisites",
);

const packet = buildBatchedQuestionPacket(items);
assert(packet.questionCount === 6, "batched packet should count all questions");
assert(packet.ownerCount >= 4, "batched packet should group questions by owner");
assert(packet.highPriorityQuestionCount >= 1, "batched packet should count high priority questions");
assert(packet.fieldValueChecklist.some((item) => item.key === "CONTROL_BOARD_HOST"), "batched packet should list control-board host field value");
assert(packet.fieldValueChecklist.some((item) => item.key === "JWT_SECRET"), "batched packet should list JWT secret key without values");
assert(packet.runtimeChecklist.some((item) => item.includes("gitleaks")), "batched packet should list scanner runtime prerequisites");
assert(
  packet.deferredDecisions.some((item) => item.decision.includes("control-board host")),
  "batched packet should surface live TCP as deferred field decision",
);
assert(packet.acceptanceRule.includes("zero remaining gates"), "batched packet should define closeout acceptance rule");

const answerSheet = buildFieldAnswerSheet(items);
assert(answerSheet.length === 6, "answer sheet should include every backlog item");
assert(answerSheet.every((item) => item.answerStatus === "TODO"), "answer sheet should start with TODO answer status");
assert(answerSheet.some((item) => item.envKeysToFill.includes("CONTROL_BOARD_HOST")), "answer sheet should expose env keys to fill");
assert(answerSheet.some((item) => item.commandToRerun.includes("ci:status") || item.question.includes("GitHub Actions")), "answer sheet should include rerun command guidance");
assert(answerSheet.some((item) => item.riskAcceptanceNeeded === true), "answer sheet should flag risk acceptance candidates");
assert(answerSheet.every((item) => item.targetRecheckDate === ""), "answer sheet should leave recheck date blank for field reviewer");

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer",
  siteName: "field-site",
  baseUrl: "http://field.local:8080",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus,
  classification,
});

assert(manifest.status === "OPEN", "manifest should be OPEN while questions remain");
assert(manifest.summary.itemCount === 6, "manifest should count backlog items");
assert(manifest.itemCount === 6, "manifest should expose top-level item count for automation");
assert(manifest.openItemCount === 6, "manifest should expose top-level open item count for automation");
assert(manifest.ownerCount >= 4, "manifest should expose top-level owner count for routing");
assert(manifest.priorityCounts.P0 >= 1, "manifest should expose top-level priority counts");
assert(manifest.actionTypeCounts.FIELD_ACTION_REQUIRED >= 1, "manifest should expose top-level action type counts");
assert(manifest.sourceFinalStatus.includes("final-status"), "manifest should link final status source");
assert(manifest.classificationSummary.bucketGateCounts.security_tooling === 1, "manifest should keep classification summary");
assert(manifest.metadataEnvKeys.includes("FIELD_BASE_URL"), "manifest should expose field base URL as metadata env key");
assert(manifest.batchedQuestionPacket.questionCount === 6, "manifest should include batched question packet");
assert(manifest.batchedQuestionPacket.fieldValueChecklist.some((item) => item.key === "FIELD_BASE_URL"), "manifest packet should include field base URL checklist");
assert(manifest.fieldAnswerSheet.length === 6, "manifest should include field answer sheet");
assert(manifest.guardrails.some((item) => item.includes("Field Answer Sheet")), "manifest guardrails should tell reviewers how to fill answer sheet");

const markdown = buildMarkdown(manifest);
[
  "Field Requirements Backlog",
  "Batched Question Packet",
  "Questions By Owner",
  "Field Value Checklist",
  "Runtime Checklist",
  "Evidence Checklist",
  "Deferred Decisions",
  "Field Answer Sheet",
  "Answer Status",
  "Risk Acceptance Needed",
  "Target Recheck Date",
  "zero remaining gates",
  "Backlog Questions",
  "Control-board TCP",
  "JWT_SECRET",
  "GitHub Actions",
  "FIELD_BASE_URL",
  "never paste real secret values",
].forEach((token) => assert(markdown.includes(token), `markdown should include ${token}`));

console.log("field requirements backlog contracts ok");
