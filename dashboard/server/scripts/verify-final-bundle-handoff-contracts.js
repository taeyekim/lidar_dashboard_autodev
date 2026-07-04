const fs = require("fs");
const path = require("path");

const {
  buildBundleHandoff,
  buildBundleMarkdown,
  buildIndexMarkdown,
  slug,
} = require("./generate-final-bundle-handoff");

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
const generator = readProjectFile("dashboard/server/scripts/generate-final-bundle-handoff.js");
const finalExecutionPlanGenerator = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");

[
  [packageJson, "final:bundle-handoff", "root package scripts"],
  [packageJson, "verify:final-bundle-handoff", "root package scripts"],
  [packageJson, "verify-final-bundle-handoff-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-bundle-handoff-contracts.js", "server verify chain"],
  [generator, "artifacts/final-bundle-handoff", "final bundle handoff generator"],
  [generator, "Final bundle handoff files are field execution aids", "final bundle handoff generator"],
  [generator, "Reviewer Checklist", "final bundle handoff generator"],
  [generator, "Evidence Targets", "final bundle handoff generator"],
  [generator, "canMarkGoalComplete=true", "final bundle handoff generator"],
  [generator, "buildBundleHandoff", "final bundle handoff generator"],
  [generator, "buildBundleMarkdown", "final bundle handoff generator"],
  [finalExecutionPlanGenerator, "closureBundles", "final execution plan generator"],
  [finalExecutionPlanGenerator, "reviewerChecklist", "final execution plan generator"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

assert(slug("Field Input And Risk Acceptance") === "field-input-and-risk-acceptance", "slug should normalize bundle names");

const fixture = buildBundleHandoff({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalExecutionPlan: {
    path: "artifacts/final-execution-plan/20260101-000000/manifest.json",
    data: {
      siteName: "delivery-site",
      remainingGateCount: 27,
      closureBundles: [
        {
          order: 1,
          id: "field-input-and-risk-acceptance",
          label: "Field Input And Risk Acceptance",
          status: "OPEN",
          gateCount: 17,
          owners: ["Field Operations"],
          evidenceTargets: ["artifacts/manual/operator-ui-walkthrough.md"],
          commandIds: ["manual-evidence-readiness"],
          reviewerChecklist: ["Operator UI walkthrough and field risk acceptance files are filled and attached."],
          commands: [
            {
              id: "manual-evidence-readiness",
              order: 3,
              phase: "Manual Evidence",
              command: "npm.cmd run manual:evidence-readiness -- --generated-by=\"$env:FIELD_REVIEWER\"",
              doneWhen: "Manual evidence readiness is READY.",
            },
          ],
          outcome: "Field reviewer fills required manual evidence.",
          closeWhen: "Manual evidence readiness is READY.",
        },
      ],
    },
  },
});

assert(fixture.status === "OPEN", "fixture bundle handoff should be OPEN");
assert(fixture.bundleCount === 1, "fixture should count bundles");
assert(fixture.totalBundleGateCount === 17, "fixture should sum bundle gates");
assert(fixture.bundles[0].fileName === "01-field-input-and-risk-acceptance.md", "bundle handoff should create stable file names");
assert(fixture.git.pushed === true, "bundle handoff should expose pushed git state");

const indexMarkdown = buildIndexMarkdown(fixture);
assert(indexMarkdown.includes("Final Bundle Handoff"), "index markdown should include title");
assert(indexMarkdown.includes("Reviewer Checklist"), "index markdown should include checklist column");
assert(indexMarkdown.includes("01-field-input-and-risk-acceptance.md"), "index markdown should link bundle file names");

const bundleMarkdown = buildBundleMarkdown(fixture.bundles[0], fixture);
assert(bundleMarkdown.includes("Bundle Handoff - Field Input And Risk Acceptance"), "bundle markdown should include title");
assert(bundleMarkdown.includes("- [ ] Operator UI walkthrough"), "bundle markdown should render reviewer checklist");
assert(bundleMarkdown.includes("manual:evidence-readiness"), "bundle markdown should include commands");
assert(bundleMarkdown.includes("artifacts/manual/operator-ui-walkthrough.md"), "bundle markdown should include evidence targets");

const ready = buildBundleHandoff({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalExecutionPlan: {
    path: "artifacts/final-execution-plan/20260101-000000/manifest.json",
    data: { remainingGateCount: 0, closureBundles: [] },
  },
});

assert(ready.status === "READY_TO_CLOSE", "empty closure bundles should produce READY_TO_CLOSE handoff");
assert(ready.bundleCount === 0, "ready handoff should have no bundles");

const missing = buildBundleHandoff({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalExecutionPlan: null,
});
assert(missing.status === "FINAL_EXECUTION_PLAN_MISSING", "missing final execution plan should be explicit");

console.log("final bundle handoff contracts ok");
