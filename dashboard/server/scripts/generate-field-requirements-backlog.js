const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { resolveFieldBaseUrl } = require("./field-env");
const {
  commandForGate,
  ownerForGate,
  phaseForGate,
  prerequisiteHintsForGate,
  priorityForGate,
} = require("./generate-field-action-board");

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

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function questionForGate(gate) {
  const text = `${gate.category || ""} ${gate.actionType || ""} ${gate.status || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("control-board") || text.includes("live_tcp") || text.includes("hardware")) {
    return "Confirm control-board host, TCP port, live approval owner, and command/ACK rehearsal window.";
  }
  if (text.includes("security") || text.includes("scanner") || text.includes("trivy") || text.includes("zap") || text.includes("gitleaks")) {
    return "Confirm whether scanner evidence will be produced with native tools, Docker scanners, or approved risk acceptance.";
  }
  if (text.includes("ci status") || text.includes("workflow run")) {
    return "Confirm whether dev branch GitHub Actions should run for this final source revision or be risk-accepted.";
  }
  if (text.includes("site name") || text.includes("reviewer") || text.includes("metadata")) {
    return "Confirm the field reviewer name and delivery site name to use in all closeout evidence.";
  }
  if (text.includes("level-2") || text.includes("wrong-way-level-2") || text.includes("escalation")) {
    return "Confirm field measurement criteria and env thresholds for dashboard-side level-2 escalation.";
  }
  if (text.includes("manual evidence") || text.includes("operator ui") || text.includes("risk acceptance")) {
    return "Confirm manual evidence owner, evidence file path, and acceptance wording for the open field item.";
  }
  if (text.includes(".env") || text.includes("jwt") || text.includes("password") || text.includes("cors") || text.includes("cookie") || text.includes("swagger") || text.includes("rate limit") || text.includes("content security")) {
    return "Confirm approved field .env values or placeholders for the listed environment keys.";
  }
  if (text.includes("field acceptance") || text.includes("field readiness") || text.includes("handover")) {
    return "Confirm the delivery runtime URL, reviewer/site metadata, and required evidence refresh order.";
  }
  return "Confirm the field decision or evidence needed to close this gate.";
}

function buildBacklogItems(finalStatus, baseUrl) {
  const gates = finalStatus?.data?.remainingGates || [];
  const grouped = new Map();
  gates.forEach((gate) => {
    const owner = ownerForGate(gate);
    const phase = phaseForGate(gate);
    const question = questionForGate(gate);
    const prerequisites = prerequisiteHintsForGate(gate);
    const key = [owner, phase, gate.actionType || "UNKNOWN", question].join("|");
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: `REQ-${String(grouped.size + 1).padStart(3, "0")}`,
        owner,
        phase,
        priority: priorityForGate(gate),
        actionType: gate.actionType || "UNKNOWN",
        question,
        envKeys: [],
        evidence: [],
        runtime: [],
        closeout: [],
        sourceGateIds: [],
        sourceMessages: [],
        command: commandForGate(gate, baseUrl),
        closeWhen: gate.closeWhen || "The referenced final-status gate is closed.",
      });
    }
    const item = grouped.get(key);
    item.priority = ["P0", "P1", "P2", "P3"].indexOf(priorityForGate(gate)) < ["P0", "P1", "P2", "P3"].indexOf(item.priority)
      ? priorityForGate(gate)
      : item.priority;
    item.envKeys = uniq([...item.envKeys, ...prerequisites.env]).sort();
    item.evidence = uniq([...item.evidence, ...prerequisites.evidence]).sort();
    item.runtime = uniq([...item.runtime, ...prerequisites.runtime]).sort();
    item.closeout = uniq([...item.closeout, ...prerequisites.closeout]).sort();
    item.sourceGateIds = uniq([...item.sourceGateIds, gate.id || gate.gate || gate.message]).sort();
    item.sourceMessages = uniq([...item.sourceMessages, compactText(gate.message)]).slice(0, 5);
  });
  return [...grouped.values()].sort((a, b) => {
    const priorityRank = ["P0", "P1", "P2", "P3"].indexOf(a.priority) - ["P0", "P1", "P2", "P3"].indexOf(b.priority);
    return priorityRank || a.owner.localeCompare(b.owner) || a.phase.localeCompare(b.phase);
  });
}

function summarize(items) {
  return items.reduce(
    (acc, item) => {
      acc.byOwner[item.owner] = (acc.byOwner[item.owner] || 0) + 1;
      acc.byPriority[item.priority] = (acc.byPriority[item.priority] || 0) + 1;
      acc.byActionType[item.actionType] = (acc.byActionType[item.actionType] || 0) + 1;
      return acc;
    },
    { itemCount: items.length, byOwner: {}, byPriority: {}, byActionType: {} },
  );
}

function buildManifest(input = {}) {
  const finalStatus = Object.prototype.hasOwnProperty.call(input, "finalStatus")
    ? input.finalStatus
    : readLatestJsonManifest("artifacts/final-status");
  const classification = Object.prototype.hasOwnProperty.call(input, "classification")
    ? input.classification
    : readLatestJsonManifest("artifacts/final-gate-classification");
  const baseUrl = resolveFieldBaseUrl(input.baseUrl, finalStatus?.data?.baseUrl, classification?.data?.baseUrl);
  const items = buildBacklogItems(finalStatus, baseUrl);
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: input.siteName || finalStatus?.data?.siteName || classification?.data?.siteName || "unspecified",
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: items.length > 0 ? "OPEN" : finalStatus ? "READY_TO_CLOSE" : "FINAL_STATUS_MISSING",
    sourceFinalStatus: finalStatus?.path || null,
    sourceFinalGateClassification: classification?.path || null,
    remainingGateCount: finalStatus?.data?.remainingGates?.length ?? null,
    classificationSummary: classification?.data?.summary || null,
    metadataEnvKeys: ["FIELD_REVIEWER", "FIELD_SITE_NAME"],
    summary: summarize(items),
    backlogItems: items,
    guardrails: [
      "Record only questions, owners, placeholders, and evidence paths here; never paste real secret values.",
      "Do not close field, security, CI, or hardware gates from this backlog alone.",
      "Use this backlog as the batched user/team question list when auto-mode reaches field-dependent blockers.",
    ],
    git: buildGitState(input.git),
  };
}

function buildMarkdown(manifest) {
  return [
    "# Field Requirements Backlog",
    "",
    `- Status: ${manifest.status}`,
    `- Backlog item count: ${manifest.summary.itemCount}`,
    `- Remaining gate count: ${manifest.remainingGateCount ?? "unknown"}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Source final status: ${manifest.sourceFinalStatus || "missing"}`,
    `- Source final gate classification: ${manifest.sourceFinalGateClassification || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Summary",
    "",
    `- Metadata env keys: ${manifest.metadataEnvKeys.join(", ")}`,
    `- By owner: ${JSON.stringify(manifest.summary.byOwner)}`,
    `- By priority: ${JSON.stringify(manifest.summary.byPriority)}`,
    `- By action type: ${JSON.stringify(manifest.summary.byActionType)}`,
    "",
    "## Backlog Questions",
    "",
    "| ID | Priority | Owner | Phase | Question | Env Keys | Evidence | Runtime | Command | Source Gates |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.backlogItems.length > 0
      ? manifest.backlogItems.map(
          (item) =>
            `| ${item.id} | ${item.priority} | ${markdownCell(item.owner)} | ${markdownCell(item.phase)} | ${markdownCell(item.question)} | ${markdownCell(item.envKeys.join(", ") || "-")} | ${markdownCell(item.evidence.join(", ") || "-")} | ${markdownCell(item.runtime.join(", ") || "-")} | ${markdownCell(item.command)} | ${markdownCell(item.sourceGateIds.join(", "))} |`,
        )
      : ["| - | - | none | - | No open field requirements. | - | - | - | - | - |"]),
    "",
  ].join("\n");
}

function writeBacklog(manifest, outputDir) {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-requirements-backlog");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildManifest({
    baseUrl: argValue("base-url", undefined),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
  });
  writeBacklog(manifest, outputDir);
  console.log(`field requirements backlog written to ${path.relative(root, outputDir)}`);
  console.log(`field requirements backlog status: ${manifest.status}`);
}

if (require.main === module) main();

module.exports = {
  buildBacklogItems,
  buildManifest,
  buildMarkdown,
  questionForGate,
};
