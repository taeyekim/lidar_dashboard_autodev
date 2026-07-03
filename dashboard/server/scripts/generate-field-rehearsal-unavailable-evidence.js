const fs = require("fs");
const os = require("os");
const path = require("path");

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

function buildResult(area, reason, requiredCommand, nextActions) {
  return {
    name: `${area} field rehearsal unavailable`,
    status: "REVIEW",
    reason,
    requiredCommand,
    nextActions,
  };
}

function writeManifest(config, runId, reason, reviewer, siteName) {
  const outputDir = path.join(root, config.outputRoot, runId);
  ensureDir(outputDir);
  const result = buildResult(config.area, reason, config.requiredCommand, config.nextActions);
  const manifest = {
    generatedAt: new Date().toISOString(),
    evidenceType: "FIELD_REHEARSAL_UNAVAILABLE",
    area: config.area,
    reviewer,
    siteName,
    hostName: os.hostname(),
    results: [result],
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(outputDir, "manifest.md"),
    [
      `# ${config.area} Field Rehearsal Unavailable`,
      "",
      `- Generated at: ${manifest.generatedAt}`,
      `- Reviewer: ${reviewer}`,
      `- Site name: ${siteName}`,
      `- Host name: ${manifest.hostName}`,
      "",
      "## Result",
      "",
      "| Status | Check | Reason | Required Command |",
      "| --- | --- | --- | --- |",
      `| REVIEW | ${result.name} | ${reason} | \`${config.requiredCommand}\` |`,
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

  const manifests = configs.map((config) => writeManifest(config, runId, reason, reviewer, siteName));
  console.log("field rehearsal unavailable evidence written:");
  manifests.forEach((manifest) => console.log(`- ${manifest}`));
}

if (require.main === module) {
  main();
}
