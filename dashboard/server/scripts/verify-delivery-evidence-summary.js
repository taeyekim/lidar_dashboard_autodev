const {
  buildAutomatedEvidenceCoverage,
  buildHandoverSummary,
  isPlaceholderEvidenceText,
  parseEvidenceMatrix,
  readLatestJsonManifest,
  summarizeCompanionEvidence,
  summarizeFieldRehearsal,
  summarizeFieldAcceptance,
  summarizeFieldPreflight,
  manualEvidenceRefs,
  validateManualEvidence,
} = require("./generate-delivery-evidence");
const fs = require("fs");
const path = require("path");

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
| Frontend Control UI | Browser walkthrough remains attached to acceptance. | \`scripts/field-acceptance.ps1 -OperatorUiWalkthroughEvidence <path>\` | Browser walkthrough on delivery display |
| Traffic Statistics | KPI vectors remain executable. | \`npm run verify:statistics-metrics\`, \`scripts/runtime-smoke.ps1\` | Field acceptance of period labels |
| Delivery Evidence | Manifest packaging remains reproducible. | \`npm run delivery:evidence\`, \`npm run field:preflight\`, \`npm run field:acceptance\`, \`npm run completion:audit\`, \`npm run handover:index\`, \`npm run field:closure-plan\`, \`npm run field:readiness\`, \`npm run handover:package\`, \`artifacts/delivery/<timestamp>/runtime/\`, \`artifacts/field-acceptance/<timestamp>/manifest.json\`, \`artifacts/field-preflight/<timestamp>/manifest.json\`, \`artifacts/completion-audit/<timestamp>/manifest.json\`, \`artifacts/handover-index/<timestamp>/manifest.json\`, \`artifacts/field-closure-plan/<timestamp>/manifest.json\`, \`artifacts/field-readiness/<timestamp>/manifest.json\`, \`artifacts/handover-package/<timestamp>/manifest.json\` | none |
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
const policyAcceptedCompanionSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [
  {
    type: "Security",
    reviewItems: [],
    skippedItems: [],
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
const fieldPreflightReviewSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [], [], [], [
  {
    type: "Field Preflight",
    reviewItems: ["Field Preflight: JWT secret placeholder"],
    skippedItems: ["Field Preflight: Swagger allowlist"],
  },
]);
const missingFieldAcceptance = summarizeFieldAcceptance("Field Acceptance", "artifacts/missing-field-acceptance-vector");
const missingFieldPreflight = summarizeFieldPreflight("Field Preflight", "artifacts/missing-field-preflight-vector");
const manualEvidence = manualEvidenceRefs();
const invalidRiskAcceptanceReason = validateManualEvidence(
  "Field Risk Acceptance",
  fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs/ops/field-risk-acceptance-template.md"), "utf8"),
);
const validRiskAcceptanceReason = validateManualEvidence(
  "Field Risk Acceptance",
  `
## Session
| Item | Value |
| --- | --- |
| Site name | delivery-site |
| Reviewer | reviewer |
| Operator | operator@example.local |
| Delivery host | delivery-host-01 |
| Base URL | https://dashboard.example.local |
| Acceptance date | 2026-08-01 |

## Accepted Items
| Status | Area | Risk Accepted | Compensating Control | Evidence Reference | Expiry Or Recheck |
| --- | --- | --- | --- | --- | --- |
| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |

## Reviewer Decision
| Item | Value |
| --- | --- |
| Decision | ACCEPTED |
| Required follow-up | Install approved scanner package. |
| Follow-up owner | field-owner |
| Target recheck date | 2026-08-01 |
| Reviewer signature/name | reviewer |
`,
);
const manualEvidenceMissingSummary = buildHandoverSummary(rows, commands.slice(0, 3), coverage, [], [], [], [], [
  {
    type: "Operator UI Walkthrough",
    path: "artifacts/manual/operator-ui-walkthrough.md",
    status: "MISSING",
  },
  {
    type: "Field Risk Acceptance",
    path: "artifacts/manual/field-risk-acceptance.md",
    status: "PRESENT",
  },
]);
const fieldRehearsalMetadataRoot = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "artifacts",
  "delivery-summary-field-rehearsal-metadata",
);
const fieldRehearsalMetadataDir = path.join(fieldRehearsalMetadataRoot, "20260703-000000");
fs.mkdirSync(fieldRehearsalMetadataDir, { recursive: true });
fs.writeFileSync(
  path.join(fieldRehearsalMetadataDir, "manifest.json"),
  JSON.stringify({
    evidenceType: "FIELD_REHEARSAL_PASS",
    baseUrl: "http://localhost:8080",
    reviewer: "reviewer-a",
    siteName: "delivery-site",
    hostName: "field-host",
    unavailableAcceptance: {
      reason: "CONTROL_BOARD_NOT_CONNECTED",
      replacementOwner: "ops-lead",
      targetRecheckDate: "2026-07-10",
      approvalNote: "Approved by project owner for dry-run delivery packaging.",
      ownerStatus: "ASSIGNED",
      recheckStatus: "SCHEDULED",
    },
    results: [
      {
        name: "field rehearsal pass vector",
        status: "PASS",
      },
    ],
  }),
);
const fieldRehearsalMetadataSummary = summarizeFieldRehearsal(
  "Lidar Ingest",
  "artifacts/delivery-summary-field-rehearsal-metadata",
);
const fieldRehearsalPlaceholderMetadataRoot = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "artifacts",
  "delivery-summary-field-rehearsal-placeholder-metadata",
);
const fieldRehearsalPlaceholderMetadataDir = path.join(fieldRehearsalPlaceholderMetadataRoot, "20260703-000000");
fs.mkdirSync(fieldRehearsalPlaceholderMetadataDir, { recursive: true });
fs.writeFileSync(
  path.join(fieldRehearsalPlaceholderMetadataDir, "manifest.json"),
  JSON.stringify({
    evidenceType: "FIELD_REHEARSAL_PASS",
    baseUrl: "http://localhost:8080",
    reviewer: "field-reviewer",
    siteName: "field-site",
    hostName: "unknown",
    unavailableAcceptance: {
      replacementOwner: "pending",
      targetRecheckDate: "TBD",
    },
    results: [
      {
        name: "field rehearsal pass vector with placeholder metadata",
        status: "PASS",
      },
    ],
  }),
);
const fieldRehearsalPlaceholderMetadataSummary = summarizeFieldRehearsal(
  "Control Board TCP",
  "artifacts/delivery-summary-field-rehearsal-placeholder-metadata",
);
const fieldRehearsalMissingMetadataRoot = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "artifacts",
  "delivery-summary-field-rehearsal-missing-metadata",
);
const fieldRehearsalMissingMetadataDir = path.join(fieldRehearsalMissingMetadataRoot, "20260703-000000");
fs.mkdirSync(fieldRehearsalMissingMetadataDir, { recursive: true });
fs.writeFileSync(
  path.join(fieldRehearsalMissingMetadataDir, "manifest.json"),
  JSON.stringify({
    results: [
      {
        name: "pass without required metadata",
        status: "PASS",
      },
    ],
  }),
);
const fieldRehearsalMissingMetadataSummary = summarizeFieldRehearsal(
  "DB And Prisma",
  "artifacts/delivery-summary-field-rehearsal-missing-metadata",
);
const bomVectorRoot = path.join(__dirname, "..", "..", "..", "artifacts", "delivery-summary-vector-bom");
const bomVectorDir = path.join(bomVectorRoot, "20260703-000000");
fs.mkdirSync(bomVectorDir, { recursive: true });
fs.writeFileSync(path.join(bomVectorDir, "manifest.json"), `\uFEFF${JSON.stringify({ checks: [] })}`);
const bomManifest = readLatestJsonManifest("artifacts/delivery-summary-vector-bom");
const fieldAcceptanceVectorRoot = path.join(__dirname, "..", "..", "..", "artifacts", "delivery-summary-vector-field-acceptance");
fs.rmSync(fieldAcceptanceVectorRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(fieldAcceptanceVectorRoot, "20260101-000001"), { recursive: true });
fs.writeFileSync(
  path.join(fieldAcceptanceVectorRoot, "20260101-000001", "manifest.json"),
  JSON.stringify({
    status: "REVIEW",
    handover: { readyForHandover: false, requiresFieldReview: true },
    steps: [{ name: "field preflight manifest gate", status: "REVIEW" }],
  }),
);
fs.mkdirSync(path.join(fieldAcceptanceVectorRoot, "20260101-000000"), { recursive: true });
fs.writeFileSync(
  path.join(fieldAcceptanceVectorRoot, "20260101-000000", "manifest.json"),
  JSON.stringify({
    status: "PASS",
    handover: { readyForHandover: true, requiresFieldReview: false },
    steps: [{ name: "operator UI browser walkthrough", status: "PASS" }],
  }),
);
const passFieldAcceptance = readLatestJsonManifest("artifacts/delivery-summary-vector-field-acceptance");
const latestFieldAcceptance = readLatestJsonManifest("artifacts/delivery-summary-vector-field-acceptance", {
  preferPassingFieldAcceptance: false,
});
const policyAcceptedRoot = path.join(__dirname, "..", "..", "..", "artifacts", "delivery-summary-policy-accepted");
const policyAcceptedDir = path.join(policyAcceptedRoot, "20260703-000000");
fs.mkdirSync(policyAcceptedDir, { recursive: true });
fs.writeFileSync(
  path.join(policyAcceptedDir, "manifest.json"),
  JSON.stringify({
    checks: [
      {
        label: "npm audit raw json",
        status: "policy_accepted",
        exitCode: 1,
      },
      {
        label: "npm audit policy gate",
        status: "executed",
        exitCode: 0,
      },
    ],
  }),
);
const policyAcceptedSummary = summarizeCompanionEvidence("Security", "artifacts/delivery-summary-policy-accepted");
const runtimeMetadataRoot = path.join(__dirname, "..", "..", "..", "artifacts", "delivery-summary-runtime-metadata");
const runtimeMetadataDir = path.join(runtimeMetadataRoot, "20260703-000000");
fs.mkdirSync(runtimeMetadataDir, { recursive: true });
fs.writeFileSync(
  path.join(runtimeMetadataDir, "manifest.json"),
  JSON.stringify({
    options: {
      runSmoke: true,
      baseUrl: "http://localhost:8080",
      useExistingStack: true,
    },
    env: {
      exists: true,
      missingKeys: ["CONTROL_BOARD_HOST"],
    },
    commands: [],
  }),
);
const runtimeMetadataSummary = summarizeCompanionEvidence(
  "Runtime",
  "artifacts/delivery-summary-runtime-metadata",
);
const securityMetadataRoot = path.join(__dirname, "..", "..", "..", "artifacts", "delivery-summary-security-metadata");
const securityMetadataDir = path.join(securityMetadataRoot, "20260703-000000");
fs.mkdirSync(securityMetadataDir, { recursive: true });
fs.writeFileSync(
  path.join(securityMetadataDir, "manifest.json"),
  JSON.stringify({
    targetUrl: "http://localhost:8080",
    options: {
      includeContainerImages: true,
      includeZap: true,
      requireScanners: true,
    },
    dispositionSummary: {
      pass: 4,
      skipped: 0,
    },
    strictAcceptanceBlocked: true,
    checks: [],
  }),
);
const securityMetadataSummary = summarizeCompanionEvidence(
  "Security",
  "artifacts/delivery-summary-security-metadata",
);

assert(rows.length === 4, "delivery evidence summary vector should parse four matrix rows");
assert(summary.status === "AUTOMATED_CHECKS_REVIEW", "failed commands should force review status");
assert(summary.failedCommandCount === 1, "summary should count one failed command");
assertIncludes(summary.failedCommands, "docker compose config", "summary should expose failed command label");
assert(summary.requirementAreaCount === 4, "summary should count requirement areas");
assert(
  summary.automatedEvidenceItemCount === coverage.length,
  "summary should mirror automated evidence coverage count",
);
assert(summary.fieldVerificationRequiredCount === 3, "summary should exclude none/n/a field evidence rows");
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
assertIncludes(
  summary.fieldVerificationRequiredAreas,
  "Frontend Control UI",
  "summary should include frontend UI field verification",
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
assert(
  policyAcceptedCompanionSummary.companionReviewCount === 0,
  "policy accepted audit evidence should not create companion review items",
);
assert(policyAcceptedSummary.reviewCount === 0, "policy_accepted manifest checks should not be review items");
assert(
  runtimeMetadataSummary.metadata.baseUrl === "http://localhost:8080",
  "runtime companion summary should expose smoke base URL",
);
assert(runtimeMetadataSummary.metadata.runSmoke === true, "runtime companion summary should expose runSmoke mode");
assert(
  runtimeMetadataSummary.metadata.useExistingStack === true,
  "runtime companion summary should expose existing-stack mode",
);
assert(
  runtimeMetadataSummary.metadata.envFilePresent === true,
  "runtime companion summary should expose .env presence",
);
assert(
  runtimeMetadataSummary.metadata.missingEnvKeyCount === 1,
  "runtime companion summary should expose missing env key count",
);
assert(
  securityMetadataSummary.metadata.targetUrl === "http://localhost:8080",
  "security companion summary should expose target URL",
);
assert(
  securityMetadataSummary.metadata.includeContainerImages === true,
  "security companion summary should expose container image scan mode",
);
assert(securityMetadataSummary.metadata.includeZap === true, "security companion summary should expose ZAP mode");
assert(
  securityMetadataSummary.metadata.requireScanners === true,
  "security companion summary should expose scanner requirement policy",
);
assert(
  securityMetadataSummary.metadata.strictAcceptanceBlocked === true,
  "security companion summary should expose strict acceptance block status",
);
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
  fieldRehearsalMetadataSummary.metadata.evidenceType === "FIELD_REHEARSAL_PASS",
  "field rehearsal summary should expose evidence type",
);
assert(
  fieldRehearsalMetadataSummary.metadata.baseUrl === "http://localhost:8080",
  "field rehearsal summary should expose base URL",
);
assert(
  fieldRehearsalMetadataSummary.metadata.reviewer === "reviewer-a",
  "field rehearsal summary should expose reviewer",
);
assert(
  fieldRehearsalMetadataSummary.metadata.siteName === "delivery-site",
  "field rehearsal summary should expose site name",
);
assert(
  fieldRehearsalMetadataSummary.metadata.hostName === "field-host",
  "field rehearsal summary should expose host name",
);
assert(
  fieldRehearsalMetadataSummary.metadata.unavailableAcceptance.replacementOwner === "ops-lead",
  "field rehearsal summary should expose unavailable replacement owner",
);
assert(
  fieldRehearsalMetadataSummary.metadata.unavailableAcceptance.targetRecheckDate === "2026-07-10",
  "field rehearsal summary should expose unavailable target recheck date",
);
assert(
  fieldRehearsalMetadataSummary.metadata.unavailableAcceptance.ownerStatus === "ASSIGNED",
  "field rehearsal summary should expose unavailable owner status",
);
assert(
  fieldRehearsalMetadataSummary.metadata.unavailableAcceptance.recheckStatus === "SCHEDULED",
  "field rehearsal summary should expose unavailable recheck status",
);
assert(isPlaceholderEvidenceText("field-reviewer") === true, "field-reviewer should be treated as placeholder evidence metadata");
assert(isPlaceholderEvidenceText("reviewer-a") === false, "concrete reviewer should not be treated as placeholder evidence metadata");
assert(
  fieldRehearsalPlaceholderMetadataSummary.reviewItems.some((item) => item.includes("placeholder reviewer")),
  "field rehearsal PASS summary should reject placeholder reviewer metadata",
);
assert(
  fieldRehearsalPlaceholderMetadataSummary.reviewItems.some((item) => item.includes("placeholder siteName")),
  "field rehearsal PASS summary should reject placeholder site metadata",
);
assert(
  fieldRehearsalPlaceholderMetadataSummary.reviewItems.some((item) => item.includes("placeholder hostName")),
  "field rehearsal PASS summary should reject placeholder host metadata",
);
assert(
  fieldRehearsalPlaceholderMetadataSummary.reviewItems.some((item) => item.includes("placeholder replacementOwner")),
  "field rehearsal PASS summary should reject placeholder unavailable owner",
);
assert(
  fieldRehearsalPlaceholderMetadataSummary.reviewItems.some((item) => item.includes("placeholder targetRecheckDate")),
  "field rehearsal PASS summary should reject placeholder unavailable recheck date",
);
assert(
  fieldRehearsalMissingMetadataSummary.reviewItems.some((item) => item.includes("FIELD_REHEARSAL_PASS")),
  "field rehearsal PASS summary should require FIELD_REHEARSAL_PASS evidence type metadata",
);
assert(
  fieldRehearsalMissingMetadataSummary.reviewItems.some((item) => item.includes("baseUrl")),
  "field rehearsal PASS summary should require base URL metadata",
);
assert(
  fieldRehearsalMissingMetadataSummary.reviewItems.some((item) => item.includes("reviewer")),
  "field rehearsal PASS summary should require reviewer metadata",
);
assert(
  fieldRehearsalMissingMetadataSummary.reviewCount >= 5,
  "field rehearsal PASS summary should count missing execution metadata as review items",
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
  coverage.some(
    (item) =>
      item.evidence === "artifacts/field-preflight/<timestamp>/manifest.json" &&
      item.coverage === "FIELD_PREFLIGHT_EVIDENCE",
  ),
  "coverage should classify field preflight manifest output",
);
assert(
  coverage.some((item) => item.evidence === "npm run field:preflight" && item.coverage === "FIELD_PREFLIGHT_EVIDENCE"),
  "coverage should classify field preflight command",
);
assert(
  coverage.some((item) => item.evidence === "npm run field:acceptance" && item.coverage === "FIELD_ACCEPTANCE_EVIDENCE"),
  "coverage should classify field acceptance command",
);
assert(
  coverage.some(
    (item) =>
      item.evidence === "scripts/field-acceptance.ps1 -OperatorUiWalkthroughEvidence <path>" &&
      item.coverage === "FIELD_ACCEPTANCE_EVIDENCE",
  ),
  "coverage should classify operator UI walkthrough as field acceptance evidence",
);
assert(
  coverage.some((item) => item.evidence === "npm run completion:audit" && item.coverage === "COMPLETION_AUDIT_EVIDENCE"),
  "coverage should classify completion audit command",
);
assert(
  coverage.some((item) => item.evidence === "npm run handover:index" && item.coverage === "HANDOVER_INDEX_EVIDENCE"),
  "coverage should classify handover index command",
);
assert(
  coverage.some((item) => item.evidence === "npm run field:closure-plan" && item.coverage === "FIELD_CLOSURE_EVIDENCE"),
  "coverage should classify field closure command",
);
assert(
  coverage.some((item) => item.evidence === "npm run field:readiness" && item.coverage === "FIELD_READINESS_EVIDENCE"),
  "coverage should classify field readiness command",
);
assert(
  coverage.some((item) => item.evidence === "npm run handover:package" && item.coverage === "HANDOVER_PACKAGE_EVIDENCE"),
  "coverage should classify handover package command",
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
assert(
  fieldPreflightReviewSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "field preflight REVIEW items should force handover summary review status",
);
assert(fieldPreflightReviewSummary.fieldPreflightReviewCount === 1, "summary should count field preflight REVIEW items");
assert(fieldPreflightReviewSummary.fieldPreflightSkippedCount === 1, "summary should count field preflight SKIPPED items");
assert(
  fieldPreflightReviewSummary.notes.some((note) => note.includes("Field preflight evidence")),
  "summary should explain field preflight evidence visibility",
);
assert(
  missingFieldPreflight.reviewItems.includes("Field Preflight: field preflight manifest not found"),
  "missing field preflight manifest should be review-visible",
);
assert(
  manualEvidence.some(
    (item) =>
      item.type === "Operator UI Walkthrough" &&
      item.path === "artifacts/manual/operator-ui-walkthrough.md" &&
      item.template === "docs/ops/operator-ui-walkthrough-template.md",
  ),
  "manual evidence refs should expose operator UI walkthrough evidence",
);
assert(
  manualEvidence.some(
    (item) =>
      item.type === "Field Risk Acceptance" &&
      item.path === "artifacts/manual/field-risk-acceptance.md" &&
      item.template === "docs/ops/field-risk-acceptance-template.md",
  ),
  "manual evidence refs should expose field risk acceptance evidence",
);
assert(
  manualEvidenceMissingSummary.status === "AUTOMATED_CHECKS_REVIEW",
  "missing manual evidence should force handover summary review status",
);
assert(
  manualEvidenceMissingSummary.manualEvidenceMissingCount === 1,
  "summary should count missing manual evidence",
);
assertIncludes(
  manualEvidenceMissingSummary.manualEvidenceMissingItems,
  "Operator UI Walkthrough: artifacts/manual/operator-ui-walkthrough.md",
  "summary should expose missing manual evidence item",
);
assert(
  manualEvidenceMissingSummary.notes.some((note) => note.includes("Manual evidence references")),
  "summary should explain manual evidence visibility",
);
assert(
  invalidRiskAcceptanceReason.includes("Site name"),
  "risk acceptance template should be invalid until session values are completed",
);
assert(validRiskAcceptanceReason === "", "completed risk acceptance evidence should validate");
assert(bomManifest.data.checks.length === 0, "latest manifest reader should tolerate UTF-8 BOM");
assert(
  passFieldAcceptance.path.endsWith("20260101-000000/manifest.json"),
  "field acceptance manifest selection should prefer PASS handover evidence over newer REVIEW refresh evidence",
);
assert(
  latestFieldAcceptance.path.endsWith("20260101-000001/manifest.json"),
  "field acceptance manifest selection should allow final closeout callers to prefer the latest source-revision evidence",
);

console.log("delivery evidence summary vectors ok");
