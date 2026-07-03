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

function manifestStatus(entry, manifest) {
  if (!manifest) return "MISSING";
  if (entry.stale) return "STALE";
  const data = manifest.data || {};
  if (data.status) return data.status;
  if (data.handoverSummary?.status) return data.handoverSummary.status;
  if (data.canMarkGoalComplete === false) return "REVIEW";
  if (data.results?.some((item) => item.status && item.status !== "PASS")) return "REVIEW";
  if (data.checks?.some((item) => item.status === "skipped" || item.exitCode !== 0)) return "REVIEW";
  if (entry.required && !manifest.path) return "MISSING";
  return "PRESENT";
}

function indexEntry(entry) {
  const manifest = readLatestJsonManifest(entry.outputRoot);
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
    sourceDeliveryManifest: manifest?.data?.sourceDeliveryManifest || null,
  };
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
      command: "npm run field:readiness",
      notes: "Pre-delivery readiness report for .env posture, Docker daemon, Nginx/API health, control-board TCP live values, Swagger allowlist, and optional scanner availability.",
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
  const consistencyIssues = [];

  if (deliveryEntry?.manifestPath && completionEntry?.manifestPath) {
    if (completionEntry.sourceDeliveryManifest !== deliveryEntry.manifestPath) {
      completionEntry.status = "STALE";
      consistencyIssues.push(
        `Completion Audit sourceDeliveryManifest (${completionEntry.sourceDeliveryManifest || "missing"}) does not match latest Delivery Evidence (${deliveryEntry.manifestPath}). Run npm run completion:audit again.`,
      );
    }
  }

  const missingRequired = entries.filter((entry) => entry.required && !entry.manifestPath);
  const staleEntries = entries.filter((entry) => entry.status === "STALE");
  const reviewEntries = entries.filter((entry) => ["REVIEW", "AUTOMATED_CHECKS_REVIEW", "FIELD_VERIFICATION_REQUIRED", "PASS_WITH_SKIPS"].includes(entry.status));
  const completion = entries.find((entry) => entry.area === "Completion Audit");
  const completionManifest = completion?.manifestPath ? readLatestJsonManifest("artifacts/completion-audit") : null;

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: options.siteName || "unspecified",
    hostName: os.hostname(),
    status: missingRequired.length > 0 ? "INCOMPLETE" : staleEntries.length > 0 ? "STALE" : reviewEntries.length > 0 ? "REVIEW" : "READY",
    canMarkGoalComplete: Boolean(completionManifest?.data?.canMarkGoalComplete),
    counts: {
      totalEntries: entries.length,
      missingRequiredCount: missingRequired.length,
      staleEntryCount: staleEntries.length,
      reviewEntryCount: reviewEntries.length,
      attachableManifestCount: entries.filter((entry) => entry.attach).length,
    },
    entries,
    missingRequiredAreas: missingRequired.map((entry) => entry.area),
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
    "",
    "## Evidence Entries",
    "",
    "| Area | Status | Required | Manifest | Command |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.entries.map((entry) =>
      `| ${entry.area} | ${entry.status} | ${entry.required ? "yes" : "no"} | ${entry.manifestPath ? `\`${entry.manifestPath}\`` : "missing"} | \`${entry.command}\` |`,
    ),
    "",
    "## Missing Required Areas",
    "",
    ...(manifest.missingRequiredAreas.length > 0 ? manifest.missingRequiredAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Stale Areas",
    "",
    ...(manifest.staleAreas.length > 0 ? manifest.staleAreas.map((area) => `- ${area}`) : ["- none"]),
    "",
    "## Review Areas",
    "",
    ...(manifest.reviewAreas.length > 0 ? manifest.reviewAreas.map((area) => `- ${area}`) : ["- none"]),
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
