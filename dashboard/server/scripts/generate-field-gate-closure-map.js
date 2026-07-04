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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function incrementCount(counts, key) {
  if (!key) return counts;
  return { ...counts, [key]: (counts[key] || 0) + 1 };
}

function buildCommandGroups(actionBoard) {
  const items = actionBoard?.data?.actionItems || [];
  const executionQueueOrder = new Map(
    (actionBoard?.data?.executionQueue || []).map((item) => [
      `${item.phase}::${item.command}`,
      {
        executionOrder: item.order,
        executionPriority: item.priority,
        executionGateCount: item.gateCount,
        prerequisites: item.prerequisites || null,
      },
    ]),
  );
  return Object.values(
    items.reduce((acc, item) => {
      const command = item.command || "manual-review";
      const groupKey = `${item.phase}::${command}`;
      if (!acc[groupKey]) {
        const queueItem = executionQueueOrder.get(groupKey) || {};
        acc[groupKey] = {
          commandId: `CMD-${String(Object.keys(acc).length + 1).padStart(3, "0")}`,
          command,
          executionOrder: queueItem.executionOrder || null,
          executionPriority: queueItem.executionPriority || item.priority,
          executionGateCount: queueItem.executionGateCount || null,
          gateCount: 0,
          gateIds: [],
          owners: [],
          phases: [],
          priorityCounts: {},
          actionTypeCounts: {},
          categoryCounts: {},
          statusCounts: {},
          evidencePaths: [],
          closeCriteria: [],
          prerequisites: {
            env: [],
            evidence: [],
            runtime: [],
            closeout: [],
          },
        };
      }
      const group = acc[groupKey];
      group.gateCount += 1;
      group.gateIds.push(item.id);
      group.owners = unique([...group.owners, item.owner]);
      group.phases = unique([...group.phases, item.phase]);
      group.priorityCounts = incrementCount(group.priorityCounts, item.priority);
      group.actionTypeCounts = incrementCount(group.actionTypeCounts, item.actionType);
      group.categoryCounts = incrementCount(group.categoryCounts, item.category);
      group.statusCounts = incrementCount(group.statusCounts, item.status);
      group.evidencePaths = unique([...group.evidencePaths, item.evidence]);
      group.closeCriteria = unique([...group.closeCriteria, item.closeWhen]);
      ["env", "evidence", "runtime", "closeout"].forEach((key) => {
        group.prerequisites[key] = unique([
          ...group.prerequisites[key],
          ...(item.prerequisites?.[key] || []),
          ...(executionQueueOrder.get(groupKey)?.prerequisites?.[key] || []),
        ]);
      });
      return acc;
    }, {}),
  )
    .sort((a, b) => {
      const aOrder = a.executionOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.executionOrder ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || b.gateCount - a.gateCount || a.command.localeCompare(b.command);
    })
    .map((group, index) => ({
      ...group,
      commandId: `CMD-${String(index + 1).padStart(3, "0")}`,
    }));
}

function buildMetadataCommandGroups(generatedBy, siteName, baseUrl) {
  const gates = [];
  if (isPlaceholderFieldText(generatedBy)) {
    gates.push({
      gateId: "META-001",
      status: "PLACEHOLDER_METADATA",
      closeCriteria: "Set FIELD_REVIEWER to a concrete field reviewer and rerun field:gate-closure-map.",
    });
  }
  if (isPlaceholderFieldText(siteName)) {
    gates.push({
      gateId: "META-002",
      status: "PLACEHOLDER_METADATA",
      closeCriteria: "Set FIELD_SITE_NAME to a concrete delivery site and rerun field:gate-closure-map.",
    });
  }
  if (gates.length === 0) return [];
  return [{
    commandId: "CMD-META",
    command: `npm.cmd run field:gate-closure-map -- --base-url=${baseUrl} --site-name="$env:FIELD_SITE_NAME" --generated-by="$env:FIELD_REVIEWER"`,
    gateCount: gates.length,
    gateIds: gates.map((item) => item.gateId),
    owners: ["PM/QA"],
    phases: ["Field Review"],
    priorityCounts: { P1: gates.length },
    actionTypeCounts: { FIELD_ACTION_REQUIRED: gates.length },
    categoryCounts: { "Field Metadata": gates.length },
    statusCounts: gates.reduce((counts, item) => incrementCount(counts, item.status), {}),
    evidencePaths: [],
    closeCriteria: gates.map((item) => item.closeCriteria),
    prerequisites: {
      env: ["FIELD_REVIEWER", "FIELD_SITE_NAME"],
      evidence: [],
      runtime: [],
      closeout: ["Regenerate field-gate-closure-map with concrete reviewer/site metadata"],
    },
  }];
}

function buildManifest(input = {}) {
  const actionBoard = Object.prototype.hasOwnProperty.call(input, "actionBoard")
    ? input.actionBoard
    : readLatestJsonManifest("artifacts/field-action-board");
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = input.siteName || actionBoard?.data?.siteName || "unspecified";
  const baseUrl = input.baseUrl || actionBoard?.data?.baseUrl || "http://localhost:8080";
  const commandGroups = [
    ...buildCommandGroups(actionBoard),
    ...buildMetadataCommandGroups(generatedBy, siteName, baseUrl),
  ];
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: !actionBoard ? "ACTION_BOARD_MISSING" : commandGroups.length > 0 ? "OPEN" : "READY_TO_CLOSE",
    sourceFieldActionBoard: actionBoard?.path || null,
    commandCount: commandGroups.length,
    openGateCount: commandGroups.reduce((sum, group) => sum + group.gateCount, 0),
    commandGroups,
    git: buildGitState(input.git),
    guardrails: [
      "This map shows which final-status gates each field command is expected to close.",
      "It is an execution aid only; actual closure requires regenerated PASS/READY evidence.",
      "Regenerate after final:status and field:action-board are refreshed.",
    ],
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatPrerequisites(prerequisites) {
  if (!prerequisites) return "-";
  return [
    prerequisites.env?.length ? `env=${prerequisites.env.join(", ")}` : "",
    prerequisites.evidence?.length ? `evidence=${prerequisites.evidence.join(", ")}` : "",
    prerequisites.runtime?.length ? `runtime=${prerequisites.runtime.join(", ")}` : "",
    prerequisites.closeout?.length ? `closeout=${prerequisites.closeout.join(", ")}` : "",
  ].filter(Boolean).join(" / ") || "-";
}

function buildMarkdown(manifest) {
  return [
    "# Field Gate Closure Map",
    "",
    `- Status: ${manifest.status}`,
    `- Command count: ${manifest.commandCount}`,
    `- Open gate count: ${manifest.openGateCount}`,
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
    "## Command Summary",
    "",
    "| Command ID | Gates | Owners | Phases | Prerequisites | Priority Counts | Action Type Counts | Category Counts | Status Counts |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.commandGroups.length > 0
      ? manifest.commandGroups.map(
          (group) =>
            `| ${group.commandId} | ${group.gateCount} | ${markdownCell(group.owners.join(", "))} | ${markdownCell(group.phases.join(", "))} | ${markdownCell(formatPrerequisites(group.prerequisites))} | ${markdownCell(JSON.stringify(group.priorityCounts))} | ${markdownCell(JSON.stringify(group.actionTypeCounts))} | ${markdownCell(JSON.stringify(group.categoryCounts))} | ${markdownCell(JSON.stringify(group.statusCounts))} |`,
        )
      : ["| none | 0 | - | - | - | {} | {} | {} | {} |"]),
    "",
    "## Execution Queue Linkage",
    "",
    "| Queue Order | Command ID | Queue Priority | Queue Gate Count | Closure Gate Count | Command |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.commandGroups.length > 0
      ? manifest.commandGroups.map(
          (group) =>
            `| ${group.executionOrder || "-"} | ${group.commandId} | ${markdownCell(group.executionPriority || "-")} | ${group.executionGateCount || "-"} | ${group.gateCount} | \`${markdownCell(group.command)}\` |`,
        )
      : ["| - | none | - | - | 0 | No commands required. |"]),
    "",
    "## Closure Map",
    "",
    "| Command ID | Command | Gate IDs | Evidence Paths | Prerequisites | Close Criteria |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.commandGroups.length > 0
      ? manifest.commandGroups.map(
          (group) =>
            `| ${group.commandId} | \`${markdownCell(group.command)}\` | ${markdownCell(group.gateIds.join(", "))} | ${markdownCell(group.evidencePaths.join(", ")) || "missing"} | ${markdownCell(formatPrerequisites(group.prerequisites))} | ${markdownCell(group.closeCriteria.join(" / "))} |`,
        )
      : ["| none | No commands required. | - | - | - | - |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-gate-closure-map");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildManifest({
    baseUrl: argValue("base-url", undefined),
    siteName: argValue("site-name", undefined),
    generatedBy: argValue("generated-by", undefined),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field gate closure map written to ${path.relative(root, outputDir)}`);
  console.log(`field gate closure map status: ${manifest.status}`);
  if (manifest.openGateCount > 0) console.log(`open gate count: ${manifest.openGateCount}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCommandGroups,
  buildMetadataCommandGroups,
  buildManifest,
  buildMarkdown,
  formatPrerequisites,
};
