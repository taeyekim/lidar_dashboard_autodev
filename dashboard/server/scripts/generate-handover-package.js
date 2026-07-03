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

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.stdout.trim();
}

function buildGitState() {
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
    manualEvidenceDrafts: readLatestJsonManifest("artifacts/manual-evidence-drafts")?.path || null,
    manualEvidenceReadiness: readLatestJsonManifest("artifacts/manual-evidence-readiness")?.path || null,
    fieldRiskRegister: readLatestJsonManifest("artifacts/field-risk-register")?.path || null,
    fieldActionBoard: readLatestJsonManifest("artifacts/field-action-board")?.path || null,
    fieldGateClosureMap: readLatestJsonManifest("artifacts/field-gate-closure-map")?.path || null,
    fieldOwnerBriefs: readLatestJsonManifest("artifacts/field-owner-briefs")?.path || null,
  };
}

function knownFieldLimitations() {
  return [
    {
      area: "Control Board TCP",
      limitation: "Live integrated control-board TCP test requires field IP/port and hardware approval.",
      source: "docs/ops/delivery-evidence-matrix.md",
      closeWhen: "CONTROL_BOARD_HOST/PORT are configured, CONTROL_BOARD_LIVE_APPROVED=true is recorded, hardware owner approves live TCP, and control-board field rehearsal records command/ACK evidence.",
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

function fieldActionArtifactStrictFailures({
  fieldRiskRegister,
  fieldActionBoard,
  fieldGateClosureMap,
  fieldOwnerBriefs,
}) {
  const failures = [];
  const riskData = fieldRiskRegister?.data || {};
  const actionData = fieldActionBoard?.data || {};
  const gateMapData = fieldGateClosureMap?.data || {};
  const ownerBriefsData = fieldOwnerBriefs?.data || {};

  if (!fieldRiskRegister) {
    failures.push("field risk register manifest is missing.");
  } else if (riskData.status !== "NO_OPEN_RISKS" || Number(riskData.openRiskCount || 0) > 0) {
    failures.push(`field risk register has ${riskData.openRiskCount ?? "unknown"} open risk item(s).`);
  }

  if (!fieldActionBoard) {
    failures.push("field action board manifest is missing.");
  } else if (actionData.status !== "READY_TO_CLOSE" || Number(actionData.openActionCount || 0) > 0) {
    failures.push(`field action board has ${actionData.openActionCount ?? "unknown"} open action item(s).`);
  }

  if (!fieldGateClosureMap) {
    failures.push("field gate closure map manifest is missing.");
  } else if (gateMapData.status !== "READY_TO_CLOSE" || Number(gateMapData.openGateCount || 0) > 0) {
    failures.push(`field gate closure map has ${gateMapData.openGateCount ?? "unknown"} open gate(s).`);
  }

  if (!fieldOwnerBriefs) {
    failures.push("field owner briefs manifest is missing.");
  } else if (ownerBriefsData.status !== "READY_TO_CLOSE" || Number(ownerBriefsData.openItemCount || 0) > 0) {
    failures.push(`field owner briefs have ${ownerBriefsData.openItemCount ?? "unknown"} open owner item(s).`);
  }

  return failures;
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

function buildFieldEvidenceFollowUps(fieldEvidenceSummary) {
  return fieldEvidenceSummary
    .map((item) => {
      const acceptance = item.metadata?.unavailableAcceptance;
      if (!acceptance) return null;
      return {
        type: item.type,
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

function buildResidualFieldGates({
  canMarkGoalComplete,
  strictFailureReasons,
  openManualEvidence,
  fieldEvidenceOpenItems,
  fieldEvidenceFollowUps,
  knownLimitations,
}) {
  return [
    ...strictFailureReasons.map((reason) => ({
      category: "Strict Gate",
      status: "OPEN",
      message: reason,
      closeWhen: "Resolve the strict gate reason and rerun npm.cmd run handover:package -- --strict.",
    })),
    ...openManualEvidence.map((item) => ({
      category: "Manual Evidence",
      status: item.status,
      message: `${item.type} evidence is ${item.status}.`,
      closeWhen: item.doneWhen || item.requiredWhen || "Attach accepted manual evidence.",
    })),
    ...fieldEvidenceOpenItems.map((item) => ({
      category: "Field Evidence",
      status: item.status,
      message: item.message,
      closeWhen: item.doneWhen,
    })),
    ...fieldEvidenceFollowUps.map((item) => ({
      category: "Rehearsal Follow-up",
      status: `${item.ownerStatus}/${item.recheckStatus}`,
      message: `${item.type} replacement rehearsal is assigned to ${item.replacementOwner} for ${item.targetRecheckDate}.`,
      closeWhen: `${item.type} has a PASS manifest or approved replacement evidence after recheck.`,
    })),
    ...(canMarkGoalComplete
      ? []
      : knownLimitations.map((item) => ({
          category: "Known Limitation",
          status: "FIELD_REVIEW",
          message: `${item.area}: ${item.limitation}`,
          closeWhen: item.closeWhen,
        }))),
  ];
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
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Residual Field Gates",
    "",
    "| Category | Status | Message | Close When |",
    "| --- | --- | --- | --- |",
    ...(manifest.residualFieldGates.length > 0
      ? manifest.residualFieldGates.map(
          (item) =>
            `| ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} |`,
        )
      : ["| none | PASS | No residual field gates. | - |"]),
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
    `- Manual evidence drafts: ${manifest.evidenceRefs.manualEvidenceDrafts || "missing"}`,
    `- Manual evidence readiness: ${manifest.evidenceRefs.manualEvidenceReadiness || "missing"}`,
    `- Field risk register: ${manifest.evidenceRefs.fieldRiskRegister || "missing"}`,
    `- Field action board: ${manifest.evidenceRefs.fieldActionBoard || "missing"}`,
    `- Field gate closure map: ${manifest.evidenceRefs.fieldGateClosureMap || "missing"}`,
    `- Field owner briefs: ${manifest.evidenceRefs.fieldOwnerBriefs || "missing"}`,
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
    "## Field Evidence Follow-ups",
    "",
    "| Type | Evidence | Owner | Recheck Date | Owner Status | Recheck Status | Reason | Manifest |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldEvidenceFollowUps.length > 0
      ? manifest.fieldEvidenceFollowUps.map(
          (item) =>
            `| ${markdownCell(item.type)} | ${markdownCell(item.evidenceType)} | ${markdownCell(item.replacementOwner)} | ${markdownCell(item.targetRecheckDate)} | ${markdownCell(item.ownerStatus)} | ${markdownCell(item.recheckStatus)} | ${markdownCell(item.reason)} | ${item.manifestPath ? `\`${markdownCell(item.manifestPath)}\`` : "missing"} |`,
        )
      : ["| none | - | - | - | - | - | - | - |"]),
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
    "- This command refreshes the final evidence chain in order: delivery evidence, manual evidence drafts, manual evidence readiness, field readiness, field risk register, field action board, field gate closure map, field owner briefs, completion audit, field closure plan, then handover index.",
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
    ["manual evidence drafts", ["run", "manual:evidence-drafts", "--", `--base-url=${baseUrl}`, `--site-name=${siteName}`, `--reviewer=${generatedBy}`]],
    ["manual evidence readiness", ["run", "manual:evidence-readiness", "--", `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["field readiness", ["run", "field:readiness", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["field risk register", ["run", "field:risk-register", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["field action board", ["run", "field:action-board", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["field gate closure map", ["run", "field:gate-closure-map", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["field owner briefs", ["run", "field:owner-briefs", "--", `--base-url=${baseUrl}`, `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["completion audit", ["run", "completion:audit"]],
    ["field closure plan", ["run", "field:closure-plan", "--", `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
    ["handover index", ["run", "handover:index", "--", `--generated-by=${generatedBy}`, `--site-name=${siteName}`]],
  ].map(([label, args]) => runCommand(label, args));

  const evidenceRefs = latestEvidenceRefs();
  const completion = readLatestJsonManifest("artifacts/completion-audit");
  const handoverIndex = readLatestJsonManifest("artifacts/handover-index");
  const fieldRiskRegister = readLatestJsonManifest("artifacts/field-risk-register");
  const fieldActionBoard = readLatestJsonManifest("artifacts/field-action-board");
  const fieldGateClosureMap = readLatestJsonManifest("artifacts/field-gate-closure-map");
  const fieldOwnerBriefs = readLatestJsonManifest("artifacts/field-owner-briefs");
  const failedCommands = commands.filter((item) => item.exitCode !== 0);
  const packageStatus = failedCommands.length > 0 ? "FAILED" : handoverIndex?.data?.status || "UNKNOWN";
  const canMarkGoalComplete = Boolean(completion?.data?.canMarkGoalComplete);
  const controlBoardSafetyStatus = latestControlBoardSafetyStatus();
  const git = buildGitState();
  const fieldEvidenceSummary = buildFieldEvidenceSummary();
  const fieldEvidenceOpenItems = buildFieldEvidenceOpenItems(fieldEvidenceSummary);
  const fieldEvidenceCommandRunbook = buildFieldEvidenceCommandRunbook(fieldEvidenceOpenItems);
  const fieldEvidenceFollowUps = buildFieldEvidenceFollowUps(fieldEvidenceSummary);
  const manualEvidence = manualEvidenceRefs();
  const openManualEvidence = manualEvidence.filter((item) => item.required && item.status !== "PRESENT");
  const knownLimitations = knownFieldLimitations();
  const strictFailureReasons = [];
  if (failedCommands.length > 0) {
    strictFailureReasons.push(`${failedCommands.length} package command(s) failed.`);
  }
  if (git.clean !== true) {
    strictFailureReasons.push("working tree is not clean.");
  }
  if (git.branch !== "dev") {
    strictFailureReasons.push(`git branch is ${git.branch || "unknown"} instead of dev.`);
  }
  if (git.upstream !== "origin/dev") {
    strictFailureReasons.push(`git upstream is ${git.upstream || "missing"} instead of origin/dev.`);
  }
  if (git.pushed !== true) {
    strictFailureReasons.push(`git commit ${git.commit || "unknown"} is not proven pushed to origin/dev ${git.upstreamCommit || "missing"}.`);
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
  strictFailureReasons.push(
    ...fieldActionArtifactStrictFailures({
      fieldRiskRegister,
      fieldActionBoard,
      fieldGateClosureMap,
      fieldOwnerBriefs,
    }),
  );
  const residualFieldGates = buildResidualFieldGates({
    canMarkGoalComplete,
    strictFailureReasons,
    openManualEvidence,
    fieldEvidenceOpenItems,
    fieldEvidenceFollowUps,
    knownLimitations,
  });
  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: os.hostname(),
    baseUrl,
    git,
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
    knownFieldLimitations: knownLimitations,
    residualFieldGates,
    fieldEvidenceSummary,
    fieldEvidenceFollowUps,
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
