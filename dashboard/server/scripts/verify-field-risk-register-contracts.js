const fs = require("fs");
const path = require("path");

const {
  buildManifest,
  buildMarkdown,
  buildFieldValueRisks,
  buildSecurityRisks,
  buildFinalStatusRisks,
  groupRiskItems,
} = require("./generate-field-risk-register");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-risk-register.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const finalExecutionPlan = readProjectFile("dashboard/server/scripts/generate-final-execution-plan.js");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  "artifacts/field-risk-register",
  "This risk register is preparation evidence, not reviewer acceptance.",
  "Final completion still requires artifacts/manual/field-risk-acceptance.md",
  "Risk Acceptance Draft Rows",
  "copyToRiskAcceptance",
  "Security scanners",
  "DEVICE_INGEST_API_KEY trusted-LAN exception",
  "Swagger exposure",
  "HTTPS cookie posture",
  "Cookie SameSite posture",
  "Nginx wrong-way rate limit",
  "Nginx content security policy",
  "Control-board live TCP",
  "Control-board live approval",
  "Operator UI walkthrough",
  "sourceFinalStatus",
  "sourceFieldReadiness",
  "sourceSecurityEvidence",
  "sourceManualEvidenceReadiness",
  "DELIVERY_FIX",
].forEach((token) => assertIncludes(generator, token, "field risk register generator"));

[
  "field:risk-register",
  "verify:field-risk-register",
  "generate-field-risk-register.js",
  "verify-field-risk-register-contracts.js",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-field-risk-register-contracts.js", "server verify chain");
assertIncludes(finalExecutionPlan, "field-risk-register", "final execution plan generator");
assertIncludes(finalExecutionPlan, "npm.cmd run field:risk-register", "final execution plan generator");
assertIncludes(handoverPackage, "field:risk-register", "handover package generator");
assertIncludes(handoverPackage, "fieldRiskRegister", "handover package generator");
assertIncludes(handoverIndex, "Field Risk Register", "handover index generator");
assertIncludes(runbook, "npm.cmd run field:risk-register", "delivery runbook");
assertIncludes(runbook, "artifacts/field-risk-register/<timestamp>/manifest.json", "delivery runbook");
assertIncludes(checklist, "npm run field:risk-register", "acceptance checklist");
assertIncludes(checklist, "artifacts/field-risk-register/<timestamp>/manifest.json", "acceptance checklist");
assertIncludes(matrix, "field:risk-register", "delivery evidence matrix");
assertIncludes(matrix, "artifacts/field-risk-register/<timestamp>/manifest.json", "delivery evidence matrix");

const fieldReadiness = {
  path: "artifacts/field-readiness/20260101-000000/manifest.json",
  data: {
    env: {
      envActionGroups: [
        {
          owner: "Auth/Security",
          items: [
            {
              name: "AUTH_COOKIE_SECURE",
              state: "false",
              priority: "REVIEW",
              nextAction: "Set AUTH_COOKIE_SECURE=true.",
            },
          ],
        },
        {
          owner: "Auth/Security",
          items: [
            {
              name: "AUTH_COOKIE_SAMESITE",
              state: "missing",
              priority: "REVIEW",
              nextAction: "Set AUTH_COOKIE_SAMESITE.",
            },
          ],
        },
        {
          owner: "Control-board TCP",
          items: [
            {
              name: "CONTROL_BOARD_HOST",
              state: "missing",
              priority: "BLOCKING",
              nextAction: "Fill CONTROL_BOARD_HOST.",
            },
          ],
        },
        {
          owner: "Nginx Delivery",
          items: [
            {
              name: "NGINX_WRONGWAY_RATE_LIMIT",
              state: "missing",
              priority: "REVIEW",
              nextAction: "Set NGINX_WRONGWAY_RATE_LIMIT.",
            },
            {
              name: "NGINX_CONTENT_SECURITY_POLICY",
              state: "missing",
              priority: "REVIEW",
              nextAction: "Set NGINX_CONTENT_SECURITY_POLICY.",
            },
          ],
        },
      ],
    },
  },
};

const security = {
  path: "artifacts/security/20260101-000000/manifest.json",
  data: {
    checks: [
      {
        label: "gitleaks secret scan",
        status: "skipped",
        reason: "gitleaks command is not installed",
        disposition: { code: "BLOCKING" },
      },
      {
        label: "npm audit policy gate",
        status: "executed",
        reason: "moderate vulnerability requires package upgrade before delivery",
        disposition: { code: "DELIVERY_FIX" },
      },
    ],
  },
};

const finalStatus = {
  path: "artifacts/final-status/20260101-000000/manifest.json",
  data: {
    baseUrl: "http://field.local:8080",
    siteName: "field-site",
    remainingGates: [
      {
        actionType: "SECURITY_REVIEW_REQUIRED",
        category: "Security Evidence",
        status: "BLOCKED",
        message: "Required scanner security evidence is strictAcceptanceBlocked.",
        closeWhen: "Resolve scanner failures/skips or attach accepted field-risk evidence.",
      },
      {
        actionType: "MANUAL_EVIDENCE_REQUIRED",
        category: "Manual Evidence",
        status: "MISSING",
        message: "Operator walkthrough is missing.",
        closeWhen: "Attach evidence.",
      },
    ],
  },
};

assert(buildFieldValueRisks(fieldReadiness).length === 5, "field value risks should include open field values");
assert(
  buildFieldValueRisks(fieldReadiness).some((item) => item.area === "Cookie SameSite posture"),
  "field value risks should map AUTH_COOKIE_SAMESITE to Cookie SameSite posture",
);
assert(
  buildFieldValueRisks(fieldReadiness).some((item) => item.area === "Nginx wrong-way rate limit"),
  "field value risks should map Nginx rate limit to a reviewer-readable area",
);
assert(
  buildFieldValueRisks(fieldReadiness).some((item) => item.area === "Nginx content security policy"),
  "field value risks should map Nginx CSP to a reviewer-readable area",
);
assert(buildSecurityRisks(security).length === 2, "security risks should include blocking and delivery-fix scanner checks");
assert(
  buildSecurityRisks(security).some((item) => item.status === "DELIVERY_FIX"),
  "security risks should preserve DELIVERY_FIX disposition",
);
assert(buildFinalStatusRisks(finalStatus).length === 2, "final status risks should include actionable gates");
assert(groupRiskItems([{ area: "Security scanners", owner: "Auth/Security", requiresReviewerDecision: true, copyToRiskAcceptance: true }])[0].copyToRiskAcceptanceCount === 1, "risk grouping should count acceptance rows");

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "tester",
  git: { branch: "dev", commit: "fixture", clean: true },
  finalStatus,
  fieldReadiness,
  security,
  manualReadiness: { path: "artifacts/manual-evidence-readiness/20260101-000000/manifest.json", data: {} },
});

assert(manifest.status === "OPEN", "fixture should produce open risk register");
assert(manifest.openRiskCount >= 5, "manifest should collect field, security, final status, and manual risks");
assert(manifest.copyToRiskAcceptanceCount > 0, "manifest should expose acceptance-copy count");
assert(manifest.sourceFinalStatus === finalStatus.path, "manifest should reference final status");
assert(manifest.riskGroups.some((group) => group.area === "Security scanners"), "manifest should group security scanner risks");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Risk Register"), "markdown should include title");
assert(markdown.includes("Risk Acceptance Draft Rows"), "markdown should include risk acceptance draft rows");
assert(markdown.includes("This risk register is preparation evidence"), "markdown should include guardrail");
assert(markdown.includes("AUTH_COOKIE_SECURE"), "markdown should include field-value risk detail");

console.log("field risk register contracts ok");
