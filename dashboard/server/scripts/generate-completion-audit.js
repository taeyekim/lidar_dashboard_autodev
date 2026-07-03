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

function latestManualEvidenceReadinessManifest(outputRoot = "artifacts/manual-evidence-readiness") {
  return readLatestJsonManifest(outputRoot);
}

function latestFieldActionArtifacts() {
  return {
    fieldRiskRegister: readLatestJsonManifest("artifacts/field-risk-register"),
    fieldActionBoard: readLatestJsonManifest("artifacts/field-action-board"),
    fieldGateClosureMap: readLatestJsonManifest("artifacts/field-gate-closure-map"),
    fieldOwnerBriefs: readLatestJsonManifest("artifacts/field-owner-briefs"),
  };
}

function addBlocker(blockers, category, message, nextAction = "") {
  blockers.push({ category, message, nextAction });
}

function blockerNextAction(kind) {
  const actions = {
    missingDelivery: "Run npm run delivery:evidence, then rerun npm run completion:audit.",
    deliveryStatus: "Review the latest delivery manifest Handover Summary and rerun npm run handover:package -- --generated-by=<field-reviewer> --site-name=<delivery-site> after evidence refresh.",
    failedCommands: "Open the failed command logs in the delivery evidence folder, fix failures, then rerun npm run delivery:evidence.",
    companionReview: "Review companion runtime/security manifests and resolve REVIEW items before rerunning delivery evidence.",
    companionSkipped: "Run runtime/security evidence with the required field switches, including --run-smoke and --require-scanners when applicable.",
    fieldRehearsal: "Run DB, LiDAR, and control-board field rehearsal scripts against the delivery runtime or attach approved unavailable evidence.",
    fieldAcceptance: "Run npm run field:acceptance after preflight, runtime, rehearsal, and security evidence are refreshed.",
    fieldPreflight: "Run npm run field:preflight after .env, cookie, Swagger allowlist, device key, and control-board settings are updated.",
    fieldVerification: "Complete the listed field verification areas and attach PASS manifests to the handover package.",
    fieldActionArtifacts: "Close field risk/action/gate/owner items, refresh field:risk-register, field:action-board, field:gate-closure-map, and field:owner-briefs, then rerun npm run completion:audit.",
    readiness: "Run npm run field:readiness -- --base-url=<delivery-url> --generated-by=<field-reviewer> --site-name=<delivery-site> after filling required field values and starting the delivery Nginx/API entrypoint.",
    controlBoard: "Set CONTROL_BOARD_HOST/PORT and use LIVE TCP only after hardware approval, then rerun readiness and control-board rehearsal.",
    manualReadiness: "Run npm run manual:evidence-readiness -- --generated-by=<field-reviewer> --site-name=<delivery-site> after filling required manual evidence, then rerun npm run completion:audit.",
  };
  return actions[kind] || "Refresh the related evidence manifest and rerun npm run completion:audit.";
}

function buildReadinessSignals(fieldReadinessManifest) {
  if (!fieldReadinessManifest) {
    return {
      status: "MISSING",
      reviewCount: 1,
      skippedCount: 0,
      blockerMessages: ["Field readiness manifest is missing. Run npm run field:readiness -- --base-url=<delivery-url> --generated-by=<field-reviewer> --site-name=<delivery-site> before completion:audit."],
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

function buildFieldRehearsalFollowUps(deliveryManifest) {
  const summaries = deliveryManifest?.data?.fieldRehearsalEvidence?.summaries;
  if (!Array.isArray(summaries)) return [];
  return summaries
    .map((item) => {
      const acceptance = item.metadata?.unavailableAcceptance;
      if (!acceptance) return null;
      return {
        type: item.type || "unknown",
        evidenceType: item.metadata?.evidenceType || "UNKNOWN",
        manifestPath: item.manifestPath || null,
        replacementOwner: acceptance.replacementOwner || "unknown",
        targetRecheckDate: acceptance.targetRecheckDate || "unknown",
        ownerStatus: acceptance.ownerStatus || "unknown",
        recheckStatus: acceptance.recheckStatus || "unknown",
        reason: acceptance.reason || "unknown",
      };
    })
    .filter(Boolean);
}

function buildManualEvidenceSignals() {
  return manualEvidenceRefs();
}

function buildFieldActionArtifactSignals(fieldActionArtifacts = {}) {
  const definitions = [
    ["fieldRiskRegister", "Field risk register", "NO_OPEN_RISKS", "openRiskCount", "open risk item(s)"],
    ["fieldActionBoard", "Field action board", "READY_TO_CLOSE", "openActionCount", "open action item(s)"],
    ["fieldGateClosureMap", "Field gate closure map", "READY_TO_CLOSE", "openGateCount", "open gate(s)"],
    ["fieldOwnerBriefs", "Field owner briefs", "READY_TO_CLOSE", "openItemCount", "open owner item(s)"],
  ];

  return definitions.map(([key, label, readyStatus, countKey, itemLabel]) => {
    const manifest = fieldActionArtifacts[key] || null;
    const data = manifest?.data || {};
    const status = manifest ? data.status || "UNKNOWN" : "MISSING";
    const openCount = manifest ? normalizeNumber(data[countKey]) : 1;
    return {
      key,
      label,
      readyStatus,
      countKey,
      itemLabel,
      path: manifest?.path || null,
      status,
      openCount,
      ready: Boolean(manifest && status === readyStatus && openCount === 0),
    };
  });
}

function buildCompletionBlockers(
  deliveryManifest,
  fieldReadinessManifest,
  manualEvidenceReadinessManifest,
  manualEvidenceSignals = [],
  fieldActionArtifactSignals = [],
) {
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
  const openRequiredManualEvidence = manualEvidenceSignals.filter((item) => item.required && item.status !== "PRESENT");
  const manualReadiness = manualEvidenceReadinessManifest?.data || null;

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
  openRequiredManualEvidence.forEach((item) => {
    addBlocker(
      blockers,
      "field",
      `Required manual evidence ${item.type} is ${item.status}.`,
      item.nextAction || "Attach accepted manual evidence before completion:audit can be COMPLETE.",
    );
  });
  if (!manualReadiness) {
    addBlocker(
      blockers,
      "field",
      "Manual evidence readiness manifest is missing.",
      blockerNextAction("manualReadiness"),
    );
  } else if (manualReadiness.readyForFinalClose !== true) {
    addBlocker(
      blockers,
      "field",
      `Manual evidence readiness is ${manualReadiness.status || "REVIEW"} with missing=${manualReadiness.missingCount ?? "unknown"} invalid=${manualReadiness.invalidCount ?? "unknown"}.`,
      blockerNextAction("manualReadiness"),
    );
  }
  fieldActionArtifactSignals
    .filter((item) => !item.ready)
    .forEach((item) => {
      const message = item.status === "MISSING"
        ? `${item.label} manifest is missing.`
        : `${item.label} status is ${item.status} with ${item.openCount} ${item.itemLabel}.`;
      addBlocker(blockers, "field", message, blockerNextAction("fieldActionArtifacts"));
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

function buildCompletionAudit(
  deliveryManifest,
  fieldReadinessManifest,
  manualEvidenceReadinessManifest,
  fieldActionArtifacts = latestFieldActionArtifacts(),
) {
  const summary = deliveryManifest?.data?.handoverSummary || {};
  const readinessSignals = buildReadinessSignals(fieldReadinessManifest);
  const requiredFieldValues = buildRequiredFieldValueSignals(fieldReadinessManifest);
  const companionEvidenceMetadata = buildCompanionEvidenceMetadata(deliveryManifest);
  const fieldRehearsalFollowUps = buildFieldRehearsalFollowUps(deliveryManifest);
  const manualEvidenceSignals = buildManualEvidenceSignals();
  const fieldActionArtifactSignals = buildFieldActionArtifactSignals(fieldActionArtifacts);
  const openManualEvidenceSignals = manualEvidenceSignals.filter((item) => item.required && item.status !== "PRESENT");
  const manualEvidenceReadiness = manualEvidenceReadinessManifest?.data || {};
  const completionBlockers = buildCompletionBlockers(
    deliveryManifest,
    fieldReadinessManifest,
    manualEvidenceReadinessManifest,
    manualEvidenceSignals,
    fieldActionArtifactSignals,
  );
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
    fieldActionArtifactSignals.filter((item) => !item.ready).length,
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
    sourceManualEvidenceReadinessManifest: manualEvidenceReadinessManifest?.path || null,
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
      manualEvidenceOpenCount: openManualEvidenceSignals.length,
      manualEvidenceMissingCount: openManualEvidenceSignals.filter((item) => item.status === "MISSING").length,
      manualEvidenceInvalidCount: openManualEvidenceSignals.filter((item) => item.status === "INVALID").length,
      manualEvidenceReadinessMissingCount: manualEvidenceReadinessManifest ? 0 : 1,
      manualEvidenceReadinessInvalidCount: manualEvidenceReadiness.invalidCount ?? 0,
      fieldActionArtifactOpenCount: fieldActionArtifactSignals.filter((item) => !item.ready).length,
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
    fieldRehearsalFollowUps,
    manualEvidenceSignals,
    fieldActionArtifactSignals,
    manualEvidenceReadiness: {
      status: manualEvidenceReadiness.status || "MISSING",
      readyForFinalClose: manualEvidenceReadiness.readyForFinalClose === true,
      missingCount: manualEvidenceReadiness.missingCount ?? null,
      invalidCount: manualEvidenceReadiness.invalidCount ?? null,
    },
    handoverSummaryStatus: summary.status || null,
    decisionRule:
      "canMarkGoalComplete is true only when automated delivery checks pass and no field readiness, companion, acceptance, preflight, skipped, manual evidence, field action artifact, or required verification item remains.",
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
    `- Source manual evidence readiness manifest: ${manifest.sourceManualEvidenceReadinessManifest || "missing"}`,
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
    `- Manual evidence open: ${manifest.counts.manualEvidenceOpenCount}`,
    `- Manual evidence missing: ${manifest.counts.manualEvidenceMissingCount}`,
    `- Manual evidence invalid: ${manifest.counts.manualEvidenceInvalidCount}`,
    `- Manual evidence readiness missing: ${manifest.counts.manualEvidenceReadinessMissingCount}`,
    `- Manual evidence readiness invalid: ${manifest.counts.manualEvidenceReadinessInvalidCount}`,
    `- Field action artifact open: ${manifest.counts.fieldActionArtifactOpenCount}`,
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
    "## Field Rehearsal Follow-ups",
    "",
    "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Manifest |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldRehearsalFollowUps.length > 0
      ? manifest.fieldRehearsalFollowUps.map(
          (item) =>
            `| ${item.type} | ${item.evidenceType} | ${item.replacementOwner} | ${item.targetRecheckDate} | ${item.ownerStatus} | ${item.recheckStatus} | ${item.reason} | ${item.manifestPath || "missing"} |`,
        )
      : ["| none | - | - | - | - | - | - | - |"]),
    "",
    "## Manual Evidence",
    "",
    "| Type | Status | Path | Template | Required When |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.manualEvidenceSignals.map((item) => `| ${item.type} | ${item.status} | ${item.path} | ${item.template} | ${item.requiredWhen}${item.validationReason ? ` (${item.validationReason})` : ""} |`),
    "",
    "## Field Action Artifacts",
    "",
    "| Artifact | Status | Open Count | Ready | Path |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.fieldActionArtifactSignals.map((item) => `| ${item.label} | ${item.status} | ${item.openCount} | ${item.ready} | ${item.path || "missing"} |`),
    "",
    "## Manual Evidence Readiness",
    "",
    `- Status: ${manifest.manualEvidenceReadiness.status}`,
    `- Ready for final close: ${manifest.manualEvidenceReadiness.readyForFinalClose}`,
    `- Missing count: ${manifest.manualEvidenceReadiness.missingCount}`,
    `- Invalid count: ${manifest.manualEvidenceReadiness.invalidCount}`,
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
  const manualReadinessRootArg = process.argv.find((arg) => arg.startsWith("--manual-readiness-root="));
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/completion-audit";
  const deliveryRoot = deliveryRootArg ? deliveryRootArg.slice("--delivery-root=".length) : "artifacts/delivery";
  const fieldReadinessRoot = fieldReadinessRootArg ? fieldReadinessRootArg.slice("--field-readiness-root=".length) : "artifacts/field-readiness";
  const manualReadinessRoot = manualReadinessRootArg ? manualReadinessRootArg.slice("--manual-readiness-root=".length) : "artifacts/manual-evidence-readiness";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const manifest = buildCompletionAudit(
    latestDeliveryManifest(deliveryRoot),
    latestFieldReadinessManifest(fieldReadinessRoot),
    latestManualEvidenceReadinessManifest(manualReadinessRoot),
  );
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
  buildFieldActionArtifactSignals,
  buildManualEvidenceSignals,
  validateManualEvidence,
  buildReadinessSignals,
  buildRequiredFieldValueSignals,
  latestManualEvidenceReadinessManifest,
};
