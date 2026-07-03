const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildDraftContent,
  buildManualEvidenceDraftPlan,
  buildMarkdown,
  writeManualEvidenceDrafts,
} = require("./generate-manual-evidence-drafts");
const { validateManualEvidence } = require("./manual-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const root = path.join(__dirname, "..", "..", "..");
const rootPackageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const generator = readProjectFile("dashboard/server/scripts/generate-manual-evidence-drafts.js");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const operatorTemplate = readProjectFile("docs/ops/operator-ui-walkthrough-template.md");

[
  [rootPackageJson, "manual:evidence-drafts", "root package scripts"],
  [rootPackageJson, "verify:manual-evidence-drafts", "root package scripts"],
  [rootPackageJson, "verify-manual-evidence-drafts-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-manual-evidence-drafts-contracts.js", "server verify chain"],
  [generator, "artifacts/manual-evidence-drafts", "manual evidence drafts generator"],
  [generator, "artifacts/manual/operator-ui-walkthrough.md", "manual evidence drafts generator"],
  [generator, "artifacts/manual/field-risk-acceptance.md", "manual evidence drafts generator"],
  [generator, "Draft files are not final evidence", "manual evidence drafts generator"],
  [generator, "SKIP_EXISTS", "manual evidence drafts generator"],
  [finalExecutionPlan, "manual:evidence-drafts", "final execution plan"],
  [runbook, "npm.cmd run manual:evidence-drafts", "delivery runbook"],
  [runbook, "artifacts/manual-evidence-drafts/<timestamp>/manifest.json", "delivery runbook"],
  [checklist, "npm run manual:evidence-drafts", "acceptance checklist"],
  [checklist, "artifacts/manual-evidence-drafts/<timestamp>/manifest.json", "acceptance checklist"],
  [matrix, "manual:evidence-drafts", "delivery evidence matrix"],
  [matrix, "artifacts/manual-evidence-drafts/<timestamp>/manifest.json", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const draftedOperator = buildDraftContent(operatorTemplate, { type: "Operator UI Walkthrough" }, {
  siteName: "field-site",
  reviewer: "reviewer-a",
  baseUrl: "http://field.local:8080",
  generatedAt: "2026-01-01T00:00:00.000Z",
});
assert(draftedOperator.includes("Generated manual evidence draft"), "draft should include guardrail comment");
assert(draftedOperator.includes("| Site name | field-site |"), "draft should fill site name");
assert(draftedOperator.includes("| Reviewer | reviewer-a |"), "draft should fill reviewer");
assert(draftedOperator.includes("| Entry URL | http://field.local:8080 |"), "draft should fill entry URL");
assert(
  validateManualEvidence("Operator UI Walkthrough", draftedOperator).includes("Operator account"),
  "drafted operator walkthrough must remain invalid until reviewer completes session values",
);

const plan = buildManualEvidenceDraftPlan({ force: false });
assert(plan.length === 2, "draft plan should include two manual evidence targets");
assert(plan.some((item) => item.targetPath === "artifacts/manual/operator-ui-walkthrough.md"), "draft plan should include operator target");
assert(plan.every((item) => ["READY_TO_WRITE", "SKIP_EXISTS", "TEMPLATE_MISSING"].includes(item.status)), "draft plan statuses should be bounded");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "manual-evidence-drafts-"));
const previousCwd = process.cwd();
try {
  process.chdir(root);
  const manifest = writeManualEvidenceDrafts({
    generatedAt: "2026-01-01T00:00:00.000Z",
    generatedBy: "contract-test",
    siteName: "contract-site",
    reviewer: "contract-reviewer",
    baseUrl: "http://contract.local:8080",
    git: { branch: "dev", commit: "fixture", clean: true },
    force: false,
  });
  assert(manifest.createdCount + manifest.skippedCount + manifest.missingTemplateCount === 2, "draft manifest should account for every item");
  assert(buildMarkdown(manifest).includes("Draft Targets"), "draft markdown should include target table");
} finally {
  process.chdir(previousCwd);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("manual evidence drafts contracts ok");
