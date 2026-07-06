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
const fieldReviewerArg = '"$env:FIELD_REVIEWER"';
const fieldSiteArg = '"$env:FIELD_SITE_NAME"';
const fieldBaseUrlArg = '"$env:FIELD_BASE_URL"';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function actionForEntry(entry) {
  const commands = {
    "Delivery Evidence": ["npm.cmd run delivery:evidence", "npm.cmd run completion:audit", "npm.cmd run handover:index"],
    "Completion Audit": ["npm.cmd run completion:audit", "npm.cmd run handover:index"],
    "Field Preflight": [`npm.cmd run field:preflight -- -BaseUrl ${fieldBaseUrlArg} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`],
    "Field Acceptance": [`npm.cmd run field:acceptance -- -BaseUrl ${fieldBaseUrlArg} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md`],
    "Field Readiness": [`npm.cmd run field:readiness -- --base-url=${fieldBaseUrlArg} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`],
    "DB And Prisma Field Rehearsal": [`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl ${fieldBaseUrlArg} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`],
    "Lidar Ingest Field Rehearsal": [`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl ${fieldBaseUrlArg} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`],
    "Control Board Field Rehearsal": [`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl ${fieldBaseUrlArg} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -AllowLiveTcp`],
    "Runtime Evidence": [`npm.cmd run runtime:evidence -- --run-smoke --use-existing-stack --base-url=${fieldBaseUrlArg}`],
    "Security Evidence": [`npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=${fieldBaseUrlArg}`],
  };

  const doneWhen = {
    "Delivery Evidence": "Latest delivery manifest has failedCommandCount=0 and no stale completion audit reference.",
    "Completion Audit": "Latest completion audit references the latest delivery manifest and canMarkGoalComplete reflects current evidence.",
    "Field Preflight": "Preflight manifest has no REVIEW or SKIPPED checks required by the field acceptance policy.",
    "Field Acceptance": "Field acceptance manifest is PASS and has no skipped/review steps.",
    "Field Readiness": "Readiness report is PASS or explicitly accepted PASS_WITH_SKIPS, with Docker daemon, Nginx/API health, .env posture, control-board TCP values, cookie security, and Swagger allowlist reviewed.",
    "DB And Prisma Field Rehearsal": "DB field rehearsal manifest results are all PASS against the delivery runtime.",
    "Lidar Ingest Field Rehearsal": "LiDAR rehearsal manifest proves normal-driving de-duplication and wrong-way command creation using representative payloads.",
    "Control Board Field Rehearsal": "Control-board rehearsal manifest proves approved LIVE_TCP command/ACK evidence after hardware owner approval.",
    "Runtime Evidence": "Runtime evidence includes Docker daemon, compose config, Nginx entrypoint, health, security header, statistics, and control-board status checks.",
    "Security Evidence": "Security evidence has audit policy pass and required scanner results or accepted skipped-tool reasons per field policy.",
  };

  return {
    area: entry.area,
    currentStatus: entry.status,
    currentManifest: entry.manifestPath,
    commands: commands[entry.area] || [entry.command],
    doneWhen: doneWhen[entry.area] || "Replacement manifest is generated and the area is no longer REVIEW, STALE, or MISSING.",
    notes: entry.notes,
  };
}

function metadataReviewItems(generatedBy, siteName) {
  return [
    isPlaceholderFieldText(generatedBy) ? "Generated-by reviewer metadata is missing or placeholder." : "",
    isPlaceholderFieldText(siteName) ? "Site name metadata is missing or placeholder." : "",
  ].filter(Boolean);
}

function buildFieldReadinessOpenChecks(fieldReadiness) {
  const checks = fieldReadiness?.data?.checks || [];
  return checks
    .filter((check) => ["REVIEW", "SKIPPED"].includes(check.status))
    .map((check) => ({
      name: check.name,
      status: check.status,
      severity: check.severity,
      message: check.message,
      nextAction: check.nextAction,
      evidenceCommand: check.evidenceCommand,
      doneWhen: check.doneWhen,
    }));
}

function buildManualEvidenceActions() {
  return manualEvidenceRefs().map((item) => ({
    type: item.type,
    path: item.path,
    template: item.template,
    nextAction: item.nextAction,
    doneWhen: item.doneWhen,
    status: item.status,
    validationReason: item.validationReason,
  }));
}

function buildFieldRehearsalFollowUpActions(completion) {
  const followUps = completion?.data?.fieldRehearsalFollowUps;
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
    nextAction: `Confirm ${item.type || "field rehearsal"} with ${item.replacementOwner || "the assigned owner"} by ${item.targetRecheckDate || "the target recheck date"}.`,
    doneWhen: `${item.type || "Field rehearsal"} has a PASS manifest or an approved replacement evidence record after recheck.`,
  }));
}

function buildFieldActionArtifactActions(completion) {
  const artifacts = completion?.data?.fieldActionArtifactSignals;
  if (!Array.isArray(artifacts)) return [];
  return artifacts
    .filter((item) => item.ready !== true)
    .map((item) => ({
      artifact: item.label || item.key || "unknown",
      status: item.status || "UNKNOWN",
      openCount: Number.isFinite(Number(item.openCount)) ? Number(item.openCount) : 0,
      path: item.path || null,
      nextAction: "Close the related field action items and refresh field:risk-register, field:action-board, field:gate-closure-map, field:owner-briefs, completion:audit, and field:closure-plan.",
      doneWhen: `${item.label || "Field action artifact"} is ${item.readyStatus || "READY"} with open count 0.`,
    }));
}

function buildClosureCommandQueue(finalExecutionPlan) {
  const orderedCommands = finalExecutionPlan?.data?.orderedCommands;
  if (!Array.isArray(orderedCommands)) return [];
  return orderedCommands.map((item, index) => ({
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
    id: item.id || `closure-command-${index + 1}`,
    phase: item.phase || "Field Closure",
    actionTypes: Array.isArray(item.actionTypes) ? item.actionTypes : [],
    command: item.command || "",
    purpose: item.purpose || "Close the associated field, security, CI, or handover gate.",
    doneWhen: item.doneWhen || "The associated gate no longer appears in final-status remaining gates.",
  }));
}

function hasOpenRequiredFieldValue(item) {
  const state = String(item.state || "").toLowerCase();
  return [
    "missing",
    "open-or-missing",
    "open-or-wildcard",
    "missing-or-trusted-lan-exception-required",
    "not-approved",
    "invalid",
    "change-this-to-a-long-random-secret",
    "change-this-admin-password",
    "admin1234!",
  ].includes(state);
}

function closurePlanStatusFromCounts(counts) {
  const openCount =
    counts.openActionCount +
    counts.completionBlockerCount +
    counts.openRequiredFieldValueCount +
    counts.fieldReadinessOpenCheckCount +
    counts.fieldActionArtifactOpenCount +
    counts.fieldRehearsalFollowUpCount +
    counts.manualEvidenceMissingCount;
  return openCount > 0 ? "OPEN" : "READY";
}

function buildClosurePlan(options = {}) {
  const handover = readLatestJsonManifest("artifacts/handover-index");
  const completion = readLatestJsonManifest("artifacts/completion-audit");
  const fieldReadiness = readLatestJsonManifest("artifacts/field-readiness");
  const finalExecutionPlan = readLatestJsonManifest("artifacts/final-execution-plan");
  const entries = handover?.data?.entries || [];
  const openEntries = entries.filter((entry) =>
    ["MISSING", "STALE", "REVIEW", "OPEN", "AUTOMATED_CHECKS_REVIEW", "FIELD_VERIFICATION_REQUIRED", "PASS_WITH_SKIPS"].includes(entry.status),
  );

  const completionBlockers = completion?.data?.completionBlockers || [];
  const requiredFieldValues = Array.isArray(completion?.data?.requiredFieldValues)
    ? completion.data.requiredFieldValues
    : [];
  const fieldReadinessOpenChecks = buildFieldReadinessOpenChecks(fieldReadiness);
  const manualEvidenceActions = buildManualEvidenceActions();
  const fieldRehearsalFollowUpActions = buildFieldRehearsalFollowUpActions(completion);
  const fieldActionArtifactActions = buildFieldActionArtifactActions(completion);
  const closureCommandQueue = buildClosureCommandQueue(finalExecutionPlan);
  const actions = openEntries.map(actionForEntry);
  const generatedBy = options.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = options.siteName || handover?.data?.siteName || "unspecified";
  const metadataReview = metadataReviewItems(generatedBy, siteName);
  const counts = {
    openActionCount: actions.length + metadataReview.length,
    completionBlockerCount: completionBlockers.length,
    requiredFieldValueCount: requiredFieldValues.length,
    openRequiredFieldValueCount: requiredFieldValues.filter(hasOpenRequiredFieldValue).length,
    fieldReadinessOpenCheckCount: fieldReadinessOpenChecks.length,
    fieldActionArtifactOpenCount: fieldActionArtifactActions.length,
    fieldRehearsalFollowUpCount: fieldRehearsalFollowUpActions.length,
    manualEvidenceMissingCount: manualEvidenceActions.filter((item) => item.status !== "PRESENT").length,
    metadataReviewCount: metadataReview.length,
    closureCommandQueueCount: closureCommandQueue.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: os.hostname(),
    sourceHandoverIndex: handover?.path || null,
    sourceCompletionAudit: completion?.path || null,
    sourceFinalExecutionPlan: finalExecutionPlan?.path || null,
    status: closurePlanStatusFromCounts(counts),
    canMarkGoalComplete: Boolean(completion?.data?.canMarkGoalComplete),
    controlBoardSafetyStatus:
      fieldReadiness?.data?.env?.controlBoardSafetyStatus ||
      completion?.data?.controlBoardSafetyStatus ||
      handover?.data?.controlBoardSafetyStatus ||
      "UNKNOWN",
    counts,
    completionBlockers,
    requiredFieldValues,
    fieldReadinessOpenChecks,
    fieldActionArtifactActions,
    fieldRehearsalFollowUpActions,
    manualEvidenceActions,
    closureCommandQueue,
    metadataReview,
    actions: [
      ...metadataReview.map((message) => ({
        area: "Field Closure Plan Metadata",
        currentStatus: "PLACEHOLDER_METADATA",
        currentManifest: handover?.path || null,
        doneWhen: "Rerun npm.cmd run field:closure-plan with concrete --generated-by=<field-reviewer> and --site-name=<delivery-site> values.",
        commands: [`npm.cmd run field:closure-plan -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`],
        notes: message,
      })),
      ...actions,
    ],
    finalCommands: [
      "npm.cmd run delivery:evidence",
      `npm.cmd run field:readiness -- --base-url=${fieldBaseUrlArg} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      "npm.cmd run completion:audit",
      `npm.cmd run handover:index -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      `npm.cmd run field:closure-plan -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      `npm.cmd run handover:package -- --base-url=${fieldBaseUrlArg} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg} --strict`,
    ],
  };
}

function buildMarkdown(manifest) {
  const tableValue = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return [
    "# Field Closure Plan",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus}`,
    `- Source handover index: ${manifest.sourceHandoverIndex || "missing"}`,
    `- Source completion audit: ${manifest.sourceCompletionAudit || "missing"}`,
    `- Source final execution plan: ${manifest.sourceFinalExecutionPlan || "missing"}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    "",
    "## Counts",
    "",
    `- Open actions: ${manifest.counts.openActionCount}`,
    `- Completion blockers: ${manifest.counts.completionBlockerCount}`,
    `- Required field values: ${manifest.counts.requiredFieldValueCount}`,
    `- Open required field values: ${manifest.counts.openRequiredFieldValueCount}`,
    `- Field readiness open checks: ${manifest.counts.fieldReadinessOpenCheckCount}`,
    `- Field action artifact open: ${manifest.counts.fieldActionArtifactOpenCount}`,
    `- Field rehearsal follow-ups: ${manifest.counts.fieldRehearsalFollowUpCount}`,
    `- Manual evidence missing: ${manifest.counts.manualEvidenceMissingCount}`,
    `- Metadata review: ${manifest.counts.metadataReviewCount || 0}`,
    `- Closure command queue: ${manifest.counts.closureCommandQueueCount || 0}`,
    "",
    "## Actions",
    "",
    ...(manifest.actions.length > 0
      ? manifest.actions.flatMap((action, index) => [
          `### ${index + 1}. ${action.area}`,
          "",
          `- Current status: ${action.currentStatus}`,
          `- Current manifest: ${action.currentManifest || "missing"}`,
          `- Done when: ${action.doneWhen}`,
          "- Commands:",
          ...action.commands.map((command) => `  - \`${command}\``),
          `- Notes: ${action.notes}`,
          "",
        ])
      : ["- none", ""]),
    "## Closure Command Queue",
    "",
    "| Order | Phase | ID | Action Types | Command | Purpose | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.closureCommandQueue.length > 0
      ? manifest.closureCommandQueue.map(
          (item) =>
            `| ${item.order} | ${tableValue(item.phase)} | ${tableValue(item.id)} | ${tableValue(item.actionTypes.join(", "))} | \`${tableValue(item.command)}\` | ${tableValue(item.purpose)} | ${tableValue(item.doneWhen)} |`,
        )
      : ["| none | n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Completion Blockers",
    "",
    ...(manifest.completionBlockers.length > 0
      ? manifest.completionBlockers.map((blocker) => `- [${blocker.category || "unknown"}] ${blocker.message || blocker}`)
      : ["- none"]),
    "",
    "## Required Field Values",
    "",
    "| Name | State | Completion Gate | Next Action | Redacted |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.requiredFieldValues.length > 0
      ? manifest.requiredFieldValues.map((item) => `| ${item.name || "unknown"} | ${item.state || "unknown"} | ${item.completionGate || ""} | ${item.nextAction || ""} | ${item.redacted !== false} |`)
      : ["| none | n/a | n/a | n/a | true |"]),
    "",
    "## Field Readiness Open Checks",
    "",
    "| Status | Severity | Check | Message | Next Action | Evidence Command | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldReadinessOpenChecks.length > 0
      ? manifest.fieldReadinessOpenChecks.map(
          (check) =>
            `| ${tableValue(check.status)} | ${tableValue(check.severity)} | ${tableValue(check.name)} | ${tableValue(check.message)} | ${tableValue(check.nextAction)} | ${tableValue(check.evidenceCommand)} | ${tableValue(check.doneWhen)} |`,
        )
      : ["| none | n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Field Action Artifact Actions",
    "",
    "| Artifact | Status | Open Count | Next Action | Done When | Manifest |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldActionArtifactActions.length > 0
      ? manifest.fieldActionArtifactActions.map(
          (item) =>
            `| ${tableValue(item.artifact)} | ${tableValue(item.status)} | ${item.openCount} | ${tableValue(item.nextAction)} | ${tableValue(item.doneWhen)} | ${item.path ? `\`${tableValue(item.path)}\`` : "missing"} |`,
        )
      : ["| none | PASS | 0 | n/a | n/a | n/a |"]),
    "",
    "## Field Rehearsal Follow-up Actions",
    "",
    "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Next Action | Done When | Manifest |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldRehearsalFollowUpActions.length > 0
      ? manifest.fieldRehearsalFollowUpActions.map(
          (item) =>
            `| ${tableValue(item.type)} | ${tableValue(item.evidenceType)} | ${tableValue(item.owner)} | ${tableValue(item.targetRecheckDate)} | ${tableValue(item.ownerStatus)} | ${tableValue(item.recheckStatus)} | ${tableValue(item.reason)} | ${tableValue(item.nextAction)} | ${tableValue(item.doneWhen)} | ${item.manifestPath ? `\`${tableValue(item.manifestPath)}\`` : "missing"} |`,
        )
      : ["| none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Manual Evidence Actions",
    "",
    "| Status | Type | Path | Template | Validation | Next Action | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.manualEvidenceActions.length > 0
      ? manifest.manualEvidenceActions.map(
        (item) =>
            `| ${tableValue(item.status)} | ${tableValue(item.type)} | \`${tableValue(item.path)}\` | \`${tableValue(item.template)}\` | ${tableValue(item.validationReason || "ok")} | ${tableValue(item.nextAction)} | ${tableValue(item.doneWhen)} |`,
      )
      : ["| none | n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Final Refresh Commands",
    "",
    ...manifest.finalCommands.map((command) => `- \`${command}\``),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-closure-plan");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildClosurePlan({
    generatedBy: argValue("generated-by", undefined),
    siteName: argValue("site-name", undefined),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field closure plan written to ${path.relative(root, outputDir)}`);
  console.log(`field closure plan status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildClosureCommandQueue,
  buildFieldActionArtifactActions,
  buildClosurePlan,
  closurePlanStatusFromCounts,
  hasOpenRequiredFieldValue,
};
