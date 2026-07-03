const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");

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

function ownerForGate(gate) {
  const text = `${gate.category || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("security") || text.includes("scanner") || text.includes("cookie") || text.includes("jwt") || text.includes("password")) return "Auth/Security";
  if (text.includes("lidar") || text.includes("ingest") || text.includes("device")) return "LiDAR Ingest";
  if (text.includes("control-board") || text.includes("live_tcp") || text.includes("tcp") || text.includes("hardware")) return "Control-board TCP";
  if (text.includes("swagger") || text.includes("nginx")) return "Nginx Delivery";
  if (text.includes("operator") || text.includes("manual") || text.includes("walkthrough") || text.includes("risk acceptance")) return "PM/QA";
  if (text.includes("db") || text.includes("prisma") || text.includes("runtime")) return "Backend/Runtime";
  return "Field Operations";
}

function priorityForGate(gate) {
  const text = `${gate.category || ""} ${gate.status || ""} ${gate.actionType || ""} ${gate.message || ""}`.toLowerCase();
  if (text.includes("blocked") || text.includes("strict") || text.includes("security") || text.includes("live_tcp") || text.includes("not live_tcp_ready")) return "P0";
  if (text.includes("invalid") || text.includes("missing") || text.includes("skipped") || text.includes("field acceptance")) return "P1";
  if (text.includes("review") || text.includes("field_review") || text.includes("dry_run_safe")) return "P2";
  return "P3";
}

function phaseForGate(gate) {
  const text = `${gate.category || ""} ${gate.status || ""} ${gate.actionType || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("manual evidence") || text.includes("operator ui walkthrough") || text.includes("field risk acceptance")) return "Manual Evidence";
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) return "Security Evidence";
  if (text.includes("preflight") || text.includes("jwt") || text.includes("cookie") || text.includes("swagger") || text.includes("device ingest key")) return "Field Preflight";
  if (text.includes("db") || text.includes("prisma") || text.includes("lidar") || text.includes("control-board") || text.includes("tcp") || text.includes("hardware")) return "Field Rehearsal";
  if (text.includes("field acceptance") || text.includes("readiness") || text.includes("runtime smoke")) return "Field Acceptance";
  if (text.includes("handover")) return "Handover Package";
  if (text.includes("completion") || text.includes("final")) return "Final Status";
  return "Field Review";
}

function commandForGate(gate, baseUrl) {
  const text = `${gate.category || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("manual evidence") || text.includes("operator ui walkthrough") || text.includes("field risk acceptance")) {
    return "npm.cmd run manual:evidence-readiness";
  }
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) {
    return `npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=${baseUrl}`;
  }
  if (text.includes("preflight") || text.includes("jwt") || text.includes("cookie") || text.includes("swagger")) {
    return `npm.cmd run field:preflight -- -BaseUrl ${baseUrl} -Reviewer "field-reviewer-name" -SiteName "delivery-site-name" -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight`;
  }
  if (text.includes("db") || text.includes("prisma")) {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"`;
  }
  if (text.includes("lidar") || text.includes("ingest")) {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"`;
  }
  if (text.includes("control-board") || text.includes("tcp") || text.includes("hardware")) {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"`;
  }
  if (text.includes("field readiness") || text.includes("readiness")) {
    return `npm.cmd run field:readiness -- --base-url=${baseUrl} --generated-by="field-reviewer-name" --site-name="delivery-site-name"`;
  }
  if (text.includes("field acceptance")) {
    return `npm.cmd run field:acceptance -- -BaseUrl ${baseUrl} -Reviewer "field-reviewer-name" -SiteName "delivery-site-name" -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners`;
  }
  if (text.includes("handover")) return `npm.cmd run handover:package -- --base-url=${baseUrl} --strict`;
  if (text.includes("completion")) return "npm.cmd run completion:audit";
  return `npm.cmd run final:execution-plan -- --base-url=${baseUrl}`;
}

function buildActionItems(finalStatus, baseUrl) {
  const gates = finalStatus?.data?.remainingGates || [];
  return gates.map((gate, index) => ({
    id: `GATE-${String(index + 1).padStart(3, "0")}`,
    owner: ownerForGate(gate),
    priority: priorityForGate(gate),
    phase: phaseForGate(gate),
    actionType: gate.actionType || "REVIEW_REQUIRED",
    category: gate.category || "Unknown",
    status: gate.status || "UNKNOWN",
    message: gate.message || "",
    closeWhen: gate.closeWhen || "",
    evidence: gate.evidence || null,
    command: commandForGate(gate, baseUrl),
  }));
}

function groupByPhase(items) {
  const phaseOrder = [
    "Manual Evidence",
    "Security Evidence",
    "Field Preflight",
    "Field Rehearsal",
    "Field Acceptance",
    "Handover Package",
    "Final Status",
    "Field Review",
  ];
  return Object.values(
    items.reduce((acc, item) => {
      if (!acc[item.phase]) {
        acc[item.phase] = {
          phase: item.phase,
          total: 0,
          byPriority: {},
          owners: [],
          commands: [],
        };
      }
      acc[item.phase].total += 1;
      acc[item.phase].byPriority[item.priority] = (acc[item.phase].byPriority[item.priority] || 0) + 1;
      if (!acc[item.phase].owners.includes(item.owner)) acc[item.phase].owners.push(item.owner);
      if (!acc[item.phase].commands.includes(item.command)) acc[item.phase].commands.push(item.command);
      return acc;
    }, {}),
  ).sort((a, b) => phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.phase.localeCompare(b.phase));
}

function groupByOwner(items) {
  return Object.values(
    items.reduce((acc, item) => {
      if (!acc[item.owner]) {
        acc[item.owner] = {
          owner: item.owner,
          total: 0,
          byPriority: {},
          byPhase: {},
          byActionType: {},
          commands: [],
          items: [],
        };
      }
      acc[item.owner].total += 1;
      acc[item.owner].byPriority[item.priority] = (acc[item.owner].byPriority[item.priority] || 0) + 1;
      acc[item.owner].byPhase[item.phase] = (acc[item.owner].byPhase[item.phase] || 0) + 1;
      acc[item.owner].byActionType[item.actionType] = (acc[item.owner].byActionType[item.actionType] || 0) + 1;
      if (!acc[item.owner].commands.includes(item.command)) acc[item.owner].commands.push(item.command);
      acc[item.owner].items.push(item);
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner));
}

function buildManifest(input = {}) {
  const finalStatus = input.finalStatus || readLatestJsonManifest("artifacts/final-status");
  const baseUrl = input.baseUrl || finalStatus?.data?.baseUrl || "http://localhost:8080";
  const items = buildActionItems(finalStatus, baseUrl);
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy: input.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: input.siteName || finalStatus?.data?.siteName || "unspecified",
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: finalStatus ? (items.length > 0 ? "OPEN" : "READY_TO_CLOSE") : "FINAL_STATUS_MISSING",
    openActionCount: items.length,
    sourceFinalStatus: finalStatus?.path || null,
    git: {
      branch: input.git?.branch || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: input.git?.commit || gitValue(["rev-parse", "HEAD"]),
      clean: input.git?.clean ?? gitValue(["status", "--short"]) === "",
    },
    ownerGroups: groupByOwner(items),
    phaseGroups: groupByPhase(items),
    actionItems: items,
    guardrails: [
      "This board organizes final-status gates for field execution; it does not prove completion.",
      "Run commands against the delivery Nginx entrypoint and approved field network/hardware.",
      "Final close still requires final:status READY_TO_CLOSE and canMarkGoalComplete=true.",
    ],
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# Field Action Board",
    "",
    `- Status: ${manifest.status}`,
    `- Open action count: ${manifest.openActionCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Source final status: ${manifest.sourceFinalStatus || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Owner Summary",
    "",
    "| Owner | Total | Priority Counts | Phase Counts | Action Type Counts |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.ownerGroups.length > 0
      ? manifest.ownerGroups.map((group) => `| ${markdownCell(group.owner)} | ${group.total} | ${markdownCell(JSON.stringify(group.byPriority))} | ${markdownCell(JSON.stringify(group.byPhase))} | ${markdownCell(JSON.stringify(group.byActionType))} |`)
      : ["| none | 0 | {} | {} | {} |"]),
    "",
    "## Phase Summary",
    "",
    "| Phase | Total | Priority Counts | Owners | Commands |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.phaseGroups.length > 0
      ? manifest.phaseGroups.map((group) => `| ${markdownCell(group.phase)} | ${group.total} | ${markdownCell(JSON.stringify(group.byPriority))} | ${markdownCell(group.owners.join(", "))} | ${group.commands.length} |`)
      : ["| none | 0 | {} | - | 0 |"]),
    "",
    "## Owner Commands",
    "",
    "| Owner | Command |",
    "| --- | --- |",
    ...(manifest.ownerGroups.length > 0
      ? manifest.ownerGroups.flatMap((group) => group.commands.map((command) => `| ${markdownCell(group.owner)} | \`${markdownCell(command)}\` |`))
      : ["| none | No commands required. |"]),
    "",
    "## Action Items",
    "",
    "| ID | Priority | Phase | Owner | Action Type | Category | Status | Message | Close When | Evidence | Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.actionItems.length > 0
      ? manifest.actionItems.map(
          (item) =>
            `| ${item.id} | ${item.priority} | ${markdownCell(item.phase)} | ${markdownCell(item.owner)} | ${markdownCell(item.actionType)} | ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} | \`${markdownCell(item.command)}\` |`,
        )
      : ["| none | - | - | - | - | - | PASS | No open final-status gates. | - | - | - |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-action-board");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildManifest({
    baseUrl: argValue("base-url", undefined),
    siteName: argValue("site-name", undefined),
    generatedBy: argValue("generated-by", undefined),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field action board written to ${path.relative(root, outputDir)}`);
  console.log(`field action board status: ${manifest.status}`);
  if (manifest.openActionCount > 0) console.log(`open action count: ${manifest.openActionCount}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManifest,
  buildMarkdown,
  buildActionItems,
  groupByOwner,
  groupByPhase,
  ownerForGate,
  priorityForGate,
  phaseForGate,
  commandForGate,
};
