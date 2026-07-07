const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  readLatestJsonManifest,
  timestampForPath,
} = require("./generate-delivery-evidence");
const { isPlaceholderFieldText } = require("./generate-final-status-report");
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

function manifestStatus(entry, manifest) {
  if (!manifest) return "MISSING";
  if (entry.stale) return "STALE";
  const data = manifest.data || {};
  if (data.status) return data.status;
  if (data.handoverSummary?.status) return data.handoverSummary.status;
  if (entry.area === "Security Evidence") {
    if (data.options?.requireScanners !== true) return "REVIEW";
    if (data.strictAcceptanceBlocked === true) return "REVIEW";
  }
  if (data.canMarkGoalComplete === false) return "REVIEW";
  if (data.results?.some((item) => item.status && item.status !== "PASS")) return "REVIEW";
  if (data.checks?.some((item) => item.status === "skipped" || item.exitCode !== 0)) return "REVIEW";
  if (entry.required && !manifest.path) return "MISSING";
  return "PRESENT";
}

function metadataReviewItems(generatedBy, siteName) {
  return [
    isPlaceholderFieldText(generatedBy) ? "Generated-by reviewer metadata is missing or placeholder." : "",
    isPlaceholderFieldText(siteName) ? "Site name metadata is missing or placeholder." : "",
  ].filter(Boolean);
}

function indexEntry(entry) {
  const manifest = readLatestJsonManifest(entry.outputRoot);
  const data = manifest?.data || {};
  return {
    area: entry.area,
    required: entry.required,
    outputRoot: entry.outputRoot,
    command: entry.command,
    manifestPath: manifest?.path || null,
    status: manifestStatus(entry, manifest),
    generatedAt: manifest?.data?.generatedAt || null,
    attach: Boolean(manifest?.path),
    notes: entry.notes,
    sourceDeliveryManifest: data.sourceDeliveryManifest || null,
    sourceCompletionAudit: data.sourceCompletionAudit || null,
    sourceFieldReadinessManifest: data.sourceFieldReadinessManifest || null,
    sourceManualEvidenceReadinessManifest: data.sourceManualEvidenceReadinessManifest || null,
    controlBoardSafetyStatus: data.env?.controlBoardSafetyStatus || data.controlBoardSafetyStatus || null,
  };
}

function manualEvidenceEntries() {
  return manualEvidenceRefs().map((entry) => ({
    area: entry.area,
    path: entry.path,
    template: entry.template,
    required: entry.required,
    notes: entry.notes,
    status: entry.status,
    validationReason: entry.validationReason,
  }));
}

function fieldRehearsalFollowUpEntries(completionManifest, fieldClosurePlanEntry) {
  const followUps = completionManifest?.data?.fieldRehearsalFollowUps;
  if (!Array.isArray(followUps)) return [];
  return followUps.map((item) => ({
    type: item.type || "unknown",
    evidenceType: item.evidenceType || "UNKNOWN",
    owner: item.replacementOwner || "unknown",
    targetRecheckDate: item.targetRecheckDate || "unknown",
    ownerStatus: item.ownerStatus || "unknown",
    recheckStatus: item.recheckStatus || "unknown",
    reason: item.reason || "unknown",
    manifestPath: item.manifestPath || null,
    closurePlanManifest: fieldClosurePlanEntry?.manifestPath || null,
  }));
}

function fieldActionArtifactEntries(completionManifest, fieldClosurePlanEntry) {
  const artifacts = completionManifest?.data?.fieldActionArtifactSignals;
  if (!Array.isArray(artifacts)) return [];
  return artifacts.map((item) => ({
    artifact: item.label || item.key || "unknown",
    status: item.status || "UNKNOWN",
    openCount: Number.isFinite(Number(item.openCount)) ? Number(item.openCount) : 0,
    ready: item.ready === true,
    manifestPath: item.path || null,
    closurePlanManifest: fieldClosurePlanEntry?.manifestPath || null,
  }));
}

function buildIndexManifest(options = {}) {
  const entries = [
    {
      area: "Delivery Evidence",
      required: true,
      outputRoot: "artifacts/delivery",
      command: "npm run delivery:evidence",
      notes: "Automated command logs, runtime/security companion summaries, requirement coverage, and field evidence summary.",
    },
    {
      area: "Completion Audit",
      required: true,
      outputRoot: "artifacts/completion-audit",
      command: "npm run completion:audit",
      notes: "Final canMarkGoalComplete decision gate. Keep false until every field/review/skipped item is closed.",
    },
    {
      area: "Field Preflight",
      required: true,
      outputRoot: "artifacts/field-preflight",
      command: "npm run field:preflight",
      notes: "Environment, JWT, device key, control-board TCP, cookie, and Swagger allowlist readiness.",
    },
    {
      area: "Field Acceptance",
      required: true,
      outputRoot: "artifacts/field-acceptance",
      command: "npm run field:acceptance",
      notes: "Ordered acceptance orchestrator manifest with reviewer, site, PASS/REVIEW/SKIPPED counts, and next actions.",
    },
    {
      area: "Field Readiness",
      required: true,
      outputRoot: "artifacts/field-readiness",
      command: 'npm run field:readiness -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Pre-delivery readiness report for .env posture, Docker daemon, Nginx/API health, control-board TCP live values, Swagger allowlist, and optional scanner availability.",
    },
    {
      area: "Manual Evidence Readiness",
      required: true,
      outputRoot: "artifacts/manual-evidence-readiness",
      command: 'npm run manual:evidence-readiness -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Preparation checklist for required reviewer-filled manual evidence files and validation failures.",
    },
    {
      area: "Manual Evidence Drafts",
      required: true,
      outputRoot: "artifacts/manual-evidence-drafts",
      command: 'npm run manual:evidence-drafts -- --base-url=<delivery-url> --site-name="$env:FIELD_SITE_NAME" --reviewer="$env:FIELD_REVIEWER"',
      notes: "Reviewer-fillable draft files for required manual evidence; existing evidence is preserved unless --force is used.",
    },
    {
      area: "Field Risk Register",
      required: true,
      outputRoot: "artifacts/field-risk-register",
      command: 'npm run field:risk-register -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Reviewer-preparation register that maps open field, security, and manual gates into risk acceptance draft rows.",
    },
    {
      area: "Field Action Board",
      required: true,
      outputRoot: "artifacts/field-action-board",
      command: 'npm run field:action-board -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Owner-prioritized execution board that maps final-status gates to field commands, evidence paths, and close criteria.",
    },
    {
      area: "Field Gate Closure Map",
      required: true,
      outputRoot: "artifacts/field-gate-closure-map",
      command: 'npm run field:gate-closure-map -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Command-centered closure map showing which final-status gates each field command is expected to close.",
    },
    {
      area: "Field Owner Briefs",
      required: true,
      outputRoot: "artifacts/field-owner-briefs",
      command: 'npm run field:owner-briefs -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Per-owner field execution briefs generated from the latest action board for handoff to field owners.",
    },
    {
      area: "Field Closeout Quickstart",
      required: true,
      outputRoot: "artifacts/field-closeout-quickstart",
      command: 'npm run field:closeout-quickstart -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "One-page field queue listing env keys, evidence files, runtime prerequisites, owner queue, phase queue, and command queue.",
    },
    {
      area: "Field Requirements Backlog",
      required: true,
      outputRoot: "artifacts/field-requirements-backlog",
      command: 'npm run field:requirements-backlog -- --base-url=<delivery-url> --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Batched unresolved field questions and decisions for PM, hardware, security, operations, and CI closeout.",
    },
    {
      area: "Field Closure Plan",
      required: true,
      outputRoot: "artifacts/field-closure-plan",
      command: 'npm run field:closure-plan -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"',
      notes: "Ordered closure actions, completion blockers, required field value states, and final refresh commands.",
    },
    {
      area: "DB And Prisma Field Rehearsal",
      required: true,
      outputRoot: "artifacts/field-db-rehearsal",
      command: "scripts/db-field-rehearsal.ps1",
      notes: "Use PASS rehearsal manifest for field DB evidence, or FIELD_REHEARSAL_UNAVAILABLE REVIEW manifest when runtime is unavailable.",
    },
    {
      area: "Lidar Ingest Field Rehearsal",
      required: true,
      outputRoot: "artifacts/field-lidar-rehearsal",
      command: "scripts/lidar-ingest-rehearsal.ps1",
      notes: "Representative normal-driving, wrong-way, duplicate, and situation-ended payload evidence.",
    },
    {
      area: "Control Board Field Rehearsal",
      required: true,
      outputRoot: "artifacts/field-control-board-rehearsal",
      command: "scripts/control-board-field-rehearsal.ps1",
      notes: "DRY_RUN command lifecycle evidence or approved LIVE_TCP field rehearsal.",
    },
    {
      area: "Runtime Evidence",
      required: true,
      outputRoot: "artifacts/runtime",
      command: "npm run runtime:evidence",
      notes: "Docker/compose/.env/runtime smoke evidence. Latest delivery evidence also embeds companion runtime evidence.",
    },
    {
      area: "Security Evidence",
      required: true,
      outputRoot: "artifacts/security",
      command: "npm run security:evidence",
      notes: "Dependency audit policy, optional scanners, skipped scanner reasons, and raw logs.",
    },
  ].map(indexEntry);

  const deliveryEntry = entries.find((entry) => entry.area === "Delivery Evidence");
  const completionEntry = entries.find((entry) => entry.area === "Completion Audit");
  const fieldReadinessEntry = entries.find((entry) => entry.area === "Field Readiness");
  const manualReadinessEntry = entries.find((entry) => entry.area === "Manual Evidence Readiness");
  const fieldClosurePlanEntry = entries.find((entry) => entry.area === "Field Closure Plan");
  const consistencyIssues = [];

  if (deliveryEntry?.manifestPath && completionEntry?.manifestPath) {
    if (completionEntry.sourceDeliveryManifest !== deliveryEntry.manifestPath) {
      completionEntry.status = "STALE";
      consistencyIssues.push(
        `Completion Audit sourceDeliveryManifest (${completionEntry.sourceDeliveryManifest || "missing"}) does not match latest Delivery Evidence (${deliveryEntry.manifestPath}). Run npm run completion:audit again.`,
      );
    }
    if (fieldReadinessEntry?.manifestPath && completionEntry.sourceFieldReadinessManifest !== fieldReadinessEntry.manifestPath) {
      completionEntry.status = "STALE";
      consistencyIssues.push(
        `Completion Audit sourceFieldReadinessManifest (${completionEntry.sourceFieldReadinessManifest || "missing"}) does not match latest Field Readiness (${fieldReadinessEntry.manifestPath}). Run npm run completion:audit again.`,
      );
    }
    if (
      manualReadinessEntry?.manifestPath &&
      completionEntry.sourceManualEvidenceReadinessManifest !== manualReadinessEntry.manifestPath
    ) {
      completionEntry.status = "STALE";
      consistencyIssues.push(
        `Completion Audit sourceManualEvidenceReadinessManifest (${completionEntry.sourceManualEvidenceReadinessManifest || "missing"}) does not match latest Manual Evidence Readiness (${manualReadinessEntry.manifestPath}). Run npm run completion:audit again.`,
      );
    }
  }
  if (completionEntry?.manifestPath && fieldClosurePlanEntry?.manifestPath) {
    if (fieldClosurePlanEntry.sourceCompletionAudit !== completionEntry.manifestPath) {
      fieldClosurePlanEntry.status = "STALE";
      consistencyIssues.push(
        `Field Closure Plan sourceCompletionAudit (${fieldClosurePlanEntry.sourceCompletionAudit || "missing"}) does not match latest Completion Audit (${completionEntry.manifestPath}). Run npm run field:closure-plan again.`,
      );
    }
  }

  const missingRequired = entries.filter((entry) => entry.required && !entry.manifestPath);
  const staleEntries = entries.filter((entry) => entry.status === "STALE");
  const reviewEntries = entries.filter((entry) =>
    ["REVIEW", "OPEN", "AUTOMATED_CHECKS_REVIEW", "FIELD_VERIFICATION_REQUIRED", "PASS_WITH_SKIPS"].includes(entry.status),
  );
  const completion = entries.find((entry) => entry.area === "Completion Audit");
  const completionManifest = completion?.manifestPath ? readLatestJsonManifest("artifacts/completion-audit") : null;
  const fieldRehearsalFollowUps = fieldRehearsalFollowUpEntries(completionManifest, fieldClosurePlanEntry);
  const fieldActionArtifacts = fieldActionArtifactEntries(completionManifest, fieldClosurePlanEntry);
  const openFieldActionArtifacts = fieldActionArtifacts.filter((entry) => entry.ready !== true || entry.openCount > 0);
  const manualEvidence = manualEvidenceEntries();
  const missingManualEvidence = manualEvidence.filter((entry) => entry.required && entry.status !== "PRESENT");
  const controlBoardSafetyStatus =
    fieldReadinessEntry?.controlBoardSafetyStatus ||
    completionManifest?.data?.controlBoardSafetyStatus ||
    "UNKNOWN";

  const generatedBy = options.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = options.siteName || "unspecified";
  const metadataReview = metadataReviewItems(generatedBy, siteName);
  return {
    generatedAt: new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: os.hostname(),
    status:
      missingRequired.length > 0
        ? "INCOMPLETE"
        : staleEntries.length > 0
          ? "STALE"
          : metadataReview.length > 0 || reviewEntries.length > 0 || missingManualEvidence.length > 0
            ? "REVIEW"
            : "READY",
    canMarkGoalComplete: Boolean(completionManifest?.data?.canMarkGoalComplete),
    controlBoardSafetyStatus,
    counts: {
      totalEntries: entries.length,
      missingRequiredCount: missingRequired.length,
      staleEntryCount: staleEntries.length,
      reviewEntryCount: reviewEntries.length,
      attachableManifestCount: entries.filter((entry) => entry.attach).length,
      manualEvidenceCount: manualEvidence.length,
      missingManualEvidenceCount: missingManualEvidence.length,
      fieldRehearsalFollowUpCount: fieldRehearsalFollowUps.length,
      fieldActionArtifactOpenCount: openFieldActionArtifacts.length,
      metadataReviewCount: metadataReview.length,
    },
    metadataReview,
    entries,
    manualEvidence,
    fieldRehearsalFollowUps,
    fieldActionArtifacts,
    openFieldActionArtifactAreas: openFieldActionArtifacts.map((entry) => entry.artifact),
    missingRequiredAreas: missingRequired.map((entry) => entry.area),
    missingManualEvidenceAreas: missingManualEvidence.map((entry) => entry.area),
    staleAreas: staleEntries.map((entry) => entry.area),
    reviewAreas: reviewEntries.map((entry) => entry.area),
    consistencyIssues,
  };
}

function buildMarkdown(manifest) {
  return [
    "# Handover Evidence Index",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    "",
    "## Counts",
    "",
    `- Total entries: ${manifest.counts.totalEntries}`,
    `- Attachable manifests: ${manifest.counts.attachableManifestCount}`,
    `- Missing required entries: ${manifest.counts.missingRequiredCount}`,
    `- Stale entries: ${manifest.counts.staleEntryCount}`,
    `- Review entries: ${manifest.counts.reviewEntryCount}`,
    `- Manual evidence: ${manifest.counts.manualEvidenceCount}`,
    `- Missing manual evidence: ${manifest.counts.missingManualEvidenceCount}`,
    `- Field rehearsal follow-ups: ${manifest.counts.fieldRehearsalFollowUpCount}`,
    `- Field action artifacts open: ${manifest.counts.fieldActionArtifactOpenCount}`,
    `- Metadata review: ${manifest.counts.metadataReviewCount || 0}`,
    "",
    "## Evidence Entries",
    "",
    "| Area | Status | Required | Safety | Manifest | Command |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.entries.map((entry) =>
      `| ${entry.area} | ${entry.status} | ${entry.required ? "yes" : "no"} | ${entry.controlBoardSafetyStatus || "-"} | ${entry.manifestPath ? `\`${entry.manifestPath}\`` : "missing"} | \`${entry.command}\` |`,
    ),
    "",
    "## Manual Evidence Entries",
    "",
    "| Area | Status | Required | Path | Template | Validation |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.manualEvidence.map((entry) =>
      `| ${entry.area} | ${entry.status} | ${entry.required ? "yes" : "no"} | \`${entry.path}\` | \`${entry.template}\` | ${entry.validationReason || "ok"} |`,
    ),
    "",
    "## Field Rehearsal Follow-ups",
    "",
    "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Source Manifest | Closure Plan |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldRehearsalFollowUps.length > 0
      ? manifest.fieldRehearsalFollowUps.map(
          (entry) =>
            `| ${entry.type} | ${entry.evidenceType} | ${entry.owner} | ${entry.targetRecheckDate} | ${entry.ownerStatus} | ${entry.recheckStatus} | ${entry.reason} | ${entry.manifestPath ? `\`${entry.manifestPath}\`` : "missing"} | ${entry.closurePlanManifest ? `\`${entry.closurePlanManifest}\`` : "missing"} |`,
        )
      : ["| none | - | - | - | - | - | - | - | - |"]),
    "",
    "## Field Action Artifacts",
    "",
    "| Artifact | Status | Open Count | Ready | Source Manifest | Closure Plan |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldActionArtifacts.length > 0
      ? manifest.fieldActionArtifacts.map(
          (entry) =>
            `| ${entry.artifact} | ${entry.status} | ${entry.openCount} | ${entry.ready ? "yes" : "no"} | ${entry.manifestPath ? `\`${entry.manifestPath}\`` : "missing"} | ${entry.closurePlanManifest ? `\`${entry.closurePlanManifest}\`` : "missing"} |`,
        )
      : ["| none | PASS | 0 | yes | - | - |"]),
    "",
    "## Open Field Action Artifacts",
    "",
    ...(manifest.openFieldActionArtifactAreas.length > 0 ? manifest.openFieldActionArtifactAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Missing Required Areas",
    "",
    ...(manifest.missingRequiredAreas.length > 0 ? manifest.missingRequiredAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Missing Manual Evidence",
    "",
    ...(manifest.missingManualEvidenceAreas.length > 0 ? manifest.missingManualEvidenceAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Stale Areas",
    "",
    ...(manifest.staleAreas.length > 0 ? manifest.staleAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Review Areas",
    "",
    ...(manifest.reviewAreas.length > 0 ? manifest.reviewAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Metadata Review",
    "",
    ...(manifest.metadataReview?.length > 0 ? manifest.metadataReview.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Consistency Issues",
    "",
    ...(manifest.consistencyIssues.length > 0 ? manifest.consistencyIssues.map((issue) => `- ${issue}`) : ["- none"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/handover-index");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildIndexManifest({
    generatedBy: argValue("generated-by", undefined),
    siteName: argValue("site-name", undefined),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`handover index written to ${path.relative(root, outputDir)}`);
  console.log(`handover index status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildIndexManifest,
};
