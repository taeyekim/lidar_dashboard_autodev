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
  [generator, "LIVE_TCP_READY", "final status report generator"],
  [generator, "requireScanners", "final status report generator"],
  [generator, "strictAcceptanceBlocked", "final status report generator"],
  [generator, "referenceFreshness", "final status report generator"],
  [generator, "sourceRevisionFreshness", "final status report generator"],
  [generator, "Source Code State", "final status report generator"],
  [generator, "Evidence Source Revision", "final status report generator"],
  [generator, "final source revision", "final status report generator"],
  [generator, "fieldRiskRegister", "final status report generator"],
  [generator, "fieldActionBoard", "final status report generator"],
  [generator, "fieldGateClosureMap", "final status report generator"],
  [generator, "fieldOwnerBriefs", "final status report generator"],
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
  [acceptanceChecklist, "npm run final:status", "acceptance checklist"],
  [acceptanceChecklist, "artifacts/final-status", "acceptance checklist"],
  [matrix, "artifacts/final-status", "delivery evidence matrix"],
  [matrix, "artifacts/field-risk-register", "delivery evidence matrix"],
  [matrix, "artifacts/field-action-board", "delivery evidence matrix"],
  [matrix, "artifacts/field-gate-closure-map", "delivery evidence matrix"],
  [matrix, "artifacts/field-owner-briefs", "delivery evidence matrix"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const manualPresent = [
  { type: "Operator UI Walkthrough", path: "artifacts/manual/operator-ui-walkthrough.md", status: "PRESENT", required: true },
  { type: "Field Risk Acceptance", path: "artifacts/manual/field-risk-acceptance.md", status: "PRESENT", required: true },
];

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
    data: { status: "PASS", env: { controlBoardSafetyStatus: "LIVE_TCP_READY" } },
  },
  securityEvidence: {
    path: "artifacts/security/20260101-000000/manifest.json",
    data: { options: { requireScanners: true }, strictAcceptanceBlocked: false },
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
    git: { branch: "dev", commit: "fixture", clean: true },
    residualFieldGates: [],
    strictFailureReasons: [],
    evidenceRefs: {
      delivery: readyEvidence.delivery.path,
      completionAudit: readyEvidence.completionAudit.path,
      fieldReadiness: readyEvidence.fieldReadiness.path,
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
  git: { branch: "dev", commit: "fixture", clean: true },
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

const missing = buildFinalStatusReport({
  evidenceRefs: {},
  manualEvidence: [],
  generatedAt: "2026-01-01T00:00:00.000Z",
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: false },
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
  git: { branch: "dev", commit: "fixture", clean: true },
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
      data: { options: { requireScanners: true }, strictAcceptanceBlocked: true },
    },
  },
  manualEvidence: manualPresent,
  generatedAt: "2026-01-01T00:00:00.000Z",
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: true },
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
  git: { branch: "dev", commit: "fixture", clean: true },
});

assert(staleOwnerBriefs.status === "FIELD_OR_SECURITY_REVIEW_REQUIRED", "stale owner briefs fixture should require review");
assert(
  staleOwnerBriefs.remainingGates.some((item) => item.category === "Evidence Freshness" && item.message.includes("fieldOwnerBriefs")),
  "stale owner briefs fixture should expose stale field owner briefs reference",
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
  git: { branch: "dev", commit: "fixture", clean: true },
});

const objectBlockerMarkdown = buildMarkdown(objectBlocker);
assert(!objectBlocker.remainingGates[0].message.includes("[object Object]"), "object completion blockers must be formatted");
assert(objectBlockerMarkdown.includes("Field readiness status is REVIEW."), "object completion blocker message should be readable");
assert(
  objectBlocker.remainingGates.some((item) => item.category === "Completion Audit" && item.actionType === "REVIEW_REQUIRED"),
  "aggregate completion audit gate should remain review action type",
);

console.log("final status report contracts ok");
