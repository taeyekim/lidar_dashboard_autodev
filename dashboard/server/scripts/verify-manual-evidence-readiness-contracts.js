const fs = require("fs");
const path = require("path");
const { buildManualEvidenceReadiness, buildMarkdown } = require("./generate-manual-evidence-readiness");

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
const generator = readProjectFile("dashboard/server/scripts/generate-manual-evidence-readiness.js");
const finalStatusGenerator = readProjectFile("dashboard/server/scripts/generate-final-status-report.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "manual:evidence-readiness", "root package scripts"],
  [packageJson, "verify:manual-evidence-readiness", "root package scripts"],
  [packageJson, "verify-manual-evidence-readiness-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-manual-evidence-readiness-contracts.js", "server verify chain"],
  [generator, "artifacts/manual-evidence-readiness", "manual evidence readiness generator"],
  [generator, "readyForFinalClose", "manual evidence readiness generator"],
  [generator, "fieldChecklist", "manual evidence readiness generator"],
  [generator, "Field Checklist", "manual evidence readiness generator"],
  [generator, "PLACEHOLDER", "manual evidence readiness generator"],
  [generator, "This report never substitutes for reviewer evidence", "manual evidence readiness generator"],
  [finalStatusGenerator, "manualEvidenceReadiness", "final status generator"],
  [finalStatusGenerator, "artifacts/manual-evidence-readiness", "final status generator"],
  [runbook, "npm.cmd run manual:evidence-readiness", "delivery runbook"],
  [runbook, "artifacts/manual-evidence-readiness", "delivery runbook"],
  [checklist, "npm run manual:evidence-readiness", "acceptance checklist"],
  [checklist, "artifacts/manual-evidence-readiness", "acceptance checklist"],
  [matrix, "manual:evidence-readiness", "delivery evidence matrix"],
  [matrix, "artifacts/manual-evidence-readiness", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const missing = buildManualEvidenceReadiness({
  manualEvidence: [
    {
      type: "Operator UI Walkthrough",
      path: "artifacts/manual/nonexistent-operator-ui-walkthrough.md",
      template: "docs/ops/operator-ui-walkthrough-template.md",
      status: "MISSING",
      required: true,
      validationReason: "Evidence file does not exist.",
      nextAction: "Fill the walkthrough template.",
      doneWhen: "Walkthrough result is PASS.",
    },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true },
});

assert(missing.status === "MISSING", "missing manual evidence should produce MISSING readiness");
assert(missing.readyForFinalClose === false, "missing manual evidence must not be ready for close");
assert(missing.missingCount === 1, "missing readiness should count missing items");
assert(
  missing.items[0].fieldChecklist.some((item) => item.field === "Operator account" && item.status === "MISSING_FILE"),
  "missing readiness should expose missing-file checklist statuses",
);
const missingMarkdown = buildMarkdown(missing);
assert(missingMarkdown.includes("This report never substitutes for reviewer evidence"), "markdown should include reviewer guardrail");
assert(missingMarkdown.includes("nonexistent-operator-ui-walkthrough.md"), "markdown should include operator UI target path");
assert(missingMarkdown.includes("Field Checklist"), "markdown should include field checklist");

const invalid = buildManualEvidenceReadiness({
  manualEvidence: [
    {
      type: "Field Risk Acceptance",
      path: "artifacts/manual/field-risk-acceptance.md",
      template: "docs/ops/field-risk-acceptance-template.md",
      status: "INVALID",
      required: true,
      validationReason: "Evidence still contains TODO accepted-item rows.",
      nextAction: "Fill the risk template.",
      doneWhen: "Decision is ACCEPTED.",
    },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true },
});

assert(invalid.status === "REVIEW", "invalid manual evidence should produce REVIEW readiness");
assert(invalid.invalidCount === 1, "invalid readiness should count invalid items");
assert(buildMarkdown(invalid).includes("field-risk-acceptance.md"), "markdown should include field risk target path");

const ready = buildManualEvidenceReadiness({
  manualEvidence: [
    {
      type: "Operator UI Walkthrough",
      path: "artifacts/manual/operator-ui-walkthrough.md",
      template: "docs/ops/operator-ui-walkthrough-template.md",
      status: "PRESENT",
      required: true,
      nextAction: "none",
      doneWhen: "done",
    },
    {
      type: "Field Risk Acceptance",
      path: "artifacts/manual/field-risk-acceptance.md",
      template: "docs/ops/field-risk-acceptance-template.md",
      status: "PRESENT",
      required: true,
      nextAction: "none",
      doneWhen: "done",
    },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true },
});

assert(ready.status === "READY", "present manual evidence should produce READY readiness");
assert(ready.readyForFinalClose === true, "present manual evidence should be ready for final close");
assert(ready.presentCount === 2, "ready manual evidence should count present items");

const placeholderMetadata = buildManualEvidenceReadiness({
  manualEvidence: [
    {
      type: "Operator UI Walkthrough",
      path: "artifacts/manual/operator-ui-walkthrough.md",
      template: "docs/ops/operator-ui-walkthrough-template.md",
      status: "PRESENT",
      required: true,
      nextAction: "none",
      doneWhen: "done",
    },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "field-reviewer",
  siteName: "field-site",
  git: { branch: "dev", commit: "fixture", clean: true },
});

assert(placeholderMetadata.status === "REVIEW", "placeholder readiness metadata should force REVIEW");
assert(placeholderMetadata.readyForFinalClose === false, "placeholder readiness metadata must block final close");
assert(placeholderMetadata.metadataReview.length === 2, "placeholder readiness metadata should expose both metadata review items");
assert(buildMarkdown(placeholderMetadata).includes("Metadata Review"), "markdown should include metadata review section");

console.log("manual evidence readiness contracts ok");
