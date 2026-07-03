const fs = require("fs");
const path = require("path");

const {
  readLatestJsonManifest,
  timestampForPath,
} = require("./generate-delivery-evidence");

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

function addBlocker(blockers, category, message) {
  blockers.push({ category, message });
}

function buildCompletionBlockers(deliveryManifest) {
  if (!deliveryManifest) {
    return [{
      category: "automated",
      message: "Delivery evidence manifest is missing. Run npm run delivery:evidence first.",
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

  if (summary.status !== "AUTOMATED_CHECKS_PASS") {
    addBlocker(blockers, "field", `Delivery handover summary status is ${summary.status || "UNKNOWN"}.`);
  }
  if (failedCommandCount > 0) {
    addBlocker(blockers, "automated", `${failedCommandCount} automated delivery command(s) failed.`);
  }
  if (companionReviewCount > 0) {
    addBlocker(blockers, "field", `${companionReviewCount} companion evidence item(s) require review.`);
  }
  if (companionSkippedCount > 0) {
    addBlocker(blockers, "field", `${companionSkippedCount} companion evidence item(s) were skipped.`);
  }
  if (fieldRehearsalReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldRehearsalReviewCount} field rehearsal item(s) require review.`);
  }
  if (fieldAcceptanceReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldAcceptanceReviewCount} field acceptance step(s) require review.`);
  }
  if (fieldAcceptanceSkippedCount > 0) {
    addBlocker(blockers, "field", `${fieldAcceptanceSkippedCount} field acceptance step(s) were skipped.`);
  }
  if (fieldPreflightReviewCount > 0) {
    addBlocker(blockers, "field", `${fieldPreflightReviewCount} field preflight check(s) require review.`);
  }
  if (fieldPreflightSkippedCount > 0) {
    addBlocker(blockers, "field", `${fieldPreflightSkippedCount} field preflight check(s) were skipped.`);
  }
  if (fieldVerificationRequiredCount > 0) {
    const areas = Array.isArray(summary.fieldVerificationRequiredAreas)
      ? summary.fieldVerificationRequiredAreas.join(", ")
      : "unknown areas";
    addBlocker(
      blockers,
      "field",
      `${fieldVerificationRequiredCount} requirement area(s) still need field verification: ${areas}.`,
    );
  }

  return blockers;
}

function buildCompletionAudit(deliveryManifest) {
  const summary = deliveryManifest?.data?.handoverSummary || {};
  const completionBlockers = buildCompletionBlockers(deliveryManifest);
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
      automatedBlockerCount: automatedBlockers.length,
      fieldBlockerCount: fieldBlockers.length,
    },
    fieldVerificationRequiredAreas: Array.isArray(summary.fieldVerificationRequiredAreas)
      ? summary.fieldVerificationRequiredAreas
      : [],
    handoverSummaryStatus: summary.status || null,
    decisionRule:
      "canMarkGoalComplete is true only when automated delivery checks pass and no field, companion, acceptance, preflight, skipped, or required verification item remains.",
  };
}

function buildMarkdown(manifest) {
  return [
    "# Completion Audit",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Source delivery manifest: ${manifest.sourceDeliveryManifest || "missing"}`,
    `- Delivery handover status: ${manifest.handoverSummaryStatus || "missing"}`,
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
    `- Field verification required areas: ${manifest.counts.fieldVerificationRequiredCount}`,
    "",
    "## Field Verification Required",
    "",
    ...(manifest.fieldVerificationRequiredAreas.length > 0
      ? manifest.fieldVerificationRequiredAreas.map((area) => `- ${area}`)
      : ["- none"]),
    "",
    "## Completion Blockers",
    "",
    ...(manifest.completionBlockers.length > 0
      ? manifest.completionBlockers.map((item) => `- [${item.category}] ${item.message}`)
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
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/completion-audit";
  const deliveryRoot = deliveryRootArg ? deliveryRootArg.slice("--delivery-root=".length) : "artifacts/delivery";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const manifest = buildCompletionAudit(latestDeliveryManifest(deliveryRoot));
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
};
