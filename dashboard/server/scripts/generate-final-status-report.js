const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { manualEvidenceRefs } = require("./manual-evidence");

const root = path.join(__dirname, "..", "..", "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.stdout.trim();
}

function buildGitState(inputGit) {
  if (inputGit) {
    const upstreamCommit = inputGit.upstreamCommit ?? inputGit.remoteCommit ?? null;
    return {
      branch: inputGit.branch,
      commit: inputGit.commit,
      clean: inputGit.clean,
      upstream: inputGit.upstream || null,
      upstreamCommit,
      pushed: inputGit.pushed ?? Boolean(inputGit.commit && upstreamCommit && inputGit.commit === upstreamCommit),
    };
  }

  const upstream = gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstreamCommit = upstream ? gitValue(["rev-parse", "@{u}"]) : "";
  const commit = gitValue(["rev-parse", "HEAD"]);
  return {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit,
    clean: gitValue(["status", "--short"]) === "",
    upstream: upstream || null,
    upstreamCommit: upstreamCommit || null,
    pushed: Boolean(commit && upstreamCommit && commit === upstreamCommit),
  };
}

function latestEvidenceRefs() {
  return {
    delivery: readLatestJsonManifest("artifacts/delivery"),
    completionAudit: readLatestJsonManifest("artifacts/completion-audit"),
    fieldReadiness: readLatestJsonManifest("artifacts/field-readiness"),
    securityEvidence: readLatestJsonManifest("artifacts/security"),
    handoverPackage: readLatestJsonManifest("artifacts/handover-package"),
    handoverIndex: readLatestJsonManifest("artifacts/handover-index"),
    fieldClosurePlan: readLatestJsonManifest("artifacts/field-closure-plan"),
    fieldPreflight: readLatestJsonManifest("artifacts/field-preflight"),
    fieldAcceptance: readLatestJsonManifest("artifacts/field-acceptance"),
    dbFieldRehearsal: readLatestJsonManifest("artifacts/field-db-rehearsal"),
    lidarFieldRehearsal: readLatestJsonManifest("artifacts/field-lidar-rehearsal"),
    controlBoardFieldRehearsal: readLatestJsonManifest("artifacts/field-control-board-rehearsal"),
    runtimeEvidence: readLatestJsonManifest("artifacts/runtime"),
    manualEvidenceReadiness: readLatestJsonManifest("artifacts/manual-evidence-readiness"),
    fieldRiskRegister: readLatestJsonManifest("artifacts/field-risk-register"),
    fieldActionBoard: readLatestJsonManifest("artifacts/field-action-board"),
    fieldGateClosureMap: readLatestJsonManifest("artifacts/field-gate-closure-map"),
    fieldOwnerBriefs: readLatestJsonManifest("artifacts/field-owner-briefs"),
  };
}

function evidencePath(item) {
  return item?.path || null;
}

function actionTypeForGate(category, status, message) {
  const text = `${category} ${status} ${message}`.toLowerCase();
  if (category === "Evidence Source Revision") return "AUTOMATED_REFRESH_AVAILABLE";
  if (category === "Source Code State") return "AUTOMATED_REFRESH_AVAILABLE";
  if (category === "Git Delivery State") return "AUTOMATED_REFRESH_AVAILABLE";
  if (category === "Delivery Entrypoint") return "FIELD_ACTION_REQUIRED";
  if ((category === "Completion Audit" || category === "Handover Package") && status !== "MISSING") return "REVIEW_REQUIRED";
  if (text.includes("manual evidence") || text.includes("operator ui walkthrough") || text.includes("field risk acceptance")) {
    return "MANUAL_EVIDENCE_REQUIRED";
  }
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) {
    return "SECURITY_REVIEW_REQUIRED";
  }
  if (
    text.includes("control-board") ||
    text.includes("live_tcp") ||
    text.includes("field") ||
    text.includes("hardware") ||
    text.includes("delivery runtime") ||
    text.includes("lidar pc") ||
    text.includes("nginx entrypoint")
  ) {
    return "FIELD_ACTION_REQUIRED";
  }
  if (status === "MISSING" || status === "STALE") return "AUTOMATED_REFRESH_AVAILABLE";
  return "REVIEW_REQUIRED";
}

function addGate(gates, category, status, message, closeWhen, evidence) {
  const normalizedMessage = String(message || "Gate requires review.").replace(/\s+/g, " ").trim();
  gates.push({
    category,
    status,
    actionType: actionTypeForGate(category, status, normalizedMessage),
    message: normalizedMessage,
    closeWhen,
    evidence: evidence || null,
  });
}

function formatCompletionBlocker(blocker) {
  if (typeof blocker === "string") return blocker;
  if (!blocker || typeof blocker !== "object") return String(blocker || "");
  const parts = [
    blocker.category ? `[${blocker.category}]` : "",
    blocker.message || blocker.reason || blocker.status || "",
    blocker.nextAction ? `Next: ${blocker.nextAction}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function gateSummary(gates) {
  return gates.reduce(
    (summary, gate) => {
      summary.total += 1;
      summary.byActionType[gate.actionType] = (summary.byActionType[gate.actionType] || 0) + 1;
      summary.byCategory[gate.category] = (summary.byCategory[gate.category] || 0) + 1;
      return summary;
    },
    { total: 0, byActionType: {}, byCategory: {} },
  );
}

function gateActionRunbook(gates) {
  const runbooks = {
    AUTOMATED_REFRESH_AVAILABLE:
      "Refresh generated evidence with npm.cmd run delivery:evidence, npm.cmd run completion:audit, npm.cmd run handover:package, then rerun npm.cmd run final:status.",
    FIELD_ACTION_REQUIRED:
      "Run the field preflight, runtime smoke, DB/LiDAR/control-board rehearsals, field readiness, and field acceptance commands against the delivery Nginx entrypoint and approved hardware/network.",
    MANUAL_EVIDENCE_REQUIRED:
      "Fill the required manual evidence templates and attach the accepted copies under artifacts/manual/ before rerunning field acceptance and final status.",
    SECURITY_REVIEW_REQUIRED:
      "Run npm.cmd run security:evidence with --include-container-images --include-zap --require-scanners, or attach accepted risk evidence for unavailable scanners.",
    REVIEW_REQUIRED:
      "Review the referenced manifest, close the listed gate, and rerun npm.cmd run final:status.",
  };
  return Object.entries(gateSummary(gates).byActionType).map(([actionType, count]) => ({
    actionType,
    count,
    nextAction: runbooks[actionType] || runbooks.REVIEW_REQUIRED,
  }));
}

function buildSecuritySummary(security) {
  const data = security?.data || {};
  const scannerCloseout = Array.isArray(data.scannerCloseout) ? data.scannerCloseout : [];
  const openScannerCloseout = scannerCloseout.filter(
    (item) => !["EVIDENCE_READY", "RISK_ACCEPTED"].includes(item.closeoutStatus),
  );
  return {
    path: evidencePath(security),
    exists: Boolean(security),
    requireScanners: data.options?.requireScanners === true,
    strictAcceptanceBlocked: data.strictAcceptanceBlocked === true,
    dispositionSummary: data.dispositionSummary || null,
    scannerCloseout,
    scannerCloseoutSummary: {
      total: scannerCloseout.length,
      evidenceReady: scannerCloseout.filter((item) => item.closeoutStatus === "EVIDENCE_READY").length,
      riskAccepted: scannerCloseout.filter((item) => item.closeoutStatus === "RISK_ACCEPTED").length,
      blocking: scannerCloseout.filter((item) => item.closeoutStatus === "BLOCKING").length,
      unverified: scannerCloseout.filter((item) => item.closeoutStatus === "UNVERIFIED").length,
      pending: scannerCloseout.filter((item) => item.closeoutStatus === "PENDING").length,
      open: openScannerCloseout.length,
    },
  };
}

function buildManualEvidenceSummary(manualEvidence) {
  return manualEvidence.map((item) => ({
    type: item.type,
    path: item.path,
    status: item.status,
    required: Boolean(item.required),
    validationReason: item.validationReason || "",
    doneWhen: item.doneWhen || item.requiredWhen || "",
  }));
}

function refsAreFresh(handoverPackage, evidenceRefs) {
  const refs = handoverPackage?.data?.evidenceRefs || {};
  const expected = {
    delivery: evidencePath(evidenceRefs.delivery),
    completionAudit: evidencePath(evidenceRefs.completionAudit),
    fieldReadiness: evidencePath(evidenceRefs.fieldReadiness),
    fieldAcceptance: evidencePath(evidenceRefs.fieldAcceptance),
    securityEvidence: evidencePath(evidenceRefs.securityEvidence),
    manualEvidenceReadiness: evidencePath(evidenceRefs.manualEvidenceReadiness),
    fieldRiskRegister: evidencePath(evidenceRefs.fieldRiskRegister),
    fieldActionBoard: evidencePath(evidenceRefs.fieldActionBoard),
    fieldGateClosureMap: evidencePath(evidenceRefs.fieldGateClosureMap),
    fieldOwnerBriefs: evidencePath(evidenceRefs.fieldOwnerBriefs),
    handoverIndex: evidencePath(evidenceRefs.handoverIndex),
    fieldClosurePlan: evidencePath(evidenceRefs.fieldClosurePlan),
  };

  return Object.entries(expected).map(([key, expectedPath]) => ({
    key,
    expected: expectedPath,
    actual: refs[key] || null,
    fresh: Boolean(expectedPath && refs[key] === expectedPath),
  }));
}

function sourceGitFreshness(evidenceRefs, reportGit) {
  return Object.entries(evidenceRefs)
    .filter(([, value]) => value?.data?.git?.commit)
    .map(([key, value]) => ({
      key,
      path: evidencePath(value),
      expectedCommit: reportGit?.commit || null,
      actualCommit: value.data.git.commit,
      branch: value.data.git.branch || null,
      branchOk: value.data.git.branch === "dev",
      clean: value.data.git.clean === true,
      fresh: Boolean(reportGit?.commit && value.data.git.commit === reportGit.commit),
    }));
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function endpointConsistency(reportBaseUrl, evidenceRefs) {
  const expected = normalizeEndpoint(reportBaseUrl);
  return [
    ["fieldReadiness", evidenceRefs.fieldReadiness?.data?.baseUrl],
    ["fieldAcceptance", evidenceRefs.fieldAcceptance?.data?.baseUrl],
    ["securityEvidence", evidenceRefs.securityEvidence?.data?.targetUrl],
    ["handoverPackage", evidenceRefs.handoverPackage?.data?.baseUrl],
    ["runtimeEvidence", evidenceRefs.runtimeEvidence?.data?.options?.baseUrl],
  ]
    .filter(([, actual]) => actual)
    .map(([key, actual]) => ({
      key,
      expected: reportBaseUrl,
      actual,
      fresh: Boolean(expected && normalizeEndpoint(actual) === expected),
    }));
}

function buildFieldAcceptanceSummary(fieldAcceptance) {
  const data = fieldAcceptance?.data || {};
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const operatorUiStep = steps.find((step) => String(step.name || "").toLowerCase().includes("operator ui browser walkthrough")) || null;
  return {
    path: evidencePath(fieldAcceptance),
    status: data.status || "MISSING",
    baseUrl: data.baseUrl || null,
    readyForHandover: data.handover?.readyForHandover === true,
    requiresFieldReview: data.handover?.requiresFieldReview === true,
    reviewer: data.handover?.reviewer || "",
    siteName: data.handover?.siteName || "",
    latestPreflightStatus: data.handover?.latestPreflightStatus || "UNKNOWN",
    latestPreflightPassed: data.handover?.latestPreflightPassed === true,
    reviewStepCount: Number(data.handover?.reviewStepCount || 0),
    skippedStepCount: Number(data.handover?.skippedStepCount || 0),
    operatorUiWalkthroughStatus: operatorUiStep?.status || "MISSING",
    operatorUiWalkthroughEvidence: data.safety?.operatorUiWalkthroughEvidence || "",
  };
}

function buildFinalStatusReport(input = {}) {
  const evidenceRefs = input.evidenceRefs || latestEvidenceRefs();
  const manualEvidence = input.manualEvidence || manualEvidenceRefs();
  const gates = [];
  const completion = evidenceRefs.completionAudit;
  const readiness = evidenceRefs.fieldReadiness;
  const fieldAcceptance = evidenceRefs.fieldAcceptance;
  const security = evidenceRefs.securityEvidence;
  const handoverPackage = evidenceRefs.handoverPackage;
  const fieldRiskRegister = evidenceRefs.fieldRiskRegister;
  const fieldActionBoard = evidenceRefs.fieldActionBoard;
  const fieldGateClosureMap = evidenceRefs.fieldGateClosureMap;
  const fieldOwnerBriefs = evidenceRefs.fieldOwnerBriefs;
  const completionData = completion?.data || {};
  const readinessData = readiness?.data || {};
  const packageData = handoverPackage?.data || {};
  const fieldRiskRegisterData = fieldRiskRegister?.data || {};
  const fieldActionBoardData = fieldActionBoard?.data || {};
  const fieldGateClosureMapData = fieldGateClosureMap?.data || {};
  const fieldOwnerBriefsData = fieldOwnerBriefs?.data || {};
  const manualReadiness = evidenceRefs.manualEvidenceReadiness;
  const manualReadinessData = manualReadiness?.data || {};
  const securitySummary = buildSecuritySummary(security);
  const fieldAcceptanceSummary = buildFieldAcceptanceSummary(fieldAcceptance);
  const manualEvidenceSummary = buildManualEvidenceSummary(manualEvidence);
  const referenceFreshness = refsAreFresh(handoverPackage, evidenceRefs);
  const git = buildGitState(input.git);
  const sourceRevisionFreshness = sourceGitFreshness(evidenceRefs, git);
  const baseUrl = input.baseUrl || "http://localhost:8080";
  const deliveryEntrypointConsistency = endpointConsistency(baseUrl, evidenceRefs);

  if (git.clean !== true) {
    addGate(
      gates,
      "Source Code State",
      "DIRTY",
      "Final status was generated while the working tree was not clean.",
      "Commit or intentionally clear local changes, then rerun npm.cmd run final:status from the delivery revision.",
      null,
    );
  }
  if (git.branch !== "dev") {
    addGate(
      gates,
      "Git Delivery State",
      "WRONG_BRANCH",
      `Final delivery source is on ${git.branch || "unknown"} instead of dev.`,
      "Switch to dev, commit the delivery source, push origin dev, then rerun npm.cmd run final:status.",
      null,
    );
  }
  if (git.upstream !== "origin/dev") {
    addGate(
      gates,
      "Git Delivery State",
      "WRONG_UPSTREAM",
      `Final delivery source upstream is ${git.upstream || "missing"} instead of origin/dev.`,
      "Set or switch to the dev branch tracking origin/dev, push the delivery commit, then rerun npm.cmd run final:status.",
      null,
    );
  }
  if (git.pushed !== true) {
    addGate(
      gates,
      "Git Delivery State",
      "UNPUSHED",
      `Final delivery commit ${git.commit || "unknown"} is not proven pushed to origin/dev ${git.upstreamCommit || "missing"}.`,
      "Push the final delivery commit to origin/dev, confirm git status is clean and synced, then rerun npm.cmd run final:status.",
      null,
    );
  }

  if (!completion) {
    addGate(gates, "Completion Audit", "MISSING", "Latest completion audit manifest is missing.", "Run npm.cmd run completion:audit.", null);
  } else {
    if (completionData.status !== "COMPLETE" || completionData.canMarkGoalComplete !== true) {
      const blockers = Array.isArray(completionData.completionBlockers)
        ? completionData.completionBlockers.map(formatCompletionBlocker).join("; ")
        : "completion audit is not COMPLETE.";
      addGate(gates, "Completion Audit", completionData.status || "REVIEW", blockers, "Close completionBlockers and rerun npm.cmd run completion:audit.", evidencePath(completion));
    }
  }

  if (!readiness) {
    addGate(gates, "Field Readiness", "MISSING", "Latest field readiness manifest is missing.", "Run npm.cmd run field:readiness -- --base-url=<delivery-url>.", null);
  } else {
    if (readinessData.status !== "PASS") {
      addGate(gates, "Field Readiness", readinessData.status || "REVIEW", "Field readiness is not PASS.", "Resolve readiness REVIEW/SKIPPED checks and rerun field:readiness.", evidencePath(readiness));
    }
    if (readinessData.env?.controlBoardSafetyStatus !== "LIVE_TCP_READY") {
      addGate(gates, "Control Board TCP", readinessData.env?.controlBoardSafetyStatus || "UNKNOWN", "Control-board safety is not LIVE_TCP_READY.", "Configure field host/port, record CONTROL_BOARD_LIVE_APPROVED=true, and capture live TCP rehearsal evidence.", evidencePath(readiness));
    }
  }

  if (!fieldAcceptance) {
    addGate(
      gates,
      "Field Acceptance",
      "MISSING",
      "Latest field acceptance manifest is missing.",
      "Run npm.cmd run field:acceptance -- -BaseUrl <delivery-url> -Reviewer <field-reviewer> -SiteName <delivery-site> -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md.",
      null,
    );
  } else {
    if (fieldAcceptanceSummary.status !== "PASS") {
      addGate(
        gates,
        "Field Acceptance",
        fieldAcceptanceSummary.status || "REVIEW",
        `Field acceptance status is ${fieldAcceptanceSummary.status}; review=${fieldAcceptanceSummary.reviewStepCount}, skipped=${fieldAcceptanceSummary.skippedStepCount}.`,
        "Close REVIEW/SKIPPED field acceptance steps and rerun the field acceptance orchestrator.",
        evidencePath(fieldAcceptance),
      );
    }
    if (fieldAcceptanceSummary.readyForHandover !== true || fieldAcceptanceSummary.requiresFieldReview === true) {
      addGate(
        gates,
        "Field Acceptance",
        "NOT_READY",
        `Field acceptance handover readiness is not closed: readyForHandover=${fieldAcceptanceSummary.readyForHandover}, requiresFieldReview=${fieldAcceptanceSummary.requiresFieldReview}.`,
        "Record reviewer/site, require PASS preflight, close review/skipped steps, and rerun field acceptance.",
        evidencePath(fieldAcceptance),
      );
    }
    if (fieldAcceptanceSummary.operatorUiWalkthroughStatus !== "PASS") {
      addGate(
        gates,
        "Field Acceptance",
        "OPERATOR_UI_REVIEW",
        `Operator UI walkthrough step is ${fieldAcceptanceSummary.operatorUiWalkthroughStatus}.`,
        "Attach accepted operator UI walkthrough evidence and rerun field acceptance.",
        evidencePath(fieldAcceptance),
      );
    }
  }

  if (!security) {
    addGate(gates, "Security Evidence", "MISSING", "Latest security evidence manifest is missing.", "Run npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=<delivery-url>.", null);
  } else {
    if (securitySummary.scannerCloseout.length === 0) {
      addGate(
        gates,
        "Security Scanner Closeout",
        "MISSING",
        "Security evidence does not include scannerCloseout rows.",
        "Rerun npm.cmd run security:evidence so the Scanner Closeout Matrix is included in manifest.json and manifest.md.",
        evidencePath(security),
      );
    }
    securitySummary.scannerCloseout
      .filter((item) => !["EVIDENCE_READY", "RISK_ACCEPTED"].includes(item.closeoutStatus))
      .forEach((item) => {
        addGate(
          gates,
          "Security Scanner Closeout",
          item.closeoutStatus || "REVIEW",
          `${item.scanner} scanner closeout is ${item.closeoutStatus || "REVIEW"}; related checks=${(item.relatedChecks || []).join(", ") || "none"}.`,
          item.closeoutWhenSkipped || "Run the scanner, attach evidence, or document reviewer risk acceptance.",
          evidencePath(security),
        );
      });
    if (!securitySummary.requireScanners) {
      addGate(gates, "Security Evidence", "REVIEW", "Security evidence was not generated with requireScanners=true.", "Rerun security:evidence with --require-scanners or attach accepted field-risk evidence.", evidencePath(security));
    }
    if (securitySummary.strictAcceptanceBlocked) {
      addGate(gates, "Security Evidence", "BLOCKED", "Required scanner security evidence is strictAcceptanceBlocked.", "Resolve scanner failures/skips or attach accepted field-risk evidence.", evidencePath(security));
    }
    if (Number(securitySummary.dispositionSummary?.blocking || 0) > 0) {
      addGate(
        gates,
        "Security Evidence",
        "BLOCKING_FINDINGS",
        `${securitySummary.dispositionSummary.blocking} security check(s) are classified as BLOCKING.`,
        "Resolve blocking security findings or attach accepted field-risk evidence before final close.",
        evidencePath(security),
      );
    }
    if (Number(securitySummary.dispositionSummary?.deliveryFix || 0) > 0) {
      addGate(
        gates,
        "Security Evidence",
        "DELIVERY_FIX_REQUIRED",
        `${securitySummary.dispositionSummary.deliveryFix} security check(s) require delivery fixes.`,
        "Fix the reported security findings and rerun npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners.",
        evidencePath(security),
      );
    }
  }

  manualEvidenceSummary
    .filter((item) => item.required && item.status !== "PRESENT")
    .forEach((item) => {
      addGate(gates, "Manual Evidence", item.status, `${item.type} evidence is ${item.status}. ${item.validationReason}`.trim(), item.doneWhen, item.path);
    });
  if (!manualReadiness) {
    addGate(
      gates,
      "Manual Evidence Readiness",
      "MISSING",
      "Manual evidence readiness report is missing.",
      "Run npm.cmd run manual:evidence-readiness and review the generated checklist.",
      null,
    );
  } else if (manualReadinessData.readyForFinalClose !== true) {
    addGate(
      gates,
      "Manual Evidence Readiness",
      manualReadinessData.status || "REVIEW",
      `Manual evidence readiness is ${manualReadinessData.status || "REVIEW"} with missing=${manualReadinessData.missingCount ?? "unknown"} invalid=${manualReadinessData.invalidCount ?? "unknown"}.`,
      "Fill or repair required manual evidence and rerun npm.cmd run manual:evidence-readiness.",
      evidencePath(manualReadiness),
    );
  }

  if (!handoverPackage) {
    addGate(gates, "Handover Package", "MISSING", "Latest handover package manifest is missing.", "Run npm.cmd run handover:package -- --base-url=<delivery-url>.", null);
  } else {
    if (packageData.status !== "READY" || packageData.canMarkGoalComplete !== true) {
      const reasons = Array.isArray(packageData.strictFailureReasons) && packageData.strictFailureReasons.length > 0
        ? packageData.strictFailureReasons.join("; ")
        : "handover package is not READY.";
      addGate(gates, "Handover Package", packageData.status || "REVIEW", reasons, "Resolve strictFailureReasons and rerun handover:package -- --strict.", evidencePath(handoverPackage));
    }
    if (Array.isArray(packageData.residualFieldGates) && packageData.residualFieldGates.length > 0) {
      packageData.residualFieldGates.forEach((item) => {
        addGate(gates, item.category || "Residual Field Gate", item.status || "OPEN", item.message || "Residual field gate remains open.", item.closeWhen || "Close the residual field gate.", evidencePath(handoverPackage));
      });
    }
    referenceFreshness
      .filter((item) => !item.fresh)
      .forEach((item) => {
        addGate(gates, "Evidence Freshness", "STALE", `${item.key} reference is not latest.`, "Refresh handover:package after regenerating all final evidence.", evidencePath(handoverPackage));
    });
  }

  if (!fieldRiskRegister) {
    addGate(gates, "Field Risk Register", "MISSING", "Latest field risk register manifest is missing.", "Run npm.cmd run field:risk-register.", null);
  } else if (fieldRiskRegisterData.status !== "NO_OPEN_RISKS" || Number(fieldRiskRegisterData.openRiskCount || 0) > 0) {
    addGate(
      gates,
      "Field Risk Register",
      fieldRiskRegisterData.status || "OPEN",
      `Field risk register has ${fieldRiskRegisterData.openRiskCount ?? "unknown"} open risk item(s).`,
      "Resolve the risks or attach accepted field-risk evidence, then rerun field:risk-register and final:status.",
      evidencePath(fieldRiskRegister),
    );
  }

  if (!fieldActionBoard) {
    addGate(gates, "Field Action Board", "MISSING", "Latest field action board manifest is missing.", "Run npm.cmd run field:action-board.", null);
  } else if (fieldActionBoardData.status !== "READY_TO_CLOSE" || Number(fieldActionBoardData.openActionCount || 0) > 0) {
    addGate(
      gates,
      "Field Action Board",
      fieldActionBoardData.status || "OPEN",
      `Field action board has ${fieldActionBoardData.openActionCount ?? "unknown"} open action item(s).`,
      "Close the listed field actions, refresh final:status, then rerun field:action-board.",
      evidencePath(fieldActionBoard),
    );
  }

  if (!fieldGateClosureMap) {
    addGate(gates, "Field Gate Closure Map", "MISSING", "Latest field gate closure map manifest is missing.", "Run npm.cmd run field:gate-closure-map.", null);
  } else if (fieldGateClosureMapData.status !== "READY_TO_CLOSE" || Number(fieldGateClosureMapData.openGateCount || 0) > 0) {
    addGate(
      gates,
      "Field Gate Closure Map",
      fieldGateClosureMapData.status || "OPEN",
      `Field gate closure map has ${fieldGateClosureMapData.openGateCount ?? "unknown"} open gate(s).`,
      "Run the mapped commands until all gates are closed, then refresh field:action-board, field:gate-closure-map, and final:status.",
      evidencePath(fieldGateClosureMap),
    );
  }

  if (!fieldOwnerBriefs) {
    addGate(gates, "Field Owner Briefs", "MISSING", "Latest field owner briefs manifest is missing.", "Run npm.cmd run field:owner-briefs.", null);
  } else if (fieldOwnerBriefsData.status !== "READY_TO_CLOSE" || Number(fieldOwnerBriefsData.openItemCount || 0) > 0) {
    addGate(
      gates,
      "Field Owner Briefs",
      fieldOwnerBriefsData.status || "OPEN",
      `Field owner briefs have ${fieldOwnerBriefsData.openItemCount ?? "unknown"} open owner item(s).`,
      "Close the owner brief items, refresh field:action-board and field:owner-briefs, then rerun final:status.",
      evidencePath(fieldOwnerBriefs),
    );
  }

  sourceRevisionFreshness
    .filter((item) => !item.fresh || !item.clean || !item.branchOk)
    .forEach((item) => {
      const reasons = [
        !item.fresh ? `commit ${item.actualCommit} does not match final status commit ${item.expectedCommit}` : "",
        !item.branchOk ? `evidence branch ${item.branch || "missing"} is not dev` : "",
        !item.clean ? "source evidence was generated with a dirty working tree" : "",
      ].filter(Boolean).join("; ");
      addGate(
        gates,
        "Evidence Source Revision",
        "STALE",
        `${item.key} evidence is not tied to the clean final source revision: ${reasons}.`,
        "Regenerate the referenced evidence after the final delivery commit and rerun npm.cmd run final:status.",
        item.path,
      );
    });

  deliveryEntrypointConsistency
    .filter((item) => !item.fresh)
    .forEach((item) => {
      addGate(
        gates,
        "Delivery Entrypoint",
        "MISMATCH",
        `${item.key} evidence was generated for ${item.actual}, but final status is using ${item.expected}.`,
        "Regenerate field readiness, security evidence, runtime evidence, and handover package against the same delivery Nginx entrypoint, then rerun npm.cmd run final:status -- --base-url=<delivery-url>.",
        evidencePath(evidenceRefs[item.key]),
      );
    });

  const status = gates.length === 0 ? "READY_TO_CLOSE" : "FIELD_OR_SECURITY_REVIEW_REQUIRED";
  const summary = gateSummary(gates);

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: input.siteName || "unspecified",
    hostName: input.hostName || os.hostname(),
    baseUrl,
    git,
    status,
    canMarkGoalComplete: status === "READY_TO_CLOSE",
    completionAudit: {
      path: evidencePath(completion),
      status: completionData.status || "MISSING",
      canMarkGoalComplete: completionData.canMarkGoalComplete === true,
      blockers: completionData.completionBlockers || [],
    },
    fieldReadiness: {
      path: evidencePath(readiness),
      status: readinessData.status || "MISSING",
      controlBoardSafetyStatus: readinessData.env?.controlBoardSafetyStatus || "UNKNOWN",
    },
    fieldAcceptance: fieldAcceptanceSummary,
    securityEvidence: securitySummary,
    manualEvidenceReadiness: {
      path: evidencePath(manualReadiness),
      status: manualReadinessData.status || "MISSING",
      readyForFinalClose: manualReadinessData.readyForFinalClose === true,
      missingCount: manualReadinessData.missingCount ?? null,
      invalidCount: manualReadinessData.invalidCount ?? null,
    },
    handoverPackage: {
      path: evidencePath(handoverPackage),
      status: packageData.status || "MISSING",
      canMarkGoalComplete: packageData.canMarkGoalComplete === true,
      residualFieldGateCount: Array.isArray(packageData.residualFieldGates) ? packageData.residualFieldGates.length : null,
      strictFailureReasons: packageData.strictFailureReasons || [],
    },
    evidenceRefs: Object.fromEntries(Object.entries(evidenceRefs).map(([key, value]) => [key, evidencePath(value)])),
    referenceFreshness,
    sourceRevisionFreshness,
    deliveryEntrypointConsistency,
    manualEvidence: manualEvidenceSummary,
    gateSummary: summary,
    gateActionRunbook: gateActionRunbook(gates),
    remainingGates: gates,
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# Final Status Report",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Completion Summary",
    "",
    `- Completion audit: ${manifest.completionAudit.status} (${manifest.completionAudit.path || "missing"})`,
    `- Field readiness: ${manifest.fieldReadiness.status} (${manifest.fieldReadiness.path || "missing"})`,
    `- Field acceptance: ${manifest.fieldAcceptance.status} (${manifest.fieldAcceptance.path || "missing"})`,
    `- Field acceptance ready for handover: ${manifest.fieldAcceptance.readyForHandover}`,
    `- Control-board safety: ${manifest.fieldReadiness.controlBoardSafetyStatus}`,
    `- Security evidence: ${manifest.securityEvidence.exists ? "present" : "missing"} (${manifest.securityEvidence.path || "missing"})`,
    `- Security scanner closeout open: ${manifest.securityEvidence.scannerCloseoutSummary.open}/${manifest.securityEvidence.scannerCloseoutSummary.total}`,
    `- Manual evidence readiness: ${manifest.manualEvidenceReadiness.status} (${manifest.manualEvidenceReadiness.path || "missing"})`,
    `- Handover package: ${manifest.handoverPackage.status} (${manifest.handoverPackage.path || "missing"})`,
    `- Remaining gate count: ${manifest.gateSummary.total}`,
    "",
    "## Gate Action Summary",
    "",
    "| Action Type | Count | Next Action |",
    "| --- | --- | --- |",
    ...(manifest.gateActionRunbook.length > 0
      ? manifest.gateActionRunbook.map(
          (item) => `| ${markdownCell(item.actionType)} | ${item.count} | ${markdownCell(item.nextAction)} |`,
        )
      : ["| none | 0 | No final gates remain. |"]),
    "",
    "## Remaining Gates",
    "",
    "| Category | Status | Action Type | Message | Close When | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.remainingGates.length > 0
      ? manifest.remainingGates.map(
          (item) =>
            `| ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.actionType)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} |`,
        )
      : ["| none | PASS | REVIEW_REQUIRED | No remaining final gates. | - | - |"]),
    "",
    "## Security Scanner Closeout",
    "",
    "| Scanner | Status | Required Switch | Related Checks | Evidence Files | Closeout If Skipped |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.securityEvidence.scannerCloseout.length > 0
      ? manifest.securityEvidence.scannerCloseout.map(
          (item) =>
            `| ${markdownCell(item.scanner)} | ${markdownCell(item.closeoutStatus)} | \`${markdownCell(item.requiredSwitch || "")}\` | ${markdownCell((item.relatedChecks || []).join(", ") || "none")} | ${markdownCell((item.evidenceFiles || []).join(", ") || "none")} | ${markdownCell(item.closeoutWhenSkipped || "Run scanner or attach accepted risk evidence.")} |`,
        )
      : ["| missing | MISSING | - | - | - | Rerun security:evidence with Scanner Closeout Matrix support. |"]),
    "",
    "## Field Acceptance",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Manifest | ${manifest.fieldAcceptance.path ? `\`${markdownCell(manifest.fieldAcceptance.path)}\`` : "missing"} |`,
    `| Status | ${markdownCell(manifest.fieldAcceptance.status)} |`,
    `| Base URL | ${markdownCell(manifest.fieldAcceptance.baseUrl || "missing")} |`,
    `| Ready for handover | ${manifest.fieldAcceptance.readyForHandover ? "yes" : "no"} |`,
    `| Requires field review | ${manifest.fieldAcceptance.requiresFieldReview ? "yes" : "no"} |`,
    `| Reviewer | ${markdownCell(manifest.fieldAcceptance.reviewer || "missing")} |`,
    `| Site name | ${markdownCell(manifest.fieldAcceptance.siteName || "missing")} |`,
    `| Latest preflight status | ${markdownCell(manifest.fieldAcceptance.latestPreflightStatus)} |`,
    `| Review steps | ${manifest.fieldAcceptance.reviewStepCount} |`,
    `| Skipped steps | ${manifest.fieldAcceptance.skippedStepCount} |`,
    `| Operator UI walkthrough | ${markdownCell(manifest.fieldAcceptance.operatorUiWalkthroughStatus)} |`,
    `| Operator UI evidence | ${manifest.fieldAcceptance.operatorUiWalkthroughEvidence ? `\`${markdownCell(manifest.fieldAcceptance.operatorUiWalkthroughEvidence)}\`` : "missing"} |`,
    "",
    "## Evidence References",
    "",
    "| Evidence | Path |",
    "| --- | --- |",
    ...Object.entries(manifest.evidenceRefs).map(([key, value]) => `| ${markdownCell(key)} | ${value ? `\`${markdownCell(value)}\`` : "missing"} |`),
    "",
    "## Reference Freshness",
    "",
    "| Reference | Expected Latest | Handover Package Ref | Fresh |",
    "| --- | --- | --- | --- |",
    ...manifest.referenceFreshness.map(
      (item) =>
        `| ${markdownCell(item.key)} | ${item.expected ? `\`${markdownCell(item.expected)}\`` : "missing"} | ${item.actual ? `\`${markdownCell(item.actual)}\`` : "missing"} | ${item.fresh ? "yes" : "no"} |`,
    ),
    "",
    "## Source Revision Freshness",
    "",
    "| Evidence | Path | Branch | Evidence Commit | Final Status Commit | Clean | Fresh |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.sourceRevisionFreshness.length > 0
      ? manifest.sourceRevisionFreshness.map(
          (item) =>
            `| ${markdownCell(item.key)} | ${item.path ? `\`${markdownCell(item.path)}\`` : "missing"} | ${markdownCell(item.branch || "missing")} | ${markdownCell(item.actualCommit)} | ${markdownCell(item.expectedCommit)} | ${item.clean ? "yes" : "no"} | ${item.fresh && item.branchOk ? "yes" : "no"} |`,
        )
      : ["| none | - | - | - | - | - | - |"]),
    "",
    "## Delivery Entrypoint Consistency",
    "",
    "| Evidence | Final Status Base URL | Evidence URL | Match |",
    "| --- | --- | --- | --- |",
    ...(manifest.deliveryEntrypointConsistency.length > 0
      ? manifest.deliveryEntrypointConsistency.map(
          (item) =>
            `| ${markdownCell(item.key)} | ${markdownCell(item.expected)} | ${markdownCell(item.actual)} | ${item.fresh ? "yes" : "no"} |`,
        )
      : ["| none | - | - | - |"]),
    "",
    "## Manual Evidence",
    "",
    "| Type | Status | Path | Validation |",
    "| --- | --- | --- | --- |",
    ...manifest.manualEvidence.map(
      (item) =>
        `| ${markdownCell(item.type)} | ${markdownCell(item.status)} | \`${markdownCell(item.path)}\` | ${markdownCell(item.validationReason || "ok")} |`,
    ),
    "",
    "## Completion Guardrail",
    "",
    "- Do not mark the Codex goal complete unless this report says `READY_TO_CLOSE` and `canMarkGoalComplete=true`.",
    "- Any `FIELD_OR_SECURITY_REVIEW_REQUIRED` report means the goal remains active and the listed gates must be closed first.",
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/final-status");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildFinalStatusReport({
    baseUrl: argValue("base-url", "http://localhost:8080"),
    siteName: argValue("site-name", "unspecified"),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`final status report written to ${path.relative(root, outputDir)}`);
  console.log(`final status: ${manifest.status}`);
  if (manifest.remainingGates.length > 0) {
    console.log(`remaining gate count: ${manifest.remainingGates.length}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFinalStatusReport,
  buildMarkdown,
  buildGitState,
  refsAreFresh,
  sourceGitFreshness,
};
