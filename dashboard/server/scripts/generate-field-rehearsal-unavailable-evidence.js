const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildGitState } = require("./generate-final-status-report");

const root = path.join(__dirname, "..", "..", "..");

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function buildResult(area, reason, requiredCommand, nextActions, replacementOwner, targetRecheckDate) {
  return {
    name: `${area} field rehearsal unavailable`,
    status: "REVIEW",
    reason,
    requiredCommand,
    replacementOwner,
    targetRecheckDate,
    nextActions,
  };
}

function isPlaceholderValue(value) {
  return /^(?:-|n\/a|na|none|null|tbd|todo|pending|unknown|unassigned|required_before_handover)$/i.test(
    String(value || "").trim(),
  );
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function ownerQualityStatus(value) {
  return value && !isPlaceholderValue(value) ? "RECORDED" : "REVIEW";
}

function recheckQualityStatus(value) {
  return value && !isPlaceholderValue(value) && isIsoDate(value) ? "SCHEDULED" : "REVIEW";
}

function writeManifest(config, runId, options) {
  const outputDir = path.join(root, config.outputRoot, runId);
  ensureDir(outputDir);
  const result = buildResult(
    config.area,
    options.reason,
    config.requiredCommand,
    config.nextActions,
    options.replacementOwner,
    options.targetRecheckDate,
  );
  const manifest = {
    generatedAt: new Date().toISOString(),
    evidenceType: "FIELD_REHEARSAL_UNAVAILABLE",
    area: config.area,
    reviewer: options.reviewer,
    siteName: options.siteName,
    hostName: os.hostname(),
    git: buildGitState(),
    unavailableAcceptance: {
      reason: options.reason,
      replacementOwner: options.replacementOwner,
      targetRecheckDate: options.targetRecheckDate,
      approvalNote: options.approvalNote,
      ownerStatus: ownerQualityStatus(options.replacementOwner),
      recheckStatus: recheckQualityStatus(options.targetRecheckDate),
    },
    results: [result],
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(outputDir, "manifest.md"),
    [
      `# ${config.area} Field Rehearsal Unavailable`,
      "",
      `- Generated at: ${manifest.generatedAt}`,
      `- Reviewer: ${options.reviewer}`,
      `- Site name: ${options.siteName}`,
      `- Host name: ${manifest.hostName}`,
      `- Git commit: ${manifest.git.commit}`,
      `- Git branch: ${manifest.git.branch}`,
      `- Git upstream: ${manifest.git.upstream || "missing"}`,
      `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
      `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
      `- Replacement owner: ${options.replacementOwner}`,
      `- Target recheck date: ${options.targetRecheckDate}`,
      `- Approval note: ${options.approvalNote || "none"}`,
      `- Owner status: ${manifest.unavailableAcceptance.ownerStatus}`,
      `- Recheck status: ${manifest.unavailableAcceptance.recheckStatus}`,
      "",
      "## Result",
      "",
      "| Status | Check | Reason | Required Command | Replacement Owner | Target Recheck Date |",
      "| --- | --- | --- | --- | --- | --- |",
      `| REVIEW | ${result.name} | ${options.reason} | \`${config.requiredCommand}\` | ${options.replacementOwner} | ${options.targetRecheckDate} |`,
      "",
      "## Next Actions",
      "",
      ...config.nextActions.map((item) => `- ${item}`),
      "",
    ].join("\n"),
  );
  return path.relative(root, path.join(outputDir, "manifest.json")).replace(/\\/g, "/");
}

function main() {
  const runId = timestampForPath();
  const reason = argValue(
    "reason",
    "Docker runtime, field network, or delivery hardware was not available on this workstation.",
  );
  const reviewer = argValue("reviewer", process.env.USERNAME || process.env.USER || "Codex");
  const siteName = argValue("site-name", "Local development workstation");
  const replacementOwner = argValue("replacement-owner", "UNASSIGNED");
  const targetRecheckDate = argValue("target-recheck-date", "REQUIRED_BEFORE_HANDOVER");
  const approvalNote = argValue("approval-note", "");

  const configs = [
    {
      area: "DB And Prisma",
      outputRoot: "artifacts/field-db-rehearsal",
      requiredCommand: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080",
      nextActions: [
        "Start the delivery Docker stack or field API endpoint.",
        "Run DB deploy/seed only after the field PostgreSQL target is confirmed.",
        "Attach the PASS manifest from scripts/db-field-rehearsal.ps1 to replace this REVIEW evidence.",
      ],
    },
    {
      area: "Lidar Ingest",
      outputRoot: "artifacts/field-lidar-rehearsal",
      requiredCommand: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl http://localhost:8080",
      nextActions: [
        "Start the delivery API entrypoint and confirm the lidar ingest device key policy.",
        "Run representative normal-driving, wrong-way-level-1, wrong-way-level-2, and situation-ended payloads.",
        "Attach the PASS manifest from scripts/lidar-ingest-rehearsal.ps1 to replace this REVIEW evidence.",
      ],
    },
    {
      area: "Control Board TCP",
      outputRoot: "artifacts/field-control-board-rehearsal",
      requiredCommand: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080",
      nextActions: [
        "Confirm operator credentials and CONTROL_BOARD_DRY_RUN mode before rehearsal.",
        "Use -AllowLiveTcp only after field IP/port and hardware approval are confirmed.",
        "Attach the PASS manifest from scripts/control-board-field-rehearsal.ps1 to replace this REVIEW evidence.",
      ],
    },
  ];

  const manifests = configs.map((config) =>
    writeManifest(config, runId, {
      reason,
      reviewer,
      siteName,
      replacementOwner,
      targetRecheckDate,
      approvalNote,
    }),
  );
  console.log("field rehearsal unavailable evidence written:");
  manifests.forEach((manifest) => console.log(`- ${manifest}`));
}

if (require.main === module) {
  main();
}
