const fs = require("fs");
const path = require("path");
const { buildFinalStatusReport, buildMarkdown } = require("./generate-final-status-report");

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
const generator = readProjectFile("dashboard/server/scripts/generate-final-status-report.js");
const finalStatusContracts = readProjectFile("dashboard/server/scripts/verify-final-status-contracts.js");
const deliveryRunbook = readProjectFile("docs/ops/delivery-runbook.md");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

[
  [packageJson, "final:status", "root package scripts"],
  [packageJson, "verify:final-status-report", "root package scripts"],
  [packageJson, "verify-final-status-report-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-final-status-report-contracts.js", "server verify chain"],
  [generator, "READY_TO_CLOSE", "final status report generator"],
  [generator, "FIELD_OR_SECURITY_REVIEW_REQUIRED", "final status report generator"],
  [generator, "remainingGates", "final status report generator"],
  [generator, "gateSummary", "final status report generator"],
  [generator, "gateActionRunbook", "final status report generator"],
  [generator, "formatCompletionBlocker", "final status report generator"],
  [generator, "MANUAL_EVIDENCE_REQUIRED", "final status report generator"],
  [generator, "SECURITY_REVIEW_REQUIRED", "final status report generator"],
  [generator, "FIELD_ACTION_REQUIRED", "final status report generator"],
  [generator, "AUTOMATED_REFRESH_AVAILABLE", "final status report generator"],
  [generator, "Control Board TCP", "final status report generator"],
  [generator, "Field Acceptance", "final status report generator"],
  [generator, "buildFieldAcceptanceSummary", "final status report generator"],
  [generator, "readyForHandover", "final status report generator"],
  [generator, "requiresFieldReview", "final status report generator"],
  [generator, "operatorUiWalkthroughStatus", "final status report generator"],
  [generator, "LIVE_TCP_READY", "final status report generator"],
  [generator, "requireScanners", "final status report generator"],
  [generator, "strictAcceptanceBlocked", "final status report generator"],
  [generator, "scannerCloseout", "final status report generator"],
  [generator, "scannerCloseoutSummary", "final status report generator"],
  [generator, "Security Scanner Closeout", "final status report generator"],
  [generator, "EVIDENCE_READY", "final status report generator"],
  [generator, "RISK_ACCEPTED", "final status report generator"],
  [generator, "closeoutWhenSkipped", "final status report generator"],
  [generator, "DELIVERY_FIX_REQUIRED", "final status report generator"],
  [generator, "BLOCKING_FINDINGS", "final status report generator"],
  [generator, "dispositionSummary", "final status report generator"],
  [generator, "referenceFreshness", "final status report generator"],
  [generator, "sourceRevisionFreshness", "final status report generator"],
  [generator, "Source Code State", "final status report generator"],
  [generator, "Evidence Source Revision", "final status report generator"],
  [generator, "Delivery Entrypoint", "final status report generator"],
  [generator, "deliveryEntrypointConsistency", "final status report generator"],
  [generator, "endpointConsistency", "final status report generator"],
  [generator, "targetUrl", "final status report generator"],
  [generator, "Delivery Entrypoint Consistency", "final status report generator"],
  [generator, "Git Delivery State", "final status report generator"],
  [generator, "origin/dev", "final status report generator"],
  [generator, "WRONG_BRANCH", "final status report generator"],
  [generator, "WRONG_UPSTREAM", "final status report generator"],
  [generator, "UNPUSHED", "final status report generator"],
  [generator, "final source revision", "final status report generator"],
  [generator, "fieldRiskRegister", "final status report generator"],
  [generator, "fieldActionBoard", "final status report generator"],
  [generator, "fieldGateClosureMap", "final status report generator"],
  [generator, "fieldOwnerBriefs", "final status report generator"],
  [generator, "Field Risk Register", "final status report generator"],
  [generator, "Field Action Board", "final status report generator"],
  [generator, "Field Gate Closure Map", "final status report generator"],
  [generator, "Field Owner Briefs", "final status report generator"],
  [generator, "openRiskCount", "final status report generator"],
  [generator, "openActionCount", "final status report generator"],
  [generator, "openGateCount", "final status report generator"],
  [generator, "openItemCount", "final status report generator"],
  [generator, "artifacts/field-risk-register", "final status report generator"],
  [generator, "artifacts/field-action-board", "final status report generator"],
  [generator, "artifacts/field-gate-closure-map", "final status report generator"],
  [generator, "artifacts/field-owner-briefs", "final status report generator"],
  [generator, "manualEvidence", "final status report generator"],
  [generator, "Do not mark the Codex goal complete", "final status report generator"],
  [finalStatusContracts, "final:status", "final status verifier"],
  [finalStatusContracts, "artifacts/final-status", "final status verifier"],
  [deliveryRunbook, "npm.cmd run final:status", "delivery runbook"],
  [deliveryRunbook, "artifacts/final-status", "delivery runbook"],
  [deliveryRunbook, "Git Delivery State", "delivery runbook"],
  [deliveryRunbook, "origin/dev", "delivery runbook"],
  [acceptanceChecklist, "npm run final:status", "acceptance checklist"],
  [acceptanceChecklist, "artifacts/final-status", "acceptance checklist"],
  [acceptanceChecklist, "Git Delivery State", "acceptance checklist"],
  [acceptanceChecklist, "Field Acceptance", "acceptance checklist"],
  [acceptanceChecklist, "readyForHandover=true", "acceptance checklist"],
  [acceptanceChecklist, "Delivery Entrypoint Consistency", "acceptance checklist"],
  [acceptanceChecklist, "WRONG_BRANCH", "acceptance checklist"],
  [acceptanceChecklist, "WRONG_UPSTREAM", "acceptance checklist"],
  [acceptanceChecklist, "UNPUSHED", "acceptance checklist"],
  [matrix, "artifacts/final-status", "delivery evidence matrix"],
  [matrix, "Git Delivery State", "delivery evidence matrix"],
  [matrix, "Field Acceptance", "delivery evidence matrix"],
  [matrix, "OPERATOR_UI_REVIEW", "delivery evidence matrix"],
  [matrix, "DELIVERY_FIX_REQUIRED", "delivery evidence matrix"],
  [matrix, "BLOCKING_FINDINGS", "delivery evidence matrix"],
  [matrix, "zero blocking or delivery-fix security findings", "delivery evidence matrix"],
  [matrix, "Scanner Closeout Matrix", "delivery evidence matrix"],
  [matrix, "Security Scanner Closeout", "delivery evidence matrix"],
  [matrix, "Delivery Entrypoint Consistency", "delivery evidence matrix"],
  [matrix, "MISMATCH", "delivery evidence matrix"],
  [matrix, "pushed to `origin/dev`", "delivery evidence matrix"],
  [matrix, "artifacts/field-risk-register", "delivery evidence matrix"],
  [matrix, "artifacts/field-action-board", "delivery evidence matrix"],
  [matrix, "artifacts/field-gate-closure-map", "delivery evidence matrix"],
  [matrix, "artifacts/field-owner-briefs", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const manualPresent = [
  { type: "Operator UI Walkthrough", path: "artifacts/manual/operator-ui-walkthrough.md", status: "PRESENT", required: true },
  { type: "Field Risk Acceptance", path: "artifacts/manual/field-risk-acceptance.md", status: "PRESENT", required: true },
];

const readyGit = {
  branch: "dev",
  commit: "fixture",
  clean: true,
  upstream: "origin/dev",
  upstreamCommit: "fixture",
  pushed: true,
};

const readyEvidence = {
  delivery: {
    path: "artifacts/delivery/20260101-000000/manifest.json",
    data: { git: { branch: "dev", commit: "fixture", clean: true } },
  },
  completionAudit: {
    path: "artifacts/completion-audit/20260101-000000/manifest.json",
    data: { status: "COMPLETE", canMarkGoalComplete: true, completionBlockers: [] },
  },
  fieldReadiness: {
    path: "artifacts/field-readiness/20260101-000000/manifest.json",
    data: { status: "PASS", baseUrl: "http://field.local:8080", env: { controlBoardSafetyStatus: "LIVE_TCP_READY" } },
  },
  fieldAcceptance: {
    path: "artifacts/field-acceptance/20260101-000000/manifest.json",
    data: {
      status: "PASS",
      baseUrl: "http://field.local:8080",
      handover: {
        readyForHandover: true,
        requiresFieldReview: false,
        reviewer: "field-reviewer",
        siteName: "delivery-site",
        latestPreflightStatus: "PASS",
        latestPreflightPassed: true,
        reviewStepCount: 0,
        skippedStepCount: 0,
      },
      safety: { operatorUiWalkthroughEvidence: "artifacts/manual/operator-ui-walkthrough.md" },
      steps: [{ name: "operator UI browser walkthrough", status: "PASS" }],
    },
  },
  securityEvidence: {
    path: "artifacts/security/20260101-000000/manifest.json",
    data: {
      targetUrl: "http://field.local:8080",
      options: { requireScanners: true },
      strictAcceptanceBlocked: false,
      dispositionSummary: { pass: 6, blocking: 0, deliveryFix: 0, riskAccepted: 0, unverified: 0 },
      scannerCloseout: [
        {
          scanner: "gitleaks",
          closeoutStatus: "EVIDENCE_READY",
          requiredSwitch: "--require-scanners",
          relatedChecks: ["gitleaks secret scan"],
          evidenceFiles: ["gitleaks.json"],
          closeoutWhenSkipped: "Install gitleaks or document reviewer risk acceptance.",
        },
        {
          scanner: "Trivy filesystem",
          closeoutStatus: "EVIDENCE_READY",
          requiredSwitch: "--require-scanners",
          relatedChecks: ["trivy filesystem scan"],
          evidenceFiles: ["trivy-fs.json"],
          closeoutWhenSkipped: "Install Trivy or document reviewer risk acceptance.",
        },
        {
          scanner: "Trivy images",
          closeoutStatus: "EVIDENCE_READY",
          requiredSwitch: "--include-container-images --require-scanners",
          relatedChecks: ["trivy backend image scan", "trivy frontend image scan"],
          evidenceFiles: ["trivy-backend-image.json", "trivy-frontend-image.json"],
          closeoutWhenSkipped: "Build images, run Trivy image scans, or document reviewer risk acceptance.",
        },
        {
          scanner: "OWASP ZAP baseline",
          closeoutStatus: "RISK_ACCEPTED",
          requiredSwitch: "--include-zap --require-scanners --target-url=<nginx-url>",
          relatedChecks: ["OWASP ZAP baseline"],
          evidenceFiles: ["zap-baseline.html"],
          closeoutWhenSkipped: "Run ZAP baseline or document reviewer risk acceptance.",
        },
      ],
    },
  },
  handoverIndex: { path: "artifacts/handover-index/20260101-000000/manifest.json", data: { status: "READY" } },
  fieldClosurePlan: { path: "artifacts/field-closure-plan/20260101-000000/manifest.json", data: { status: "CLOSED" } },
  manualEvidenceReadiness: {
    path: "artifacts/manual-evidence-readiness/20260101-000000/manifest.json",
    data: {
      status: "READY",
      readyForFinalClose: true,
      missingCount: 0,
      invalidCount: 0,
      git: { branch: "dev", commit: "fixture", clean: true },
    },
  },
  fieldRiskRegister: {
    path: "artifacts/field-risk-register/20260101-000000/manifest.json",
    data: { status: "NO_OPEN_RISKS", openRiskCount: 0, copyToRiskAcceptanceCount: 0 },
  },
  fieldActionBoard: {
    path: "artifacts/field-action-board/20260101-000000/manifest.json",
    data: { status: "READY_TO_CLOSE", openActionCount: 0, git: { branch: "dev", commit: "fixture", clean: true } },
  },
  fieldGateClosureMap: {
    path: "artifacts/field-gate-closure-map/20260101-000000/manifest.json",
    data: {
      status: "READY_TO_CLOSE",
      commandCount: 0,
      openGateCount: 0,
      git: { branch: "dev", commit: "fixture", clean: true },
    },
  },
  fieldOwnerBriefs: {
    path: "artifacts/field-owner-briefs/20260101-000000/manifest.json",
    data: { status: "READY_TO_CLOSE", ownerCount: 0, openItemCount: 0, git: { branch: "dev", commit: "fixture", clean: true } },
  },
};

readyEvidence.handoverPackage = {
  path: "artifacts/handover-package/20260101-000000/manifest.json",
  data: {
    status: "READY",
    canMarkGoalComplete: true,
    baseUrl: "http://field.local:8080",
    git: { branch: "dev", commit: "fixture", clean: true },
    residualFieldGates: [],
    strictFailureReasons: [],
    evidenceRefs: {
      delivery: readyEvidence.delivery.path,
      completionAudit: readyEvidence.completionAudit.path,
      fieldReadiness: readyEvidence.fieldReadiness.path,
      fieldAcceptance: readyEvidence.fieldAcceptance.path,
      securityEvidence: readyEvidence.securityEvidence.path,
      manualEvidenceReadiness: readyEvidence.manualEvidenceReadiness.path,
      fieldRiskRegister: readyEvidence.fieldRiskRegister.path,
      fieldActionBoard: readyEvidence.fieldActionBoard.path,
      fieldGateClosureMap: readyEvidence.fieldGateClosureMap.path,
      fieldOwnerBriefs: readyEvidence.fieldOwnerBriefs.path,
      handoverIndex: readyEvidence.handoverIndex.path,
      fieldClosurePlan: readyEvidence.fieldClosurePlan.path,
    },
  },
};

const ready = buildFinalStatusReport({
  evidenceRefs: readyEvidence,
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(ready.status === "READY_TO_CLOSE", "complete fixture should be READY_TO_CLOSE");
assert(ready.canMarkGoalComplete === true, "READY_TO_CLOSE should allow goal completion");
assert(ready.remainingGates.length === 0, "complete fixture should have no remaining gates");
assert(ready.gateSummary.total === 0, "complete fixture should have zero gate summary total");
assert(
  ready.referenceFreshness.some((item) => item.key === "fieldRiskRegister" && item.fresh === true),
  "complete fixture should verify fresh field risk register reference",
);
assert(
  ready.referenceFreshness.some((item) => item.key === "fieldAcceptance" && item.fresh === true),
  "complete fixture should verify fresh field acceptance reference",
);
assert(ready.fieldAcceptance.readyForHandover === true, "complete fixture should expose field acceptance handover readiness");
assert(
  ready.referenceFreshness.some((item) => item.key === "fieldActionBoard" && item.fresh === true),
  "complete fixture should verify fresh field action board reference",
);
assert(
  ready.referenceFreshness.some((item) => item.key === "fieldGateClosureMap" && item.fresh === true),
  "complete fixture should verify fresh field gate closure map reference",
);
assert(
  ready.referenceFreshness.some((item) => item.key === "fieldOwnerBriefs" && item.fresh === true),
  "complete fixture should verify fresh field owner briefs reference",
);
assert(
  ready.sourceRevisionFreshness.some((item) => item.key === "handoverPackage" && item.fresh === true && item.clean === true),
  "complete fixture should verify handover package source revision freshness",
);
assert(buildMarkdown(ready).includes("READY_TO_CLOSE"), "markdown should include READY_TO_CLOSE");
assert(buildMarkdown(ready).includes("Source Revision Freshness"), "markdown should include source revision freshness");
assert(buildMarkdown(ready).includes("Delivery Entrypoint Consistency"), "markdown should include delivery entrypoint consistency");
assert(buildMarkdown(ready).includes("Field Acceptance"), "markdown should include field acceptance summary");
assert(buildMarkdown(ready).includes("Git pushed to origin/dev: yes"), "markdown should include git push state");

const missing = buildFinalStatusReport({
  evidenceRefs: {},
  manualEvidence: [],
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(missing.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "missing fixture should require review");
assert(missing.canMarkGoalComplete === false, "missing fixture must not allow goal completion");
assert(
  missing.remainingGates.some((item) => item.category === "Completion Audit" && item.status === "MISSING"),
  "missing fixture should expose missing completion audit",
);
assert(
  missing.remainingGates.some((item) => item.category === "Security Evidence" && item.status === "MISSING"),
  "missing fixture should expose missing security evidence",
);
assert(
  missing.remainingGates.some((item) => item.category === "Manual Evidence Readiness" && item.status === "MISSING"),
  "missing fixture should expose missing manual evidence readiness",
);
assert(
  missing.gateActionRunbook.some((item) => item.actionType === "AUTOMATED_REFRESH_AVAILABLE"),
  "missing fixture should expose automated refresh action type",
);

const dirtySource = buildFinalStatusReport({
  evidenceRefs: readyEvidence,
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: { ...readyGit, clean: false },
});

assert(dirtySource.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "dirty source fixture should require review");
assert(
  dirtySource.remainingGates.some((item) => item.category === "Source Code State" && item.status === "DIRTY"),
  "dirty source fixture should expose dirty source code state",
);

const staleSourceRevision = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        git: { branch: "dev", commit: "older-fixture", clean: true },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(staleSourceRevision.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale source revision fixture should require review");
assert(
  staleSourceRevision.remainingGates.some(
    (item) => item.category === "Evidence Source Revision" && item.message.includes("handoverPackage"),
  ),
  "stale source revision fixture should expose stale handover package commit",
);
assert(
  staleSourceRevision.remainingGates.every(
    (item) => item.category !== "Evidence Source Revision" || item.actionType === "AUTOMATED_REFRESH_AVAILABLE",
  ),
  "stale source revision gates should be automated refresh actions",
);

const blockedSecurity = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    securityEvidence: {
      path: readyEvidence.securityEvidence.path,
      data: {
        targetUrl: "http://field.local:8080",
        options: { requireScanners: true },
        strictAcceptanceBlocked: true,
        dispositionSummary: { pass: 4, blocking: 1, deliveryFix: 0, riskAccepted: 0, unverified: 0 },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(blockedSecurity.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "blocked security fixture should require review");
assert(
  blockedSecurity.remainingGates.some((item) => item.category === "Security Evidence" && item.status === "BLOCKED"),
  "blocked security fixture should expose BLOCKED security evidence",
);
assert(
  blockedSecurity.gateActionRunbook.some((item) => item.actionType === "SECURITY_REVIEW_REQUIRED"),
  "blocked security fixture should expose security action type",
);

const openScannerCloseout = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    securityEvidence: {
      path: readyEvidence.securityEvidence.path,
      data: {
        ...readyEvidence.securityEvidence.data,
        scannerCloseout: [
          {
            scanner: "gitleaks",
            closeoutStatus: "BLOCKING",
            requiredSwitch: "--require-scanners",
            relatedChecks: ["gitleaks secret scan"],
            evidenceFiles: ["gitleaks.json"],
            closeoutWhenSkipped: "Install gitleaks or document reviewer risk acceptance.",
          },
        ],
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(openScannerCloseout.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "open scanner closeout fixture should require review");
assert(
  openScannerCloseout.remainingGates.some(
    (item) => item.category === "Security Scanner Closeout" && item.status === "BLOCKING" && item.message.includes("gitleaks"),
  ),
  "open scanner closeout fixture should expose scanner-specific closeout gate",
);
assert(
  openScannerCloseout.securityEvidence.scannerCloseoutSummary.open === 1,
  "open scanner closeout fixture should count open scanner rows",
);
assert(
  buildMarkdown(openScannerCloseout).includes("Security Scanner Closeout"),
  "markdown should include Security Scanner Closeout",
);

const missingScannerCloseout = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    securityEvidence: {
      path: readyEvidence.securityEvidence.path,
      data: {
        targetUrl: "http://field.local:8080",
        options: { requireScanners: true },
        strictAcceptanceBlocked: false,
        dispositionSummary: { pass: 6, blocking: 0, deliveryFix: 0, riskAccepted: 0, unverified: 0 },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(missingScannerCloseout.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "missing scanner closeout fixture should require review");
assert(
  missingScannerCloseout.remainingGates.some(
    (item) => item.category === "Security Scanner Closeout" && item.status === "MISSING",
  ),
  "missing scanner closeout fixture should expose missing scanner closeout matrix",
);

const deliveryFixSecurity = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    securityEvidence: {
      path: readyEvidence.securityEvidence.path,
      data: {
        targetUrl: "http://field.local:8080",
        options: { requireScanners: true },
        strictAcceptanceBlocked: false,
        dispositionSummary: { pass: 5, blocking: 0, deliveryFix: 1, riskAccepted: 0, unverified: 0 },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(deliveryFixSecurity.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "delivery-fix security fixture should require review");
assert(
  deliveryFixSecurity.remainingGates.some((item) => item.category === "Security Evidence" && item.status === "DELIVERY_FIX_REQUIRED"),
  "delivery-fix security fixture should expose DELIVERY_FIX_REQUIRED",
);

const reviewFieldAcceptance = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    fieldAcceptance: {
      ...readyEvidence.fieldAcceptance,
      data: {
        ...readyEvidence.fieldAcceptance.data,
        status: "REVIEW",
        handover: {
          ...readyEvidence.fieldAcceptance.data.handover,
          readyForHandover: false,
          requiresFieldReview: true,
          reviewStepCount: 1,
        },
        steps: [{ name: "operator UI browser walkthrough", status: "REVIEW" }],
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(reviewFieldAcceptance.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "review field acceptance fixture should require review");
assert(
  reviewFieldAcceptance.remainingGates.some((item) => item.category === "Field Acceptance" && item.status === "REVIEW"),
  "review field acceptance fixture should expose Field Acceptance REVIEW",
);
assert(
  reviewFieldAcceptance.remainingGates.some((item) => item.category === "Field Acceptance" && item.status === "OPERATOR_UI_REVIEW"),
  "review field acceptance fixture should expose operator UI review gate",
);
assert(
  reviewFieldAcceptance.gateActionRunbook.some((item) => item.actionType === "FIELD_ACTION_REQUIRED"),
  "review field acceptance fixture should route to field action",
);

const stalePackage = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        evidenceRefs: {
          ...readyEvidence.handoverPackage.data.evidenceRefs,
          securityEvidence: "artifacts/security/old/manifest.json",
        },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(stalePackage.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale package fixture should require review");
assert(
  stalePackage.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("securityEvidence")),
  "stale package fixture should expose stale security evidence reference",
);

const staleRiskRegister = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        evidenceRefs: {
          ...readyEvidence.handoverPackage.data.evidenceRefs,
          fieldRiskRegister: "artifacts/field-risk-register/old/manifest.json",
        },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(staleRiskRegister.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale risk register fixture should require review");
assert(
  staleRiskRegister.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("fieldRiskRegister")),
  "stale risk register fixture should expose stale field risk register reference",
);

const staleActionBoard = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        evidenceRefs: {
          ...readyEvidence.handoverPackage.data.evidenceRefs,
          fieldActionBoard: "artifacts/field-action-board/old/manifest.json",
        },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(staleActionBoard.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale action board fixture should require review");
assert(
  staleActionBoard.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("fieldActionBoard")),
  "stale action board fixture should expose stale field action board reference",
);

const staleGateClosureMap = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        evidenceRefs: {
          ...readyEvidence.handoverPackage.data.evidenceRefs,
          fieldGateClosureMap: "artifacts/field-gate-closure-map/old/manifest.json",
        },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(staleGateClosureMap.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale gate closure map fixture should require review");
assert(
  staleGateClosureMap.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("fieldGateClosureMap")),
  "stale gate closure map fixture should expose stale field gate closure map reference",
);

const staleOwnerBriefs = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    handoverPackage: {
      ...readyEvidence.handoverPackage,
      data: {
        ...readyEvidence.handoverPackage.data,
        evidenceRefs: {
          ...readyEvidence.handoverPackage.data.evidenceRefs,
          fieldOwnerBriefs: "artifacts/field-owner-briefs/old/manifest.json",
        },
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(staleOwnerBriefs.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale owner briefs fixture should require review");
assert(
  staleOwnerBriefs.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("fieldOwnerBriefs")),
  "stale owner briefs fixture should expose stale field owner briefs reference",
);

const openFieldRiskRegister = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    fieldRiskRegister: {
      ...readyEvidence.fieldRiskRegister,
      data: { status: "OPEN", openRiskCount: 1, copyToRiskAcceptanceCount: 1 },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(openFieldRiskRegister.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "open risk register fixture should require review");
assert(
  openFieldRiskRegister.remainingGates.some((item) => item.category === "Field Risk Register" && item.status === "OPEN"),
  "open risk register fixture should expose Field Risk Register OPEN",
);

const openFieldActionArtifacts = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    fieldActionBoard: {
      ...readyEvidence.fieldActionBoard,
      data: { status: "OPEN", openActionCount: 2, git: { branch: "dev", commit: "fixture", clean: true } },
    },
    fieldGateClosureMap: {
      ...readyEvidence.fieldGateClosureMap,
      data: { status: "OPEN", commandCount: 1, openGateCount: 2, git: { branch: "dev", commit: "fixture", clean: true } },
    },
    fieldOwnerBriefs: {
      ...readyEvidence.fieldOwnerBriefs,
      data: { status: "OPEN", ownerCount: 1, openItemCount: 2, git: { branch: "dev", commit: "fixture", clean: true } },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(openFieldActionArtifacts.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "open field action artifacts fixture should require review");
assert(
  openFieldActionArtifacts.remainingGates.some((item) => item.category === "Field Action Board" && item.status === "OPEN"),
  "open field action artifacts fixture should expose Field Action Board OPEN",
);
assert(
  openFieldActionArtifacts.remainingGates.some((item) => item.category === "Field Gate Closure Map" && item.status === "OPEN"),
  "open field action artifacts fixture should expose Field Gate Closure Map OPEN",
);
assert(
  openFieldActionArtifacts.remainingGates.some((item) => item.category === "Field Owner Briefs" && item.status === "OPEN"),
  "open field action artifacts fixture should expose Field Owner Briefs OPEN",
);

const objectBlocker = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    completionAudit: {
      path: readyEvidence.completionAudit.path,
      data: {
        status: "FIELD_VERIFICATION_REQUIRED",
        canMarkGoalComplete: false,
        completionBlockers: [
          {
            category: "field",
            message: "Field readiness status is REVIEW.",
            nextAction: "Run npm run field:readiness.",
          },
        ],
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

const objectBlockerMarkdown = buildMarkdown(objectBlocker);
assert(!objectBlocker.remainingGates[0].message.includes("[object Object]"), "object completion blockers must be formatted");
assert(objectBlockerMarkdown.includes("Field readiness status is REVIEW."), "object completion blocker message should be readable");
assert(
  objectBlocker.remainingGates.some((item) => item.category === "Completion Audit" && item.actionType === "REVIEW_REQUIRED"),
  "aggregate completion audit gate should remain review action type",
);

const wrongBranch = buildFinalStatusReport({
  evidenceRefs: readyEvidence,
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: { ...readyGit, branch: "codex/feature" },
});

assert(wrongBranch.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "wrong branch fixture should require review");
assert(
  wrongBranch.remainingGates.some((item) => item.category === "Git Delivery State" && item.status === "WRONG_BRANCH"),
  "wrong branch fixture should expose Git Delivery State WRONG_BRANCH",
);

const unpushedDeliveryCommit = buildFinalStatusReport({
  evidenceRefs: readyEvidence,
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: { ...readyGit, upstreamCommit: "older-fixture", pushed: false },
});

assert(unpushedDeliveryCommit.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "unpushed fixture should require review");
assert(
  unpushedDeliveryCommit.remainingGates.some((item) => item.category === "Git Delivery State" && item.status === "UNPUSHED"),
  "unpushed fixture should expose Git Delivery State UNPUSHED",
);
assert(
  unpushedDeliveryCommit.remainingGates.every(
    (item) => item.category !== "Git Delivery State" || item.actionType === "AUTOMATED_REFRESH_AVAILABLE",
  ),
  "git delivery state gates should be automated refresh actions",
);

const mismatchedEntrypoint = buildFinalStatusReport({
  evidenceRefs: {
    ...readyEvidence,
    securityEvidence: {
      ...readyEvidence.securityEvidence,
      data: {
        ...readyEvidence.securityEvidence.data,
        targetUrl: "http://localhost:8080",
      },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  baseUrl: "http://field.local:8080",
  git: readyGit,
});

assert(mismatchedEntrypoint.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "mismatched delivery entrypoint should require review");
assert(
  mismatchedEntrypoint.remainingGates.some((item) => item.category === "Delivery Entrypoint" && item.status === "MISMATCH"),
  "mismatched delivery entrypoint should expose Delivery Entrypoint MISMATCH",
);
assert(
  mismatchedEntrypoint.gateActionRunbook.some((item) => item.actionType === "FIELD_ACTION_REQUIRED"),
  "mismatched delivery entrypoint should route to field action",
);

console.log("final status report contracts ok");
