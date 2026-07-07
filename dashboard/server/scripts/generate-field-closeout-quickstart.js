const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { resolveFieldBaseUrl } = require("./field-env");

const root = path.join(__dirname, "..", "..", "..");
const PHASE_ORDER = [
  "Field Env Closeout",
  "Field Preflight",
  "Security Evidence",
  "Field Rehearsal",
  "Field Acceptance",
  "Handover Package",
  "Final Status",
  "Field Review",
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.stdout.trim();
}

function buildGitState(inputGit = null) {
  if (inputGit) return inputGit;
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

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function flattenPrerequisites(actionItems) {
  const env = [];
  const evidence = [];
  const runtime = [];
  const closeout = [];
  actionItems.forEach((item) => {
    env.push(...(item.prerequisites?.env || []));
    evidence.push(...(item.prerequisites?.evidence || []));
    runtime.push(...(item.prerequisites?.runtime || []));
    closeout.push(...(item.prerequisites?.closeout || []));
  });
  return {
    env: uniq(env).sort(),
    evidence: uniq(evidence).sort(),
    runtime: uniq(runtime).sort(),
    closeout: uniq(closeout).sort(),
  };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
}

function phaseRank(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  return index >= 0 ? index : PHASE_ORDER.length;
}

function buildPhaseQueue(actionItems) {
  return groupBy(actionItems, (item) => item.phase || "Field Review")
    .sort((a, b) => phaseRank(a.key) - phaseRank(b.key) || a.key.localeCompare(b.key))
    .map((group, index) => ({
      order: index + 1,
      phase: group.key,
      itemCount: group.items.length,
      owners: uniq(group.items.map((item) => item.owner)).sort(),
      priorityCounts: group.items.reduce((acc, item) => {
        const key = item.priority || "P3";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      commands: uniq(group.items.map((item) => item.command)).slice(0, 6),
      envKeys: uniq(group.items.flatMap((item) => item.prerequisites?.env || [])).sort(),
      evidence: uniq(group.items.flatMap((item) => item.prerequisites?.evidence || [])).sort(),
      doneWhen: group.items[0]?.closeWhen || "Phase gates are closed and final status is refreshed.",
    }));
}

function buildOwnerQueue(actionBoard) {
  return (actionBoard?.data?.ownerGroups || []).map((group) => ({
    owner: group.owner,
    openItemCount: group.total || 0,
    priorityCounts: group.byPriority || {},
    commands: group.commands || [],
    firstCommand: (group.commands || [])[0] || "",
  }));
}

function buildManifest(input = {}) {
  const actionBoard = Object.prototype.hasOwnProperty.call(input, "actionBoard")
    ? input.actionBoard
    : readLatestJsonManifest("artifacts/field-action-board");
  const classification = Object.prototype.hasOwnProperty.call(input, "classification")
    ? input.classification
    : readLatestJsonManifest("artifacts/final-gate-classification");
  const finalStatus = Object.prototype.hasOwnProperty.call(input, "finalStatus")
    ? input.finalStatus
    : readLatestJsonManifest("artifacts/final-status");
  const actionItems = actionBoard?.data?.actionItems || [];
  const baseUrl = resolveFieldBaseUrl(input.baseUrl, actionBoard?.data?.baseUrl, finalStatus?.data?.baseUrl);
  const prerequisites = flattenPrerequisites(actionItems);
  const phaseQueue = buildPhaseQueue(actionItems);
  const ownerQueue = buildOwnerQueue(actionBoard);
  const summary = classification?.data?.summary || {};
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: input.siteName || actionBoard?.data?.siteName || finalStatus?.data?.siteName || "unspecified",
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: actionItems.length > 0 ? "OPEN" : actionBoard ? "READY_TO_CLOSE" : "ACTION_BOARD_MISSING",
    sourceFinalStatus: finalStatus?.path || null,
    sourceFieldActionBoard: actionBoard?.path || null,
    sourceFinalGateClassification: classification?.path || null,
    remainingGateCount: finalStatus?.data?.remainingGates?.length ?? null,
    openActionCount: actionItems.length,
    bucketGateCounts: summary.bucketGateCounts || {},
    fieldRequiredCount: summary.fieldRequiredCount ?? null,
    securityRequiredCount: summary.bucketGateCounts?.security_tooling ?? null,
    reviewRequiredCount: (finalStatus?.data?.remainingGates || []).filter((gate) => gate.actionType === "REVIEW_REQUIRED").length,
    prerequisites,
    phaseQueue,
    ownerQueue,
    commandQueue: uniq(phaseQueue.flatMap((phase) => phase.commands)),
    guardrails: [
      "Fill only .env values locally; do not paste secret values into this artifact.",
      "Keep CONTROL_BOARD_DRY_RUN=true until the hardware owner approves LIVE TCP.",
      "Do not dispatch external CI from this quickstart; use read-only ci:status unless a closeout window is approved.",
      "Refresh final:status, field:action-board, field:owner-briefs, and field:closeout-quickstart after each evidence pass.",
    ],
    git: buildGitState(input.git),
  };
}

function buildMarkdown(manifest) {
  return [
    "# Field Closeout Quickstart",
    "",
    `- Status: ${manifest.status}`,
    `- Remaining gate count: ${manifest.remainingGateCount ?? "unknown"}`,
    `- Open action count: ${manifest.openActionCount}`,
    `- Field-required count: ${manifest.fieldRequiredCount ?? "unknown"}`,
    `- Security-tooling count: ${manifest.securityRequiredCount ?? "unknown"}`,
    `- Review-required count: ${manifest.reviewRequiredCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Source final status: ${manifest.sourceFinalStatus || "missing"}`,
    `- Source field action board: ${manifest.sourceFieldActionBoard || "missing"}`,
    `- Source final gate classification: ${manifest.sourceFinalGateClassification || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Env Keys To Fill",
    "",
    ...(manifest.prerequisites.env.length > 0
      ? manifest.prerequisites.env.map((key) => `- ${key}`)
      : ["- none"]),
    "",
    "## Evidence Files To Prepare",
    "",
    ...(manifest.prerequisites.evidence.length > 0
      ? manifest.prerequisites.evidence.map((item) => `- \`${item}\``)
      : ["- none"]),
    "",
    "## Runtime Prerequisites",
    "",
    ...(manifest.prerequisites.runtime.length > 0
      ? manifest.prerequisites.runtime.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Phase Queue",
    "",
    "| Order | Phase | Items | Owners | Priority Counts | Env Keys | Evidence | First Commands | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.phaseQueue.length > 0
      ? manifest.phaseQueue.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.phase)} | ${item.itemCount} | ${markdownCell(item.owners.join(", "))} | ${markdownCell(JSON.stringify(item.priorityCounts))} | ${markdownCell(item.envKeys.join(", ") || "-")} | ${markdownCell(item.evidence.join(", ") || "-")} | ${markdownCell(item.commands.join(" && ") || "-")} | ${markdownCell(item.doneWhen)} |`,
        )
      : ["| - | - | 0 | - | {} | - | - | - | - |"]),
    "",
    "## Owner Queue",
    "",
    "| Owner | Open Items | Priority Counts | First Command |",
    "| --- | --- | --- | --- |",
    ...(manifest.ownerQueue.length > 0
      ? manifest.ownerQueue.map(
          (item) =>
            `| ${markdownCell(item.owner)} | ${item.openItemCount} | ${markdownCell(JSON.stringify(item.priorityCounts))} | ${item.firstCommand ? `\`${markdownCell(item.firstCommand)}\`` : "-"} |`,
        )
      : ["| none | 0 | {} | - |"]),
    "",
    "## Command Queue",
    "",
    ...(manifest.commandQueue.length > 0
      ? manifest.commandQueue.map((command, index) => `${index + 1}. \`${command}\``)
      : ["No commands queued."]),
    "",
  ].join("\n");
}

function writeQuickstart(manifest, outputDir) {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-closeout-quickstart");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildManifest({
    baseUrl: argValue("base-url", undefined),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
  });
  writeQuickstart(manifest, outputDir);
  console.log(`field closeout quickstart written to ${path.relative(root, outputDir)}`);
  console.log(`field closeout quickstart status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManifest,
  buildMarkdown,
  flattenPrerequisites,
  buildPhaseQueue,
};
