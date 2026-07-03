const fs = require("fs");
const path = require("path");
const { buildIndexManifest } = require("./generate-handover-index");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const manualEvidence = readProjectFile("dashboard/server/scripts/manual-evidence.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/handover-index",
  "Delivery Evidence",
  "Completion Audit",
  "Field Preflight",
  "Field Acceptance",
  "Field Readiness",
  "Manual Evidence Readiness",
  "Manual Evidence Drafts",
  "Field Closure Plan",
  "Field Gate Closure Map",
  "DB And Prisma Field Rehearsal",
  "Lidar Ingest Field Rehearsal",
  "Control Board Field Rehearsal",
  "Runtime Evidence",
  "Security Evidence",
  "requireScanners",
  "strictAcceptanceBlocked",
  "manualEvidenceEntries",
  "manualEvidenceRefs",
  "isPlaceholderFieldText",
  "metadataReviewItems",
  "metadataReviewCount",
  "Metadata Review",
  "manualEvidence",
  "manualEvidenceCount",
  "missingManualEvidenceCount",
  "missingManualEvidenceAreas",
  "Manual Evidence Entries",
  "Missing Manual Evidence",
  "fieldRehearsalFollowUpEntries",
  "fieldRehearsalFollowUps",
  "fieldRehearsalFollowUpCount",
  "Field Rehearsal Follow-ups",
  "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Source Manifest | Closure Plan |",
  "fieldActionArtifactEntries",
  "fieldActionArtifacts",
  "fieldActionArtifactOpenCount",
  "openFieldActionArtifactAreas",
  "Field Action Artifacts",
  "Open Field Action Artifacts",
  "| Artifact | Status | Open Count | Ready | Source Manifest | Closure Plan |",
  "openCount",
  "replacementOwner",
  "targetRecheckDate",
  "ownerStatus",
  "recheckStatus",
  "validationReason",
  "Validation",
  "status !== \"PRESENT\"",
  "missingManualEvidence.length > 0",
  "missingRequiredAreas",
  "staleAreas",
  "reviewAreas",
  "consistencyIssues",
  "sourceDeliveryManifest",
  "sourceCompletionAudit",
  "sourceFieldReadinessManifest",
  "sourceManualEvidenceReadinessManifest",
  "Run npm run completion:audit again",
  "Run npm run field:closure-plan again",
  "staleEntryCount",
  "STALE",
  "OPEN",
  "canMarkGoalComplete",
  "controlBoardSafetyStatus",
  "Control-board safety status",
  "artifacts/field-gate-closure-map",
].forEach((token) => assertIncludes(generator, token, "handover index generator"));

[
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
  "INVALID",
].forEach((token) => assertIncludes(manualEvidence, token, "manual evidence helper"));

[
  "handover:index",
  "verify:handover-index",
  "generate-handover-index.js",
  "verify-handover-index-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-handover-index-contracts.js", "server verify chain");
assertIncludes(runbook, "npm.cmd run handover:index", "delivery runbook");
assertIncludes(runbook, "artifacts/handover-index/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run handover:index", "acceptance checklist");
assertIncludes(matrix, "npm run handover:index", "delivery evidence matrix");
assertIncludes(matrix, "manual evidence readiness", "delivery evidence matrix");
assertIncludes(matrix, "manual evidence drafts", "delivery evidence matrix");

const vectorManifest = buildIndexManifest({ generatedBy: "contract-vector", siteName: "contract-vector" });
if (vectorManifest.counts.missingManualEvidenceCount > 0) {
  assert(
    vectorManifest.status !== "READY",
    "handover index must not be READY while manual evidence is MISSING or INVALID",
  );
}

const securityEntry = vectorManifest.entries.find((entry) => entry.area === "Security Evidence");
if (securityEntry?.manifestPath) {
  assert(
    securityEntry.status !== "READY",
    "handover index must not mark non-strict security evidence as READY",
  );
}

const placeholderMetadataManifest = buildIndexManifest({ generatedBy: "field-reviewer", siteName: "field-site" });
assert(placeholderMetadataManifest.status !== "READY", "handover index must not be READY with placeholder metadata");
assert(placeholderMetadataManifest.counts.metadataReviewCount === 2, "handover index should count placeholder reviewer and site metadata");
assert(
  placeholderMetadataManifest.metadataReview.some((item) => item.includes("Generated-by reviewer")),
  "handover index should expose placeholder reviewer metadata review item",
);
assert(
  placeholderMetadataManifest.metadataReview.some((item) => item.includes("Site name")),
  "handover index should expose placeholder site metadata review item",
);

console.log("handover index contracts ok");
