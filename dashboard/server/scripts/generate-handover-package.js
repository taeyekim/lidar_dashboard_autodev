const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  readLatestJsonManifest,
  summarizeFieldAcceptance,
  summarizeFieldPreflight,
  summarizeFieldRehearsal,
  timestampForPath,
} = require("./generate-delivery-evidence");
const { manualEvidenceRefs } = require("./manual-evidence");

const root = path.join(__dirname, "..", "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function runCommand(label, args) {
  const startedAt = new Date();
  const result = spawnSync(npmCommand, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  return {
    label,
    command: [npmCommand, ...args].join(" "),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function writeCommandLog(dir, item) {
  const fileName = `${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.log`;
  fs.writeFileSync(
    path.join(dir, fileName),
    [
      `# ${item.label}`,
      `command=${item.command}`,
      `startedAt=${item.startedAt}`,
      `finishedAt=${item.finishedAt}`,
      `exitCode=${item.exitCode}`,
      item.error ? `error=${item.error}` : "",
      "## stdout",
      item.stdout,
      "## stderr",
      item.stderr,
      "",
    ].join("\n"),
  );
  return fileName;
}

function latestEvidenceRefs() {
  return {
    delivery: readLatestJsonManifest("artifacts/delivery")?.path || null,
    completionAudit: readLatestJsonManifest("artifacts/completion-audit")?.path || null,
    handoverIndex: readLatestJsonManifest("artifacts/handover-index")?.path || null,
    fieldClosurePlan: readLatestJsonManifest("artifacts/field-closure-plan")?.path || null,
    fieldReadiness: readLatestJsonManifest("artifacts/field-readiness")?.path || null,
    fieldPreflight: readLatestJsonManifest("artifacts/field-preflight")?.path || null,
    fieldAcceptance: readLatestJsonManifest("artifacts/field-acceptance")?.path || null,
    dbFieldRehearsal: readLatestJsonManifest("artifacts/field-db-rehearsal")?.path || null,
    lidarFieldRehearsal: readLatestJsonManifest("artifacts/field-lidar-rehearsal")?.path || null,
    controlBoardFieldRehearsal: readLatestJsonManifest("artifacts/field-control-board-rehearsal")?.path || null,
    runtimeEvidence: readLatestJsonManifest("artifacts/runtime")?.path || null,
    securityEvidence: readLatestJsonManifest("artifacts/security")?.path || null,
  };
}

function knownFieldLimitations() {
  return [
    {
      area: "Control Board TCP",
      limitation: "Live integrated control-board TCP test requires field IP/port and hardware approval.",
      source: "docs/ops/delivery-evidence-matrix.md",
      closeWhen: "CONTROL_BOARD_HOST/PORT are configured, hardware owner approves live TCP, and control-board field rehearsal records command/ACK evidence.",
    },
    {
      area: "Level-2 Escalation",
      limitation: "Dashboard-side wrong-way-level-2 escalation threshold remains field-measurement dependent.",
      source: "docs/ai/field-system-requirements.md",
      closeWhen: "Field measurement criteria are approved and automated escalation logic plus rehearsal evidence are added.",
    },
    {
      area: "Traffic KPI Wording",
      limitation: "Daily, weekly, monthly, and yearly KPI labels require field acceptance of operational wording.",
      source: "docs/ops/delivery-evidence-matrix.md",
      closeWhen: "Operator UI walkthrough records accepted statistics wording and display resolution.",
    },
    {
      area: "Security Scanner Evidence",
      limitation: "gitleaks, Trivy, and OWASP ZAP evidence depends on tool installation or explicit reviewer risk acceptance.",
      source: "docs/ops/security-scan-checklist.md",
      closeWhen: "Security evidence is run with --require-scanners, or field-risk acceptance records reviewer, owner, and recheck date.",
    },
    {
      area: "Device Ingest Key",
      limitation: "If the LiDAR PC or bridge cannot send X-Device-Key, ingest hardening depends on an accepted trusted-LAN exception.",
      source: "docs/ops/field-risk-acceptance-template.md",
      closeWhen: "DEVICE_INGEST_API_KEY is configured end to end, or field-risk acceptance documents compensating controls.",
    },
  ];
}

function latestControlBoardSafetyStatus() {
  return (
    readLatestJsonManifest("artifacts/field-readiness")?.data?.env?.controlBoardSafetyStatus ||
    readLatestJsonManifest("artifacts/completion-audit")?.data?.controlBoardSafetyStatus ||
    readLatestJsonManifest("artifacts/handover-index")?.data?.controlBoardSafetyStatus ||
    "UNKNOWN"
  );
}

function buildFieldEvidenceSummary() {
  return [
    summarizeFieldPreflight("Field Preflight", "artifacts/field-preflight"),
    summarizeFieldAcceptance("Field Acceptance", "artifacts/field-acceptance"),
    summarizeFieldRehearsal("DB And Prisma", "artifacts/field-db-rehearsal"),
    summarizeFieldRehearsal("Lidar Ingest", "artifacts/field-lidar-rehearsal"),
    summarizeFieldRehearsal("Control Board TCP", "artifacts/field-control-board-rehearsal"),
  ];
}

function fieldEvidenceStrictFailures(fieldEvidenceSummary) {
  return fieldEvidenceSummary
    .filter((item) => (item.reviewCount || 0) > 0 || (item.skippedCount || 0) > 0)
    .map(
      (item) =>
        `${item.type} field evidence has ${item.reviewCount || 0} REVIEW and ${item.skippedCount || 0} SKIPPED item(s).`,
    );
}

function fieldEvidenceNextAction(type) {
  const actions = {
    "Field Preflight":
      "Run npm.cmd run field:preflight -- -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\" after final .env values are set.",
    "Field Acceptance":
      "Run npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\" -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md after runtime, rehearsal, security, and UI walkthrough evidence are ready.",
    "DB And Prisma":
      "Run powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\" against the delivery runtime.",
    "Lidar Ingest":
      "Run powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\" with representative lidar payloads.",
    "Control Board TCP":
      "Run powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\" after control-board dry-run or approved live TCP conditions are confirmed.",
  };
  return actions[type] || "Refresh the related field evidence manifest and rerun npm.cmd run handover:package.";
}

function fieldEvidenceDoneWhen(type) {
  const doneWhen = {
    "Field Preflight": "Preflight manifest has no REVIEW or SKIPPED checks required by the field acceptance policy.",
    "Field Acceptance": "Field acceptance manifest is PASS and has no REVIEW or SKIPPED steps.",
    "DB And Prisma": "DB field rehearsal manifest results are all PASS against the delivery runtime.",
    "Lidar Ingest": "LiDAR rehearsal manifest proves normal-driving de-duplication and wrong-way command creation using representative payloads.",
    "Control Board TCP": "Control-board rehearsal manifest proves DRY_RUN command lifecycle or approved LIVE_TCP command/ACK evidence.",
  };
  return doneWhen[type] || "Replacement manifest is generated and the area is no longer REVIEW, STALE, or MISSING.";
}

function buildFieldEvidenceOpenItems(fieldEvidenceSummary) {
  return fieldEvidenceSummary.flatMap((item) => [
    ...(item.reviewItems || []).map((message) => ({
      type: item.type,
      status: "REVIEW",
      message,
      manifestPath: item.manifestPath || null,
      nextAction: fieldEvidenceNextAction(item.type),
      doneWhen: fieldEvidenceDoneWhen(item.type),
    })),
    ...(item.skippedItems || []).map((message) => ({
      type: item.type,
      status: "SKIPPED",
      message,
      manifestPath: item.manifestPath || null,
      nextAction: fieldEvidenceNextAction(item.type),
      doneWhen: fieldEvidenceDoneWhen(item.type),
    })),
  ]);
}

function buildFieldEvidenceCommandRunbook(fieldEvidenceOpenItems) {
  const seen = new Set();
  return fieldEvidenceOpenItems
    .filter((item) => item.nextAction)
    .filter((item) => {
      if (seen.has(item.nextAction)) return false;
      seen.add(item.nextAction);
      return true;
    })
    .map((item) => ({
      type: item.type,
      command: item.nextAction,
      doneWhen: item.doneWhen,
    }));
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# Handover Package",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    "",
    "## Evidence References",
    "",
    `- Delivery evidence: ${manifest.evidenceRefs.delivery || "missing"}`,
    `- Completion audit: ${manifest.evidenceRefs.completionAudit || "missing"}`,
    `- Handover index: ${manifest.evidenceRefs.handoverIndex || "missing"}`,
    `- Field closure plan: ${manifest.evidenceRefs.fieldClosurePlan || "missing"}`,
    `- Field readiness: ${manifest.evidenceRefs.fieldReadiness || "missing"}`,
    `- Field preflight: ${manifest.evidenceRefs.fieldPreflight || "missing"}`,
    `- Field acceptance: ${manifest.evidenceRefs.fieldAcceptance || "missing"}`,
    `- DB field rehearsal: ${manifest.evidenceRefs.dbFieldRehearsal || "missing"}`,
    `- LiDAR field rehearsal: ${manifest.evidenceRefs.lidarFieldRehearsal || "missing"}`,
    `- Control-board field rehearsal: ${manifest.evidenceRefs.controlBoardFieldRehearsal || "missing"}`,
    `- Runtime evidence: ${manifest.evidenceRefs.runtimeEvidence || "missing"}`,
    `- Security evidence: ${manifest.evidenceRefs.securityEvidence || "missing"}`,
    "",
    "## Manual Evidence References",
    "",
    "| Type | Status | Path | Template | Required When | Validation |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.manualEvidenceRefs.map(
      (item) =>
        `| ${markdownCell(item.type)} | ${markdownCell(item.status)} | \`${markdownCell(item.path)}\` | \`${markdownCell(item.template)}\` | ${markdownCell(item.requiredWhen)} | ${markdownCell(item.validationReason || "ok")} |`,
    ),
    "",
    "## Known Field Limitations",
    "",
    "| Area | Limitation | Source | Close When |",
    "| --- | --- | --- | --- |",
    ...manifest.knownFieldLimitations.map(
      (item) =>
        `| ${markdownCell(item.area)} | ${markdownCell(item.limitation)} | \`${markdownCell(item.source)}\` | ${markdownCell(item.closeWhen)} |`,
    ),
    "",
    "## Field Evidence Summary",
    "",
    "| Type | Manifest | PASS | REVIEW | SKIPPED |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.fieldEvidenceSummary.map(
      (item) =>
        `| ${markdownCell(item.type)} | ${item.manifestPath ? `\`${markdownCell(item.manifestPath)}\`` : "missing"} | ${item.passCount || 0} | ${item.reviewCount || 0} | ${item.skippedCount || 0} |`,
    ),
    "",
    "## Field Evidence Open Items",
    "",
    "| Type | Status | Message | Next Action | Manifest |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.fieldEvidenceOpenItems.length > 0
      ? manifest.fieldEvidenceOpenItems.map(
          (item) =>
            `| ${markdownCell(item.type)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.nextAction)} | ${item.manifestPath ? `\`${markdownCell(item.manifestPath)}\`` : "missing"} |`,
        )
      : ["| none | PASS | No field evidence review/skipped items. | - | - |"]),
    "",
    "## Field Evidence Command Runbook",
    "",
    "| Type | Command | Done When |",
    "| --- | --- | --- |",
    ...(manifest.fieldEvidenceCommandRunbook.length > 0
      ? manifest.fieldEvidenceCommandRunbook.map(
          (item) => `| ${markdownCell(item.type)} | ${markdownCell(item.command)} | ${markdownCell(item.doneWhen)} |`,
        )
      : ["| none | No field evidence commands required. | - |"]),
    "",
    "## Commands",
    "",
    "| Status | Command | Log |",
    "| --- | --- | --- |",
    ...manifest.commands.map((item) => `| ${item.exitCode === 0 ? "PASS" : "FAIL"} | \`${item.command}\` | \`${item.logFile}\` |`),
    "",
    "## Strict Gate",
    "",
    `- Strict mode: ${manifest.strict}`,
    `- Failed command count: ${manifest.failedCommandCount}`,
    ...(manifest.strictFailureReasons.length > 0
      ? manifest.strictFailureReasons.map((reason) => `- ${reason}`)
      : ["- none"]),
    "",
    "## Package Notes",
    "",
    "- This command refreshes the final evidence chain in order: delivery evidence, field readiness, completion audit, field closure plan, then handover index.",
    "- Attach this manifest together with the referenced evidence folders.",
    "- `canMarkGoalComplete=false` means field/runtime/hardware evidence is still open.",
    "- Strict security acceptance should attach `npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=<delivery-url>` output so skipped scanners become blocking evidence.",
    "- Use `--strict` when the command should fail unless the refreshed package is READY and `canMarkGoalComplete=true`.",
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/handover-package");
  const siteName = argValue("site-name", "unspecified");
  const generatedBy = argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex");
  const baseUrl = argValue("base-url", "http://localhost:8080");
  const strict = hasFlag("strict");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const commands = [
    ["delivery evidence", ["run", "delivery:evidence"]],
    ["field readiness", ["run", "field:readiness", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["completion audit", ["run", "completion:audit"]],
    ["field closure plan", ["run", "field:closure-plan", "--", `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["handover index", ["run", "handover:index", "--", `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
  ].map(([label, args]) => runCommand(label, args));

  const evidenceRefs = latestEvidenceRefs();
  const completion = readLatestJsonManifest("artifacts/completion-audit");
  const handoverIndex = readLatestJsonManifest("artifacts/handover-index");
  const failedCommands = commands.filter((item) => item.exitCode !== 0);
  const packageStatus = failedCommands.length > 0 ? "FAILED" : handoverIndex?.data?.status || "UNKNOWN";
  const canMarkGoalComplete = Boolean(completion?.data?.canMarkGoalComplete);
  const controlBoardSafetyStatus = latestControlBoardSafetyStatus();
  const fieldEvidenceSummary = buildFieldEvidenceSummary();
  const fieldEvidenceOpenItems = buildFieldEvidenceOpenItems(fieldEvidenceSummary);
  const fieldEvidenceCommandRunbook = buildFieldEvidenceCommandRunbook(fieldEvidenceOpenItems);
  const manualEvidence = manualEvidenceRefs();
  const openManualEvidence = manualEvidence.filter((item) => item.required && item.status !== "PRESENT");
  const strictFailureReasons = [];
  if (failedCommands.length > 0) {
    strictFailureReasons.push(`${failedCommands.length} package command(s) failed.`);
  }
  if (packageStatus !== "READY") {
    strictFailureReasons.push(`handover package status is ${packageStatus}.`);
  }
  if (!canMarkGoalComplete) {
    strictFailureReasons.push("canMarkGoalComplete is false.");
  }
  if (openManualEvidence.length > 0) {
    strictFailureReasons.push(
      `${openManualEvidence.length} manual evidence item(s) are not PRESENT: ${openManualEvidence.map((item) => `${item.type}=${item.status}`).join(", ")}.`,
    );
  }
  strictFailureReasons.push(...fieldEvidenceStrictFailures(fieldEvidenceSummary));
  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: os.hostname(),
    baseUrl,
    strict,
    status: packageStatus,
    canMarkGoalComplete,
    controlBoardSafetyStatus,
    commands: commands.map((item) => ({
      label: item.label,
      command: item.command,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      exitCode: item.exitCode,
      error: item.error,
      logFile: writeCommandLog(outputDir, item),
    })),
    evidenceRefs,
    manualEvidenceRefs: manualEvidence,
    knownFieldLimitations: knownFieldLimitations(),
    fieldEvidenceSummary,
    fieldEvidenceOpenItems,
    fieldEvidenceCommandRunbook,
    failedCommandCount: failedCommands.length,
    strictFailureReasons,
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`handover package written to ${path.relative(root, outputDir)}`);
  console.log(`handover package status: ${manifest.status}`);
  if (failedCommands.length > 0) {
    process.exit(1);
  }
  if (strict && strictFailureReasons.length > 0) {
    console.error(`handover package strict gate failed: ${strictFailureReasons.join(" ")}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
