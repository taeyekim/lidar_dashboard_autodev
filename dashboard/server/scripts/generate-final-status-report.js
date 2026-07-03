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
  };
}

function evidencePath(item) {
  return item?.path || null;
}

function addGate(gates, category, status, message, closeWhen, evidence) {
  gates.push({ category, status, message, closeWhen, evidence: evidence || null });
}

function buildSecuritySummary(security) {
  const data = security?.data || {};
  return {
    path: evidencePath(security),
    exists: Boolean(security),
    requireScanners: data.options?.requireScanners === true,
    strictAcceptanceBlocked: data.strictAcceptanceBlocked === true,
    dispositionSummary: data.dispositionSummary || null,
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
    securityEvidence: evidencePath(evidenceRefs.securityEvidence),
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

function buildFinalStatusReport(input = {}) {
  const evidenceRefs = input.evidenceRefs || latestEvidenceRefs();
  const manualEvidence = input.manualEvidence || manualEvidenceRefs();
  const gates = [];
  const completion = evidenceRefs.completionAudit;
  const readiness = evidenceRefs.fieldReadiness;
  const security = evidenceRefs.securityEvidence;
  const handoverPackage = evidenceRefs.handoverPackage;
  const completionData = completion?.data || {};
  const readinessData = readiness?.data || {};
  const packageData = handoverPackage?.data || {};
  const securitySummary = buildSecuritySummary(security);
  const manualEvidenceSummary = buildManualEvidenceSummary(manualEvidence);
  const referenceFreshness = refsAreFresh(handoverPackage, evidenceRefs);

  if (!completion) {
    addGate(gates, "Completion Audit", "MISSING", "Latest completion audit manifest is missing.", "Run npm.cmd run completion:audit.", null);
  } else {
    if (completionData.status !== "COMPLETE" || completionData.canMarkGoalComplete !== true) {
      const blockers = Array.isArray(completionData.completionBlockers)
        ? completionData.completionBlockers.join("; ")
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

  if (!security) {
    addGate(gates, "Security Evidence", "MISSING", "Latest security evidence manifest is missing.", "Run npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=<delivery-url>.", null);
  } else {
    if (!securitySummary.requireScanners) {
      addGate(gates, "Security Evidence", "REVIEW", "Security evidence was not generated with requireScanners=true.", "Rerun security:evidence with --require-scanners or attach accepted field-risk evidence.", evidencePath(security));
    }
    if (securitySummary.strictAcceptanceBlocked) {
      addGate(gates, "Security Evidence", "BLOCKED", "Required scanner security evidence is strictAcceptanceBlocked.", "Resolve scanner failures/skips or attach accepted field-risk evidence.", evidencePath(security));
    }
  }

  manualEvidenceSummary
    .filter((item) => item.required && item.status !== "PRESENT")
    .forEach((item) => {
      addGate(gates, "Manual Evidence", item.status, `${item.type} evidence is ${item.status}. ${item.validationReason}`.trim(), item.doneWhen, item.path);
    });

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

  const status = gates.length === 0 ? "READY_TO_CLOSE" : "FIELD_OR_SECURITY_REVIEW_REQUIRED";

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: input.siteName || "unspecified",
    hostName: input.hostName || os.hostname(),
    baseUrl: input.baseUrl || "http://localhost:8080",
    git: input.git || {
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: gitValue(["rev-parse", "HEAD"]),
      clean: gitValue(["status", "--short"]) === "",
    },
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
    securityEvidence: securitySummary,
    handoverPackage: {
      path: evidencePath(handoverPackage),
      status: packageData.status || "MISSING",
      canMarkGoalComplete: packageData.canMarkGoalComplete === true,
      residualFieldGateCount: Array.isArray(packageData.residualFieldGates) ? packageData.residualFieldGates.length : null,
      strictFailureReasons: packageData.strictFailureReasons || [],
    },
    evidenceRefs: Object.fromEntries(Object.entries(evidenceRefs).map(([key, value]) => [key, evidencePath(value)])),
    referenceFreshness,
    manualEvidence: manualEvidenceSummary,
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
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Completion Summary",
    "",
    `- Completion audit: ${manifest.completionAudit.status} (${manifest.completionAudit.path || "missing"})`,
    `- Field readiness: ${manifest.fieldReadiness.status} (${manifest.fieldReadiness.path || "missing"})`,
    `- Control-board safety: ${manifest.fieldReadiness.controlBoardSafetyStatus}`,
    `- Security evidence: ${manifest.securityEvidence.exists ? "present" : "missing"} (${manifest.securityEvidence.path || "missing"})`,
    `- Handover package: ${manifest.handoverPackage.status} (${manifest.handoverPackage.path || "missing"})`,
    "",
    "## Remaining Gates",
    "",
    "| Category | Status | Message | Close When | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.remainingGates.length > 0
      ? manifest.remainingGates.map(
          (item) =>
            `| ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} |`,
        )
      : ["| none | PASS | No remaining final gates. | - | - |"]),
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
  refsAreFresh,
};
