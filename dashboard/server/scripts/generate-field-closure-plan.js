const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  readLatestJsonManifest,
  timestampForPath,
} = require("./generate-delivery-evidence");

const root = path.join(__dirname, "..", "..", "..");

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
    "Field Preflight": ["npm.cmd run field:preflight -- -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\""],
    "Field Acceptance": ["npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -Reviewer \"field-reviewer-name\" -SiteName \"delivery-site-name\""],
    "Field Readiness": ["npm.cmd run field:readiness -- --base-url=http://localhost:8080 --generated-by=\"field-reviewer-name\" --site-name=\"delivery-site-name\""],
    "DB And Prisma Field Rehearsal": ["powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080"],
    "Lidar Ingest Field Rehearsal": ["powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl http://localhost:8080"],
    "Control Board Field Rehearsal": ["powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080"],
    "Runtime Evidence": ["npm.cmd run runtime:evidence -- --run-smoke --use-existing-stack --base-url=http://localhost:8080"],
    "Security Evidence": ["npm.cmd run security:evidence -- --include-container-images --include-zap --target-url=http://localhost:8080"],
  };

  const doneWhen = {
    "Delivery Evidence": "Latest delivery manifest has failedCommandCount=0 and no stale completion audit reference.",
    "Completion Audit": "Latest completion audit references the latest delivery manifest and canMarkGoalComplete reflects current evidence.",
    "Field Preflight": "Preflight manifest has no REVIEW or SKIPPED checks required by the field acceptance policy.",
    "Field Acceptance": "Field acceptance manifest is PASS and has no skipped/review steps.",
    "Field Readiness": "Readiness report is PASS or explicitly accepted PASS_WITH_SKIPS, with Docker daemon, Nginx/API health, .env posture, control-board TCP values, cookie security, and Swagger allowlist reviewed.",
    "DB And Prisma Field Rehearsal": "DB field rehearsal manifest results are all PASS against the delivery runtime.",
    "Lidar Ingest Field Rehearsal": "LiDAR rehearsal manifest proves normal-driving de-duplication and wrong-way command creation using representative payloads.",
    "Control Board Field Rehearsal": "Control-board rehearsal manifest proves DRY_RUN command lifecycle or approved LIVE_TCP command/ACK evidence.",
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

function buildClosurePlan(options = {}) {
  const handover = readLatestJsonManifest("artifacts/handover-index");
  const completion = readLatestJsonManifest("artifacts/completion-audit");
  const fieldReadiness = readLatestJsonManifest("artifacts/field-readiness");
  const entries = handover?.data?.entries || [];
  const openEntries = entries.filter((entry) =>
    ["MISSING", "STALE", "REVIEW", "AUTOMATED_CHECKS_REVIEW", "FIELD_VERIFICATION_REQUIRED", "PASS_WITH_SKIPS"].includes(entry.status),
  );

  const completionBlockers = completion?.data?.completionBlockers || [];
  const actions = openEntries.map(actionForEntry);

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: options.siteName || handover?.data?.siteName || "unspecified",
    hostName: os.hostname(),
    sourceHandoverIndex: handover?.path || null,
    sourceCompletionAudit: completion?.path || null,
    status: actions.length > 0 ? "OPEN" : "READY",
    canMarkGoalComplete: Boolean(completion?.data?.canMarkGoalComplete),
    controlBoardSafetyStatus:
      fieldReadiness?.data?.env?.controlBoardSafetyStatus ||
      completion?.data?.controlBoardSafetyStatus ||
      handover?.data?.controlBoardSafetyStatus ||
      "UNKNOWN",
    counts: {
      openActionCount: actions.length,
      completionBlockerCount: completionBlockers.length,
    },
    completionBlockers,
    actions,
    finalCommands: [
      "npm.cmd run delivery:evidence",
      "npm.cmd run field:readiness -- --base-url=http://localhost:8080",
      "npm.cmd run completion:audit",
      "npm.cmd run handover:index",
      "npm.cmd run field:closure-plan",
    ],
  };
}

function buildMarkdown(manifest) {
  return [
    "# Field Closure Plan",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus}`,
    `- Source handover index: ${manifest.sourceHandoverIndex || "missing"}`,
    `- Source completion audit: ${manifest.sourceCompletionAudit || "missing"}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    "",
    "## Counts",
    "",
    `- Open actions: ${manifest.counts.openActionCount}`,
    `- Completion blockers: ${manifest.counts.completionBlockerCount}`,
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
    "## Completion Blockers",
    "",
    ...(manifest.completionBlockers.length > 0
      ? manifest.completionBlockers.map((blocker) => `- [${blocker.category || "unknown"}] ${blocker.message || blocker}`)
      : ["- none"]),
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
  buildClosurePlan,
};
