const fs = require("fs");
const path = require("path");

const {
  readLatestJsonManifest,
  timestampForPath,
} = require("./generate-delivery-evidence");
const {
  manualEvidenceRefs,
  validateManualEvidence,
} = require("./manual-evidence");

const root = path.join(__dirname, "..", "..", "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function latestDeliveryManifest(outputRoot = "artifacts/delivery") {
  return readLatestJsonManifest(outputRoot);
}

function latestFieldReadinessManifest(outputRoot = "artifacts/field-readiness") {
  return readLatestJsonManifest(outputRoot);
}

function addBlocker(blockers, category, message, nextAction = "") {
  blockers.push({ category, message, nextAction });
}

function blockerNextAction(kind) {
  const actions = {
    missingDelivery: "Run npm run delivery:evidence, then rerun npm run completion:audit.",
    deliveryStatus: "Review the latest delivery manifest Handover Summary and rerun npm run handover:package after evidence refresh.",
    failedCommands: "Open the failed command logs in the delivery evidence folder, fix failures, then rerun npm run delivery:evidence.",
    companionReview: "Review companion runtime/security manifests and resolve REVIEW items before rerunning delivery evidence.",
    companionSkipped: "Run runtime/security evidence with the required field switches, including --run-smoke and --require-scanners when applicable.",
    fieldRehearsal: "Run DB, LiDAR, and control-board field rehearsal scripts against the delivery runtime or attach approved unavailable evidence.",
    fieldAcceptance: "Run npm run field:acceptance after preflight, runtime, rehearsal, and security evidence are refreshed.",
    fieldPreflight: "Run npm run field:preflight after .env, cookie, Swagger allowlist, device key, and control-board settings are updated.",
    fieldVerification: "Complete the listed field verification areas and attach PASS manifests to the handover package.",
    readiness: "Run npm run field:readiness after filling required field values and starting the delivery Nginx/API entrypoint.",
    controlBoard: "Set CONTROL_BOARD_HOST/PORT and use LIVE TCP only after hardware approval, then rerun readiness and control-board rehearsal.",
  };
  return actions[kind] || "Refresh the related evidence manifest and rerun npm run completion:audit.";
}

function buildReadinessSignals(fieldReadinessManifest) {
  if (!fieldReadinessManifest) {
    return {
      status: "MISSING",
      reviewCount: 1,
      skippedCount: 0,
      blockerMessages: ["Field readiness manifest is missing. Run npm run field:readiness before completion:audit."],
    };
  }

  const data = fieldReadinessManifest.data || {};
  const status = data.status || "UNKNOWN";
  const reviewCount = normalizeNumber(data.reviewCount);
  const skippedCount = normalizeNumber(data.skippedCount);
  const controlBoardSafetyStatus = data.env?.controlBoardSafetyStatus || "UNKNOWN";
  const blockerMessages = [];

  if (status === "REVIEW" || status === "MISSING" || status === "UNKNOWN") {
    blockerMessages.push(`Field readiness status is ${status}.`);
  }
  if (reviewCount > 0) {
    blockerMessages.push(`${reviewCount} field readiness check(s) require review.`);
  }
  if (skippedCount > 0 || status === "PASS_WITH_SKIPS") {
    blockerMessages.push(`${skippedCount} field readiness scanner/tool check(s) were skipped.`);
  }
  if (controlBoardSafetyStatus !== "LIVE_TCP_READY") {
    blockerMessages.push(`Control-board safety status is ${controlBoardSafetyStatus}.`);
  }

  return {
    status,
    reviewCount,
    skippedCount,
    controlBoardSafetyStatus,
    blockerMessages,
  };
}

function buildRequiredFieldValueSignals(fieldReadinessManifest) {
  const values = fieldReadinessManifest?.data?.env?.requiredFieldValues;
  if (!Array.isArray(values)) return [];
  return values.map((item) => ({
    name: item.name || "unknown",
    state: item.state || "unknown",
    completionGate: item.completionGate || "",
    nextAction: item.nextAction || "",
    redacted: item.redacted !== false,
  }));
}

function buildCompanionEvidenceMetadata(deliveryManifest) {
  const summaries = deliveryManifest?.data?.companionEvidence?.summaries;
  if (!Array.isArray(summaries)) return [];
  return summaries.map((item) => ({
    type: item.type || "unknown",
    manifestPath: item.manifestPath || null,
    outputRoot: item.outputRoot || null,
    reviewCount: normalizeNumber(item.reviewCount),
    skippedCount: normalizeNumber(item.skippedCount),
    metadata: item.metadata || {},
  }));
}

function buildManualEvidenceSignals() {
  return manualEvidenceRefs();
}

function buildCompletionBlockers(deliveryManifest, fieldReadinessManifest, manualEvidenceSignals = []) {
  if (!deliveryManifest) {
    return [{
      category: "automated",
      message: "Delivery evidence manifest is missing. Run npm run delivery:evidence first.",
      nextAction: blockerNextAction("missingDelivery"),
    }];
  }

  const summary = deliveryManifest.data.handoverSummary || {};
  const blockers = [];
  const failedCommandCount = normalizeNumber(summary.failedCommandCount);
  const companionReviewCount = normalizeNumber(summary.companionReviewCount);
  const companionSkippedCount = normalizeNumber(summary.companionSkippedCount);
  const fieldRehearsalReviewCount = normalizeNumber(summary.fieldRehearsalReviewCount);
  const fieldAcceptanceReviewCount = normalizeNumber(summary.fieldAcceptanceReviewCount);
  const fieldAcceptanceSkippedCount = normalizeNumber(summary.fieldAcceptanceSkippedCount);
  const fieldPreflightReviewCount = normalizeNumber(summary.fieldPreflightReviewCount);
  const fieldPreflightSkippedCount = normalizeNumber(summary.fieldPreflightSkippedCount);
  const fieldVerificationRequiredCount = normalizeNumber(summary.fieldVerificationRequiredCount);
  const readinessSignals = buildReadinessSignals(fieldReadinessManifest);
  const operatorUiEvidence = manualEvidenceSignals.find((item) => item.type === "Operator UI Walkthrough");
  const riskAcceptanceEvidence = manualEvidenceSignals.find((item) => item.type === "Field Risk Acceptance");

  if (summary.status !== "AUTOMATED_CHECKS_PASS") {
    addBlocker(blockers, "field", `Delivery handover summary status is ${summary.status || "UNKNOWN"}.`, blockerNextAction("deliveryStatus"));
  }
  if (failedCommandCount > 0) {
    addBlocker(blockers, "automated", `${failedCommandCount} automated delivery command(s) failed.`, blockerNextAction("failedCommands"));
  }
  if (companionReviewCount > 0) {
    addBlocker(blockers, "field", `${companionReviewCount} companion evidence item(s) require review.`, blockerNextAction("companionReview"));
  }
  if (companionSkippedCount > 0) {
    addBlocker(blockers, "field", `${companionSkippedCount} companion evidence item(s) were skipped.`, blockerNextAction("companionSkipped"));
  }
  if (fieldRehearsalReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldRehearsalReviewCount} field rehearsal item(s) require review.`, blockerNextAction("fieldRehearsal"));
  }
  if (fieldAcceptanceReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldAcceptanceReviewCount} field acceptance step(s) require review.`, blockerNextAction("fieldAcceptance"));
  }
  if (fieldAcceptanceSkippedCount > 0) {
    addBlocker(blockers, "field", `${fieldAcceptanceSkippedCount} field acceptance step(s) were skipped.`, blockerNextAction("fieldAcceptance"));
  }
  if (fieldPreflightReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldPreflightReviewCount} field preflight check(s) require review.`, blockerNextAction("fieldPreflight"));
  }
  if (fieldPreflightSkippedCount > 0) {
    addBlocker(blockers, "field", `${fieldPreflightSkippedCount} field preflight check(s) were skipped.`, blockerNextAction("fieldPreflight"));
  }
  if (fieldVerificationRequiredCount > 0) {
    const areas = Array.isArray(summary.fieldVerificationRequiredAreas)
      ? summary.fieldVerificationRequiredAreas.join(", ")
      : "unknown areas";
    addBlocker(
      blockers,
      "field",
      `${fieldVerificationRequiredCount} requirement area(s) still need field verification: ${areas}.`,
      blockerNextAction("fieldVerification"),
    );
  }
  readinessSignals.blockerMessages.forEach((message) => {
    addBlocker(
      blockers,
      "field",
      message,
      message.includes("Control-board safety status") ? blockerNextAction("controlBoard") : blockerNextAction("readiness"),
    );
  });
  if ((fieldAcceptanceReviewCount > 0 || fieldAcceptanceSkippedCount > 0) && operatorUiEvidence?.status !== "PRESENT") {
    addBlocker(
      blockers,
      "field",
      `Operator UI walkthrough evidence is ${operatorUiEvidence?.status || "MISSING"} while field acceptance still has review/skipped items.`,
      "Fill docs/ops/operator-ui-walkthrough-template.md and attach artifacts/manual/operator-ui-walkthrough.md before final field acceptance.",
    );
  }
  if (
    (readinessSignals.reviewCount > 0 ||
      readinessSignals.skippedCount > 0 ||
      companionReviewCount > 0 ||
      companionSkippedCount > 0 ||
      fieldPreflightSkippedCount > 0) &&
    riskAcceptanceEvidence?.status !== "PRESENT"
  ) {
    addBlocker(
      blockers,
      "field",
      `Field risk acceptance evidence is ${riskAcceptanceEvidence?.status || "MISSING"} while readiness, scanner, preflight, or companion evidence has review/skipped items.`,
      "Fill docs/ops/field-risk-acceptance-template.md when risks are accepted, or resolve the underlying review/skipped evidence.",
    );
  }

  return blockers;
}

function buildCompletionAudit(deliveryManifest, fieldReadinessManifest) {
  const summary = deliveryManifest?.data?.handoverSummary || {};
  const readinessSignals = buildReadinessSignals(fieldReadinessManifest);
  const requiredFieldValues = buildRequiredFieldValueSignals(fieldReadinessManifest);
  const companionEvidenceMetadata = buildCompanionEvidenceMetadata(deliveryManifest);
  const manualEvidenceSignals = buildManualEvidenceSignals();
  const completionBlockers = buildCompletionBlockers(deliveryManifest, fieldReadinessManifest, manualEvidenceSignals);
  const automatedBlockers = completionBlockers.filter((item) => item.category === "automated");
  const fieldBlockers = completionBlockers.filter((item) => item.category === "field");
  const failedCommandCount = normalizeNumber(summary.failedCommandCount);
  const automatedReviewSignals = automatedBlockers.length;
  const fieldReviewSignals = [
    normalizeNumber(summary.fieldRehearsalReviewCount),
    normalizeNumber(summary.fieldAcceptanceReviewCount),
    normalizeNumber(summary.fieldAcceptanceSkippedCount),
    normalizeNumber(summary.fieldPreflightReviewCount),
    normalizeNumber(summary.fieldPreflightSkippedCount),
    normalizeNumber(summary.fieldVerificationRequiredCount),
    readinessSignals.reviewCount,
    readinessSignals.skippedCount,
  ].reduce((total, value) => total + value, 0);

  let status = "COMPLETE";
  if (!deliveryManifest || automatedReviewSignals > 0) {
    status = "AUTOMATED_REVIEW_REQUIRED";
  } else if (fieldReviewSignals > 0 || fieldBlockers.length > 0) {
    status = "FIELD_VERIFICATION_REQUIRED";
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceDeliveryManifest: deliveryManifest?.path || null,
    sourceFieldReadinessManifest: fieldReadinessManifest?.path || null,
    status,
    canMarkGoalComplete: status === "COMPLETE",
    completionBlockers,
    automatedBlockers,
    fieldBlockers,
    counts: {
      requirementAreaCount: normalizeNumber(summary.requirementAreaCount),
      automatedEvidenceItemCount: normalizeNumber(summary.automatedEvidenceItemCount),
      failedCommandCount,
      companionReviewCount: normalizeNumber(summary.companionReviewCount),
      companionSkippedCount: normalizeNumber(summary.companionSkippedCount),
      fieldRehearsalReviewCount: normalizeNumber(summary.fieldRehearsalReviewCount),
      fieldAcceptanceReviewCount: normalizeNumber(summary.fieldAcceptanceReviewCount),
      fieldAcceptanceSkippedCount: normalizeNumber(summary.fieldAcceptanceSkippedCount),
      fieldPreflightReviewCount: normalizeNumber(summary.fieldPreflightReviewCount),
      fieldPreflightSkippedCount: normalizeNumber(summary.fieldPreflightSkippedCount),
      fieldVerificationRequiredCount: normalizeNumber(summary.fieldVerificationRequiredCount),
      fieldReadinessReviewCount: readinessSignals.reviewCount,
      fieldReadinessSkippedCount: readinessSignals.skippedCount,
      manualEvidenceMissingCount: manualEvidenceSignals.filter((item) => item.status !== "PRESENT").length,
      automatedBlockerCount: automatedBlockers.length,
      fieldBlockerCount: fieldBlockers.length,
    },
    fieldReadinessStatus: readinessSignals.status,
    controlBoardSafetyStatus: readinessSignals.controlBoardSafetyStatus,
    fieldVerificationRequiredAreas: Array.isArray(summary.fieldVerificationRequiredAreas)
      ? summary.fieldVerificationRequiredAreas
      : [],
    requiredFieldValues,
    companionEvidenceMetadata,
    manualEvidenceSignals,
    handoverSummaryStatus: summary.status || null,
    decisionRule:
      "canMarkGoalComplete is true only when automated delivery checks pass and no field readiness, companion, acceptance, preflight, skipped, manual evidence, or required verification item remains.",
  };
}

function buildMarkdown(manifest) {
  const formatMetadata = (metadata) =>
    Object.entries(metadata || {})
      .map(([key, value]) => `${key}=${typeof value === "object" && value !== null ? JSON.stringify(value) : value}`)
      .join("<br>") || "none";

  return [
    "# Completion Audit",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Source delivery manifest: ${manifest.sourceDeliveryManifest || "missing"}`,
    `- Source field readiness manifest: ${manifest.sourceFieldReadinessManifest || "missing"}`,
    `- Delivery handover status: ${manifest.handoverSummaryStatus || "missing"}`,
    `- Field readiness status: ${manifest.fieldReadinessStatus || "missing"}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus || "missing"}`,
    "",
    "## Counts",
    "",
    `- Requirement areas: ${manifest.counts.requirementAreaCount}`,
    `- Automated evidence items: ${manifest.counts.automatedEvidenceItemCount}`,
    `- Failed automated commands: ${manifest.counts.failedCommandCount}`,
    `- Automated blockers: ${manifest.counts.automatedBlockerCount}`,
    `- Field blockers: ${manifest.counts.fieldBlockerCount}`,
    `- Companion review items: ${manifest.counts.companionReviewCount}`,
    `- Companion skipped items: ${manifest.counts.companionSkippedCount}`,
    `- Field rehearsal review items: ${manifest.counts.fieldRehearsalReviewCount}`,
    `- Field acceptance review items: ${manifest.counts.fieldAcceptanceReviewCount}`,
    `- Field acceptance skipped items: ${manifest.counts.fieldAcceptanceSkippedCount}`,
    `- Field preflight review items: ${manifest.counts.fieldPreflightReviewCount}`,
    `- Field preflight skipped items: ${manifest.counts.fieldPreflightSkippedCount}`,
    `- Field readiness review items: ${manifest.counts.fieldReadinessReviewCount}`,
    `- Field readiness skipped items: ${manifest.counts.fieldReadinessSkippedCount}`,
    `- Manual evidence missing: ${manifest.counts.manualEvidenceMissingCount}`,
    `- Field verification required areas: ${manifest.counts.fieldVerificationRequiredCount}`,
    "",
    "## Field Verification Required",
    "",
    ...(manifest.fieldVerificationRequiredAreas.length > 0
      ? manifest.fieldVerificationRequiredAreas.map((area) => `- ${area}`)
      : ["- none"]),
    "",
    "## Required Field Values",
    "",
    "| Name | State | Completion Gate | Next Action | Redacted |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.requiredFieldValues.length > 0
      ? manifest.requiredFieldValues.map((item) => `| ${item.name} | ${item.state} | ${item.completionGate || ""} | ${item.nextAction || ""} | ${item.redacted} |`)
      : ["| none | n/a | n/a | n/a | true |"]),
    "",
    "## Companion Evidence Metadata",
    "",
    "| Type | Manifest | Review | Skipped | Metadata |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.companionEvidenceMetadata.length > 0
      ? manifest.companionEvidenceMetadata.map((item) => `| ${item.type} | ${item.manifestPath || "missing"} | ${item.reviewCount} | ${item.skippedCount} | ${formatMetadata(item.metadata)} |`)
      : ["| none | missing | 0 | 0 | none |"]),
    "",
    "## Manual Evidence",
    "",
    "| Type | Status | Path | Template | Required When |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.manualEvidenceSignals.map((item) => `| ${item.type} | ${item.status} | ${item.path} | ${item.template} | ${item.requiredWhen}${item.validationReason ? ` (${item.validationReason})` : ""} |`),
    "",
    "## Completion Blockers",
    "",
    ...(manifest.completionBlockers.length > 0
      ? [
          "| Category | Message | Next Action |",
          "| --- | --- | --- |",
          ...manifest.completionBlockers.map((item) => `| ${item.category} | ${item.message} | ${item.nextAction || ""} |`),
        ]
      : ["- none"]),
    "",
    "## Decision Rule",
    "",
    manifest.decisionRule,
    "",
  ].join("\n");
}

function main() {
  const outputRootArg = process.argv.find((arg) => arg.startsWith("--output-root="));
  const deliveryRootArg = process.argv.find((arg) => arg.startsWith("--delivery-root="));
  const fieldReadinessRootArg = process.argv.find((arg) => arg.startsWith("--field-readiness-root="));
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/completion-audit";
  const deliveryRoot = deliveryRootArg ? deliveryRootArg.slice("--delivery-root=".length) : "artifacts/delivery";
  const fieldReadinessRoot = fieldReadinessRootArg ? fieldReadinessRootArg.slice("--field-readiness-root=".length) : "artifacts/field-readiness";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const manifest = buildCompletionAudit(latestDeliveryManifest(deliveryRoot), latestFieldReadinessManifest(fieldReadinessRoot));
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));

  console.log(`completion audit written to ${path.relative(root, outputDir)}`);
  console.log(`completion audit status: ${manifest.status}`);
  if (!manifest.canMarkGoalComplete) {
    console.log("completion audit result: goal remains active");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCompletionAudit,
  buildCompletionBlockers,
  buildManualEvidenceSignals,
  validateManualEvidence,
  buildReadinessSignals,
  buildRequiredFieldValueSignals,
};
