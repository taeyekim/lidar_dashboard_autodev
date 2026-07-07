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
const ENV_KEY_GUIDE = {
  AUTH_COOKIE_SAMESITE: {
    owner: "Auth/Security",
    valueShape: "strict/lax/none, delivery default usually strict or lax",
    secret: false,
    closes: "Auth cookie delivery settings",
    verify: "field:preflight",
  },
  AUTH_COOKIE_SECURE: {
    owner: "Auth/Security",
    valueShape: "true when HTTPS/TLS is used at delivery entrypoint",
    secret: false,
    closes: "Auth cookie delivery settings",
    verify: "field:preflight",
  },
  CONTROL_BOARD_DRY_RUN: {
    owner: "Control-board TCP",
    valueShape: "true until hardware owner approves LIVE TCP",
    secret: false,
    closes: "Control-board safety posture",
    verify: "field:readiness, control-board-field-rehearsal",
  },
  CONTROL_BOARD_HOST: {
    owner: "Control-board TCP",
    valueShape: "integrated control-board IPv4/host on field network",
    secret: false,
    closes: "LIVE TCP readiness",
    verify: "field:readiness, control-board-field-rehearsal",
  },
  CONTROL_BOARD_LIVE_APPROVED: {
    owner: "Control-board TCP + PM",
    valueShape: "false until approved, true only with recorded hardware approval",
    secret: false,
    closes: "LIVE TCP approval gate",
    verify: "field:readiness, field:acceptance",
  },
  CONTROL_BOARD_PORT: {
    owner: "Control-board TCP",
    valueShape: "TCP port number assigned for raw 10-byte command frames",
    secret: false,
    closes: "LIVE TCP readiness",
    verify: "field:readiness, control-board-field-rehearsal",
  },
  CORS_ORIGINS: {
    owner: "Auth/Security",
    valueShape: "comma-separated allowed dashboard origins",
    secret: false,
    closes: "CORS trusted origins",
    verify: "field:preflight",
  },
  DEVICE_INGEST_API_KEY: {
    owner: "LiDAR Ingest + Auth/Security",
    valueShape: "long random shared device ingest key, never paste into evidence",
    secret: true,
    closes: "Device ingest key",
    verify: "field:preflight, runtime:evidence",
  },
  FIELD_BASE_URL: {
    owner: "Field Operations",
    valueShape: "delivery Nginx/operator entrypoint URL, e.g. http://<dashboard-pc-ip>:<nginx-port>",
    secret: false,
    closes: "Shared field command base URL",
    verify: "final:refresh, field:readiness, handover:package",
  },
  FIELD_REVIEWER: {
    owner: "PM/QA",
    valueShape: "named reviewer or role signing field evidence",
    secret: false,
    closes: "Reviewer metadata",
    verify: "handover:index, field:closeout-quickstart",
  },
  FIELD_SITE_NAME: {
    owner: "PM/QA",
    valueShape: "delivery site/system name",
    secret: false,
    closes: "Site metadata",
    verify: "handover:index, field:closeout-quickstart",
  },
  JWT_SECRET: {
    owner: "Auth/Security",
    valueShape: "long random JWT signing secret, never paste into evidence",
    secret: true,
    closes: "JWT secret placeholder",
    verify: "field:preflight",
  },
  NGINX_CONTENT_SECURITY_POLICY: {
    owner: "Nginx Delivery + Auth/Security",
    valueShape: "approved CSP header string for delivery dashboard/API",
    secret: false,
    closes: "Nginx content security policy",
    verify: "field:preflight, security:evidence",
  },
  NGINX_SWAGGER_ALLOW: {
    owner: "Nginx Delivery",
    valueShape: "CIDR allowlist for Swagger access, not all",
    secret: false,
    closes: "Swagger allowlist",
    verify: "field:preflight",
  },
  NGINX_WRONGWAY_BURST: {
    owner: "Nginx Delivery",
    valueShape: "numeric burst allowance for wrong-way ingest/API rate limit",
    secret: false,
    closes: "Nginx wrong-way rate limit",
    verify: "field:preflight",
  },
  NGINX_WRONGWAY_RATE_LIMIT: {
    owner: "Nginx Delivery",
    valueShape: "Nginx rate expression such as 10r/s, field approved",
    secret: false,
    closes: "Nginx wrong-way rate limit",
    verify: "field:preflight",
  },
  SEED_ADMIN_PASSWORD: {
    owner: "Auth/Security",
    valueShape: "field admin bootstrap password, rotate after setup",
    secret: true,
    closes: "Seed admin password placeholder",
    verify: "field:preflight",
  },
};

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

function buildEnvGuide(envKeys) {
  return (envKeys || []).map((key) => ({
    key,
    owner: ENV_KEY_GUIDE[key]?.owner || "Field Operations",
    valueShape: ENV_KEY_GUIDE[key]?.valueShape || "field-specific value",
    secret: ENV_KEY_GUIDE[key]?.secret === true,
    closes: ENV_KEY_GUIDE[key]?.closes || "field closeout item",
    verify: ENV_KEY_GUIDE[key]?.verify || "field:preflight",
  }));
}

function placeholderForEnvKey(key) {
  if (ENV_KEY_GUIDE[key]?.secret === true) return "replace_in_field";
  const placeholders = {
    AUTH_COOKIE_SAMESITE: "lax",
    AUTH_COOKIE_SECURE: "true",
    CONTROL_BOARD_DRY_RUN: "true",
    CONTROL_BOARD_HOST: "replace_in_field",
    CONTROL_BOARD_LIVE_APPROVED: "false",
    CONTROL_BOARD_PORT: "replace_in_field",
    CORS_ORIGINS: "replace_in_field",
    FIELD_BASE_URL: "http://localhost:8080",
    FIELD_REVIEWER: "replace_in_field",
    FIELD_SITE_NAME: "replace_in_field",
    NGINX_CONTENT_SECURITY_POLICY: "replace_in_field",
    NGINX_SWAGGER_ALLOW: "replace_in_field",
    NGINX_WRONGWAY_BURST: "replace_in_field",
    NGINX_WRONGWAY_RATE_LIMIT: "replace_in_field",
  };
  return placeholders[key] || "replace_in_field";
}

function sanitizeEnvPatchLine(line) {
  const match = String(line || "").match(/^\s*([^#=\s]+)\s*=(.*)$/);
  if (!match) return "";
  const key = match[1].trim();
  if (!key) return "";
  if (ENV_KEY_GUIDE[key]?.secret === true) return `${key}=replace_in_field`;
  const value = String(match[2] || "").trim();
  if (!value || value === "<field-secret-redacted>" || value === "<field-value>") {
    return `${key}=${placeholderForEnvKey(key)}`;
  }
  return `${key}=${value}`;
}

function buildEnvPatchBlockLines(envGuide, fieldEnvCloseout) {
  const closeoutLines = fieldEnvCloseout?.data?.envFile?.appendMissingEnvBlockLines || [];
  const sanitizedCloseoutLines = closeoutLines.map(sanitizeEnvPatchLine).filter(Boolean);
  if (sanitizedCloseoutLines.length > 0) return uniq(sanitizedCloseoutLines);
  return uniq((envGuide || []).map((item) => `${item.key}=${placeholderForEnvKey(item.key)}`));
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
  const fieldEnvCloseout = Object.prototype.hasOwnProperty.call(input, "fieldEnvCloseout")
    ? input.fieldEnvCloseout
    : readLatestJsonManifest("artifacts/field-env-closeout");
  const fieldRequirementsBacklog = Object.prototype.hasOwnProperty.call(input, "fieldRequirementsBacklog")
    ? input.fieldRequirementsBacklog
    : readLatestJsonManifest("artifacts/field-requirements-backlog");
  const actionItems = actionBoard?.data?.actionItems || [];
  const baseUrl = resolveFieldBaseUrl(input.baseUrl, actionBoard?.data?.baseUrl, finalStatus?.data?.baseUrl);
  const prerequisites = flattenPrerequisites(actionItems);
  const phaseQueue = buildPhaseQueue(actionItems);
  const ownerQueue = buildOwnerQueue(actionBoard);
  const summary = classification?.data?.summary || {};
  const envGuide = buildEnvGuide(prerequisites.env);
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
    sourceFieldEnvCloseout: fieldEnvCloseout?.path || null,
    sourceFieldRequirementsBacklog: fieldRequirementsBacklog?.path || null,
    remainingGateCount: finalStatus?.data?.remainingGates?.length ?? null,
    openActionCount: actionItems.length,
    bucketGateCounts: summary.bucketGateCounts || {},
    fieldRequiredCount: summary.fieldRequiredCount ?? null,
    securityRequiredCount: summary.bucketGateCounts?.security_tooling ?? null,
    reviewRequiredCount: (finalStatus?.data?.remainingGates || []).filter((gate) => gate.actionType === "REVIEW_REQUIRED").length,
    prerequisites,
    envGuide,
    envPatchBlockLines: buildEnvPatchBlockLines(envGuide, fieldEnvCloseout),
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
    `- Source field env closeout: ${manifest.sourceFieldEnvCloseout || "missing"}`,
    `- Source field requirements backlog: ${manifest.sourceFieldRequirementsBacklog || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Env Keys To Fill",
    "",
    "| Key | Owner | Secret | Value Shape | Closes | Verify With |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.envGuide.length > 0
      ? manifest.envGuide.map(
          (item) =>
            `| ${markdownCell(item.key)} | ${markdownCell(item.owner)} | ${item.secret ? "yes" : "no"} | ${markdownCell(item.valueShape)} | ${markdownCell(item.closes)} | ${markdownCell(item.verify)} |`,
        )
      : ["| none | - | no | - | - | - |"]),
    "",
    "## Safe .env Patch Block",
    "",
    "Append or update these keys in the local field `.env`, then replace placeholders on the delivery PC. This block never carries real secret values.",
    "",
    "```dotenv",
    ...(manifest.envPatchBlockLines.length > 0 ? manifest.envPatchBlockLines : ["# no open env keys"]),
    "```",
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
