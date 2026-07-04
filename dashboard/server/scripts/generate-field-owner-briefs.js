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

function buildGitState(inputGit = null) {
  if (inputGit) {
    const upstreamCommit = inputGit.upstreamCommit ?? inputGit.remoteCommit ?? null;
    return {
      branch: inputGit.branch,
      commit: inputGit.commit,
      clean: inputGit.clean,
      upstream: inputGit.upstream || null,
      upstreamCommit,
      pushed: inputGit.pushed ?? Boolean(inputGit.commit && upstreamCommit && inputGit.commit === upstreamCommit),
    };
  }

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

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function ownerExecutionQueue(ownerGroup, executionQueue = []) {
  const commands = new Set(ownerGroup.commands || []);
  return (executionQueue || []).filter((item) => commands.has(item.command));
}

function formatPrerequisites(prerequisites) {
  if (!prerequisites) return "-";
  const parts = [
    prerequisites.env?.length ? `env=${prerequisites.env.join(", ")}` : "",
    prerequisites.evidence?.length ? `evidence=${prerequisites.evidence.join(", ")}` : "",
    prerequisites.runtime?.length ? `runtime=${prerequisites.runtime.join(", ")}` : "",
    prerequisites.closeout?.length ? `closeout=${prerequisites.closeout.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "-";
}

function buildOwnerBrief(ownerGroup, actionBoardPath, executionQueue = []) {
  const items = ownerGroup.items || [];
  const uniqueCommands = ownerGroup.commands || [];
  const queueItems = ownerExecutionQueue(ownerGroup, executionQueue);
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
    "## Execution Queue",
    "",
    "| Order | Phase | Priority | Gate Count | Prerequisites | Command |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(queueItems.length > 0
      ? queueItems.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.phase)} | ${markdownCell(item.priority)} | ${item.gateCount} | ${markdownCell(formatPrerequisites(item.prerequisites))} | \`${markdownCell(item.command)}\` |`,
        )
      : ["| - | - | - | 0 | - | No queued commands for this owner. |"]),
    "",
    "## Items",
    "",
    "| ID | Priority | Phase | Action Type | Category | Status | Message | Close When | Evidence | Scanner | Risk Acceptance Evidence | Runtime Note | Prerequisites | Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(items.length > 0
      ? items.map(
          (item) =>
            `| ${item.id} | ${item.priority} | ${markdownCell(item.phase)} | ${markdownCell(item.actionType)} | ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} | ${markdownCell(item.scanner || "-")} | ${item.closeoutCommands?.riskAcceptanceEvidence ? `\`${markdownCell(item.closeoutCommands.riskAcceptanceEvidence)}\`` : "-"} | ${markdownCell(item.runtimeNote || "-")} | ${markdownCell(formatPrerequisites(item.prerequisites))} | ${item.command ? `\`${markdownCell(item.command)}\`` : "-"} |`,
        )
      : ["| none | - | - | - | - | PASS | No open items. | - | - | - | - | - | - | - |"]),
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
    executionQueueCount: ownerExecutionQueue(group, actionBoard?.data?.executionQueue || []).length,
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
    git: buildGitState(input.git),
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
    "| Owner | File | Open Items | Commands | Queue Items | Priority Counts | Phase Counts | Action Type Counts |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.briefs.length > 0
      ? manifest.briefs.map(
          (item) =>
            `| ${markdownCell(item.owner)} | \`${markdownCell(item.fileName)}\` | ${item.openItemCount} | ${item.commandCount} | ${item.executionQueueCount} | ${markdownCell(JSON.stringify(item.priorityCounts))} | ${markdownCell(JSON.stringify(item.phaseCounts))} | ${markdownCell(JSON.stringify(item.actionTypeCounts))} |`,
        )
      : ["| none | - | 0 | 0 | 0 | {} | {} | {} |"]),
    "",
  ].join("\n");
}

function writeOwnerBriefs(outputDir, ownerGroups, actionBoardPath, executionQueue = []) {
  const groups = ownerGroups || [];
  return groups.map((group) => {
    const fileName = `${slug(group.owner)}.md`;
    fs.writeFileSync(path.join(outputDir, fileName), buildOwnerBrief(group, actionBoardPath || null, executionQueue));
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
  writeOwnerBriefs(outputDir, ownerGroups, actionBoard?.path || null, actionBoard?.data?.executionQueue || []);
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
  formatPrerequisites,
  ownerExecutionQueue,
  slug,
};
