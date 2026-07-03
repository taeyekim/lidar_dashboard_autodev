const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { isPlaceholderFieldText } = require("./generate-final-status-report");

const root = path.join(__dirname, "..", "..", "..");

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

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildOwnerBrief(ownerGroup, actionBoardPath) {
  const items = ownerGroup.items || [];
  const uniqueCommands = ownerGroup.commands || [];
  return [
    `# Field Owner Brief - ${ownerGroup.owner}`,
    "",
    `- Owner: ${ownerGroup.owner}`,
    `- Open item count: ${ownerGroup.total}`,
    `- Priority counts: ${JSON.stringify(ownerGroup.byPriority || {})}`,
    `- Phase counts: ${JSON.stringify(ownerGroup.byPhase || {})}`,
    `- Action type counts: ${JSON.stringify(ownerGroup.byActionType || {})}`,
    `- Source action board: ${actionBoardPath || "missing"}`,
    "",
    "## Guardrails",
    "",
    "- This owner brief is an execution aid, not completion evidence.",
    "- Do not include secret values in filled evidence or screenshots.",
    "- Final close still requires final:status READY_TO_CLOSE and canMarkGoalComplete=true.",
    "",
    "## Commands",
    "",
    "| Command |",
    "| --- |",
    ...(uniqueCommands.length > 0
      ? uniqueCommands.map((command) => `| \`${markdownCell(command)}\` |`)
      : ["| No commands required. |"]),
    "",
    "## Items",
    "",
    "| ID | Priority | Phase | Action Type | Category | Status | Message | Close When | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(items.length > 0
      ? items.map(
          (item) =>
            `| ${item.id} | ${item.priority} | ${markdownCell(item.phase)} | ${markdownCell(item.actionType)} | ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} |`,
        )
      : ["| none | - | - | - | - | PASS | No open items. | - | - |"]),
    "",
  ].join("\n");
}

function buildMetadataOwnerGroup(generatedBy, siteName, baseUrl) {
  const items = [];
  if (isPlaceholderFieldText(generatedBy)) {
    items.push({
      id: "META-001",
      priority: "P1",
      phase: "Field Review",
      actionType: "FIELD_ACTION_REQUIRED",
      category: "Field Metadata",
      status: "PLACEHOLDER_METADATA",
      message: "Generated-by reviewer metadata is missing or placeholder.",
      closeWhen: "Set FIELD_REVIEWER to a concrete field reviewer and rerun field:owner-briefs.",
      evidence: null,
    });
  }
  if (isPlaceholderFieldText(siteName)) {
    items.push({
      id: "META-002",
      priority: "P1",
      phase: "Field Review",
      actionType: "FIELD_ACTION_REQUIRED",
      category: "Field Metadata",
      status: "PLACEHOLDER_METADATA",
      message: "Site name metadata is missing or placeholder.",
      closeWhen: "Set FIELD_SITE_NAME to a concrete delivery site and rerun field:owner-briefs.",
      evidence: null,
    });
  }
  if (items.length === 0) return null;
  return {
    owner: "PM/QA",
    total: items.length,
    byPriority: { P1: items.length },
    byPhase: { "Field Review": items.length },
    byActionType: { FIELD_ACTION_REQUIRED: items.length },
    commands: [`npm.cmd run field:owner-briefs -- --base-url=${baseUrl} --site-name="$env:FIELD_SITE_NAME" --generated-by="$env:FIELD_REVIEWER"`],
    items,
  };
}

function buildManifest(input = {}) {
  const actionBoard = Object.prototype.hasOwnProperty.call(input, "actionBoard")
    ? input.actionBoard
    : readLatestJsonManifest("artifacts/field-action-board");
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = input.siteName || actionBoard?.data?.siteName || "unspecified";
  const baseUrl = input.baseUrl || actionBoard?.data?.baseUrl || "http://localhost:8080";
  const metadataOwnerGroup = buildMetadataOwnerGroup(generatedBy, siteName, baseUrl);
  const ownerGroups = [
    ...(actionBoard?.data?.ownerGroups || []),
    ...(metadataOwnerGroup ? [metadataOwnerGroup] : []),
  ];
  const briefs = ownerGroups.map((group) => ({
    owner: group.owner,
    fileName: `${slug(group.owner)}.md`,
    openItemCount: group.total || 0,
    priorityCounts: group.byPriority || {},
    phaseCounts: group.byPhase || {},
    actionTypeCounts: group.byActionType || {},
    commandCount: (group.commands || []).length,
  }));

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: !actionBoard ? "ACTION_BOARD_MISSING" : briefs.length > 0 ? "OPEN" : "READY_TO_CLOSE",
    sourceFieldActionBoard: actionBoard?.path || null,
    ownerCount: briefs.length,
    openItemCount: briefs.reduce((sum, item) => sum + item.openItemCount, 0),
    briefs,
    git: {
      branch: input.git?.branch || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: input.git?.commit || gitValue(["rev-parse", "HEAD"]),
      clean: input.git?.clean ?? gitValue(["status", "--short"]) === "",
    },
    guardrails: [
      "Owner briefs split the latest field action board for field execution.",
      "They do not replace manual evidence, scanner evidence, runtime evidence, or hardware rehearsal evidence.",
      "Regenerate briefs after final:status and field:action-board are refreshed.",
    ],
  };
}

function buildMarkdown(manifest) {
  return [
    "# Field Owner Briefs",
    "",
    `- Status: ${manifest.status}`,
    `- Owner count: ${manifest.ownerCount}`,
    `- Open item count: ${manifest.openItemCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Source field action board: ${manifest.sourceFieldActionBoard || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Brief Files",
    "",
    "| Owner | File | Open Items | Commands | Priority Counts | Phase Counts | Action Type Counts |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.briefs.length > 0
      ? manifest.briefs.map(
          (item) =>
            `| ${markdownCell(item.owner)} | \`${markdownCell(item.fileName)}\` | ${item.openItemCount} | ${item.commandCount} | ${markdownCell(JSON.stringify(item.priorityCounts))} | ${markdownCell(JSON.stringify(item.phaseCounts))} | ${markdownCell(JSON.stringify(item.actionTypeCounts))} |`,
        )
      : ["| none | - | 0 | 0 | {} | {} | {} |"]),
    "",
  ].join("\n");
}

function writeOwnerBriefs(outputDir, ownerGroups, actionBoardPath) {
  const groups = ownerGroups || [];
  return groups.map((group) => {
    const fileName = `${slug(group.owner)}.md`;
    fs.writeFileSync(path.join(outputDir, fileName), buildOwnerBrief(group, actionBoardPath || null));
    return fileName;
  });
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-owner-briefs");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const actionBoard = readLatestJsonManifest("artifacts/field-action-board");
  const manifest = buildManifest({
    actionBoard,
    baseUrl: argValue("base-url", undefined),
    siteName: argValue("site-name", undefined),
    generatedBy: argValue("generated-by", undefined),
  });

  ensureDir(outputDir);
  const metadataOwnerGroup = buildMetadataOwnerGroup(
    manifest.generatedBy,
    manifest.siteName,
    manifest.baseUrl,
  );
  const ownerGroups = [
    ...(actionBoard?.data?.ownerGroups || []),
    ...(metadataOwnerGroup ? [metadataOwnerGroup] : []),
  ];
  writeOwnerBriefs(outputDir, ownerGroups, actionBoard?.path || null);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field owner briefs written to ${path.relative(root, outputDir)}`);
  console.log(`field owner briefs status: ${manifest.status}`);
  if (manifest.openItemCount > 0) console.log(`open item count: ${manifest.openItemCount}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMetadataOwnerGroup,
  buildManifest,
  buildMarkdown,
  buildOwnerBrief,
  slug,
};
