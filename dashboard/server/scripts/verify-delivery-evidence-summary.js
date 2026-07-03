const {
  buildAutomatedEvidenceCoverage,
  buildHandoverSummary,
  parseEvidenceMatrix,
  summarizeFieldAcceptance,
} = require("./generate-delivery-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(values, expected, message) {
  assert(values.includes(expected), message);
}

const matrix = `
| Requirement Area | Delivery Requirement | Automated Evidence | Field Evidence Still Required |
| --- | --- | --- | --- |
| Control Board TCP | Sends raw command frames. | \`npm run verify:control-board-protocol\`, \`GET /api/control-board/status\` | Live integrated control-board TCP test |
| Traffic Statistics | KPI vectors remain executable. | \`npm run verify:statistics-metrics\`, \`scripts/runtime-smoke.ps1\` | Field acceptance of period labels |
| Delivery Evidence | Manifest packaging remains reproducible. | \`npm run delivery:evidence\`, \`artifacts/delivery/<timestamp>/runtime/\`, \`artifacts/field-acceptance/<timestamp>/manifest.json\` | none |
`;

const commands = [
  {
    label: "control protocol",
    command: "npm.cmd run verify:control-board-protocol",
    exitCode: 0,
  },
  {
    label: "smoke",
    command: "npm.cmd run smoke",
    exitCode: 0,
  },
  {
    label: "delivery evidence",
    command: "npm.cmd run delivery:evidence",
    exitCode: 0,
  },
  {
    label: "docker compose config",
    command: "docker compose config --quiet",
    exitCode: 1,
  },
];

const rows = parseEvidenceMatrix(matrix);
const coverage = buildAutomatedEvidenceCoverage(rows, commands);
const summary = buildHandoverSummary(rows, commands, coverage);
const companionSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [
  {
    type: "Runtime",
    reviewItems: ["Runtime: docker compose daemon check"],
    skippedItems: ["Runtime: runtime smoke"],
  },
  {
    type: "Security",
    reviewItems: [],
    skippedItems: ["Security: gitleaks secret scan"],
  },
]);
const skippedOnlyCompanionSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [
  {
    type: "Security",
    reviewItems: [],
    skippedItems: ["Security: OWASP ZAP baseline"],
  },
]);
const fieldReviewSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [], [
  {
    type: "Lidar Ingest",
    reviewItems: ["Lidar Ingest: field rehearsal manifest not found"],
  },
]);
const fieldAcceptanceReviewSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [], [], [
  {
    type: "Field Acceptance",
    reviewItems: ["Field Acceptance: runtime smoke"],
    skippedItems: ["Field Acceptance: security evidence"],
  },
]);
const missingFieldAcceptance = summarizeFieldAcceptance("Field Acceptance", "artifacts/missing-field-acceptance-vector");

assert(rows.length === 3, "delivery evidence summary vector should parse three matrix rows");
assert(summary.status === "AUTOMATED_CHECKS_REVIEW", "failed commands should force review status");
assert(summary.failedCommandCount === 1, "summary should count one failed command");
assertIncludes(summary.failedCommands, "docker compose config", "summary should expose failed command label");
assert(summary.requirementAreaCount === 3, "summary should count requirement areas");
assert(
  summary.automatedEvidenceItemCount === coverage.length,
  "summary should mirror automated evidence coverage count",
);
assert(summary.fieldVerificationRequiredCount === 2, "summary should exclude none/n/a field evidence rows");
assertIncludes(
  summary.fieldVerificationRequiredAreas,
  "Control Board TCP",
  "summary should include control-board field verification",
);
assertIncludes(
  summary.fieldVerificationRequiredAreas,
  "Traffic Statistics",
  "summary should include traffic statistics field verification",
);
assert(
  !summary.fieldVerificationRequiredAreas.includes("Delivery Evidence"),
  "summary should omit rows that declare no field evidence",
);
assert((summary.coverageCounts.DIRECT || 0) >= 2, "coverage should include directly executed evidence");
assert((summary.coverageCounts.SMOKE || 0) >= 1, "coverage should include smoke-covered verifier evidence");
assert(
  coverage.some((item) => item.evidence === "GET /api/control-board/status" && item.coverage === "RUNTIME_OR_FIELD"),
  "coverage should classify runtime API evidence",
);
assert(
  coverage.some(
    (item) =>
      item.evidence === "artifacts/delivery/<timestamp>/runtime/" &&
      item.coverage === "COMPANION_EVIDENCE",
  ),
  "coverage should classify companion runtime evidence output",
);
assert(
  summary.notes.some((note) => note.includes("Field verification remains required")),
  "summary should preserve field verification warning",
);
assert(
  companionSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "companion REVIEW items should force handover summary review status",
);
assert(
  skippedOnlyCompanionSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "companion SKIPPED items should force handover summary review status",
);
assert(
  fieldReviewSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "field rehearsal review items should force handover summary review status",
);
assert(companionSummary.failedCommandCount === 0, "companion-only review should not create failed commands");
assert(companionSummary.companionReviewCount === 1, "summary should count companion REVIEW items");
assert(companionSummary.companionSkippedCount === 2, "summary should count companion SKIPPED items");
assertIncludes(
  companionSummary.companionReviewItems,
  "Runtime: docker compose daemon check",
  "summary should expose runtime companion review item",
);
assertIncludes(
  companionSummary.companionSkippedItems,
  "Security: gitleaks secret scan",
  "summary should expose security companion skipped item",
);
assert(
  companionSummary.notes.some((note) => note.includes("REVIEW/SKIPPED")),
  "summary should explain nested companion evidence visibility",
);
assert(fieldReviewSummary.fieldRehearsalReviewCount === 1, "summary should count field rehearsal review items");
assertIncludes(
  fieldReviewSummary.fieldRehearsalReviewItems,
  "Lidar Ingest: field rehearsal manifest not found",
  "summary should expose missing field rehearsal manifest",
);
assert(
  fieldReviewSummary.notes.some((note) => note.includes("Field rehearsal evidence")),
  "summary should explain field rehearsal visibility",
);
assert(
  coverage.some(
    (item) =>
      item.evidence === "artifacts/field-acceptance/<timestamp>/manifest.json" &&
      item.coverage === "FIELD_ACCEPTANCE_EVIDENCE",
  ),
  "coverage should classify field acceptance manifest output",
);
assert(
  fieldAcceptanceReviewSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "field acceptance REVIEW items should force handover summary review status",
);
assert(
  fieldAcceptanceReviewSummary.fieldAcceptanceReviewCount === 1,
  "summary should count field acceptance REVIEW items",
);
assert(
  fieldAcceptanceReviewSummary.fieldAcceptanceSkippedCount === 1,
  "summary should count field acceptance SKIPPED items",
);
assertIncludes(
  fieldAcceptanceReviewSummary.fieldAcceptanceReviewItems,
  "Field Acceptance: runtime smoke",
  "summary should expose field acceptance review item",
);
assertIncludes(
  fieldAcceptanceReviewSummary.fieldAcceptanceSkippedItems,
  "Field Acceptance: security evidence",
  "summary should expose field acceptance skipped item",
);
assert(
  fieldAcceptanceReviewSummary.notes.some((note) => note.includes("Field acceptance orchestrator evidence")),
  "summary should explain field acceptance evidence visibility",
);
assert(
  missingFieldAcceptance.reviewItems.includes("Field Acceptance: field acceptance manifest not found"),
  "missing field acceptance manifest should be review-visible",
);

console.log("delivery evidence summary vectors ok");
