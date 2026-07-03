const {
  buildAutomatedEvidenceCoverage,
  buildHandoverSummary,
  parseEvidenceMatrix,
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
| Delivery Evidence | Manifest packaging remains reproducible. | \`npm run delivery:evidence\`, \`artifacts/delivery/<timestamp>/runtime/\` | none |
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

console.log("delivery evidence summary vectors ok");
