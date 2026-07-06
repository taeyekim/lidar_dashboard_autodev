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

function buildGitState() {
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

function actionCommandForItem(item, baseUrl) {
  const strictPreflight = `npm.cmd run field:preflight -- -BaseUrl ${baseUrl} -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME" -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict`;
  const commands = {
    JWT_SECRET: "Set JWT_SECRET to a field-only random value, then rerun strict field preflight. Do not paste the value into evidence.",
    SEED_ADMIN_PASSWORD: "Set SEED_ADMIN_PASSWORD to a non-example value before seeding the intended field DB, then rerun strict field preflight.",
    DEVICE_INGEST_API_KEY: "Set DEVICE_INGEST_API_KEY and configure the LiDAR sender X-Device-Key header, or attach accepted trusted-LAN risk evidence.",
    CONTROL_BOARD_HOST: "Fill CONTROL_BOARD_HOST after the hardware owner confirms the integrated control-board field IP.",
    CONTROL_BOARD_PORT: "Fill CONTROL_BOARD_PORT after the hardware owner confirms the integrated control-board TCP port.",
    CONTROL_BOARD_DRY_RUN: "Keep CONTROL_BOARD_DRY_RUN=true until live TCP is approved; set false only for approved live rehearsal.",
    CONTROL_BOARD_LIVE_APPROVED: "Set CONTROL_BOARD_LIVE_APPROVED=true only after hardware owner approval is recorded.",
    AUTH_COOKIE_SECURE: "Set AUTH_COOKIE_SECURE=true for the HTTPS/TLS delivery route.",
    AUTH_COOKIE_SAMESITE: "Set AUTH_COOKIE_SAMESITE to lax, strict, or none according to the delivery topology.",
    CORS_ORIGINS: "Set CORS_ORIGINS to explicit approved operator UI origins only.",
    NGINX_WRONGWAY_RATE_LIMIT: "Set NGINX_WRONGWAY_RATE_LIMIT after confirming the LiDAR sender event rate.",
    NGINX_WRONGWAY_BURST: "Set NGINX_WRONGWAY_BURST after confirming the LiDAR sender burst profile.",
    NGINX_CONTENT_SECURITY_POLICY: "Set NGINX_CONTENT_SECURITY_POLICY after reviewing final camera, LiDAR, Swagger, and operator UI hosts.",
    NGINX_SWAGGER_ALLOW: "Set NGINX_SWAGGER_ALLOW to the approved operator/internal CIDR.",
  };
  return `${commands[item.name] || item.nextAction || "Fill the field value and rerun strict field preflight."} Close with: ${strictPreflight}`;
}

function envPlaceholderForItem(item) {
  if (item.redacted !== false) return "<field-secret-redacted>";
  if (item.name === "CONTROL_BOARD_LIVE_APPROVED" || item.name === "CONTROL_BOARD_DRY_RUN" || item.name === "AUTH_COOKIE_SECURE") {
    return "<true-or-false>";
  }
  if (String(item.name || "").endsWith("_MS") || item.name === "CONTROL_BOARD_PORT" || item.name === "CONTROL_BOARD_RETRY_COUNT") {
    return "<number>";
  }
  return "<field-value>";
}

function suggestedValueForItem(item) {
  if (item.redacted !== false) return "<field-secret-redacted>";
  const suggestions = {
    CONTROL_BOARD_HOST: "<approved-control-board-ip>",
    CONTROL_BOARD_LIVE_APPROVED: "false",
    CONTROL_BOARD_PORT: "<approved-tcp-port>",
    CONTROL_BOARD_DRY_RUN: "true",
    CONTROL_BOARD_CONNECT_TIMEOUT_MS: "1000",
    CONTROL_BOARD_RESPONSE_TIMEOUT_MS: "1000",
    CONTROL_BOARD_RETRY_COUNT: "1",
    CONTROL_BOARD_HEARTBEAT_INTERVAL_MS: "5000",
    AUTH_COOKIE_SECURE: "true",
    AUTH_COOKIE_SAMESITE: "lax",
    CORS_ORIGINS: "<approved-operator-ui-origin>",
    NGINX_WRONGWAY_RATE_LIMIT: "30r/s",
    NGINX_WRONGWAY_BURST: "60",
    NGINX_CONTENT_SECURITY_POLICY:
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' http: https: ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    NGINX_SWAGGER_ALLOW: "127.0.0.1/32",
  };
  return suggestions[item.name] || envPlaceholderForItem(item);
}

function buildEnvTemplateLines(items) {
  return (items || []).map((item) => `${item.name}=${envPlaceholderForItem(item)}`);
}

function buildSuggestedEnvLines(items) {
  return (items || []).map((item) => `${item.name}=${suggestedValueForItem(item)}`);
}

function buildOwnerCloseoutChecklists(items, strictPreflightCommand) {
  const ownerMap = (items || []).reduce((acc, item) => {
    if (!acc[item.owner]) acc[item.owner] = [];
    acc[item.owner].push(item);
    return acc;
  }, {});

  return Object.entries(ownerMap).map(([owner, ownerItems]) => ({
    owner,
    stepCount: ownerItems.length + 2,
    steps: [
      {
        order: 1,
        title: "Set reviewer/session metadata",
        command: '$env:FIELD_REVIEWER="<field-reviewer>"; $env:FIELD_SITE_NAME="<delivery-site>"',
        doneWhen: "FIELD_REVIEWER and FIELD_SITE_NAME are concrete delivery-session values.",
      },
      ...ownerItems.map((item, index) => ({
        order: index + 2,
        title: `Set ${item.name}`,
        command: `${item.name}=${envPlaceholderForItem(item)}`,
        doneWhen: item.closeoutCommand,
      })),
      {
        order: ownerItems.length + 2,
        title: "Rerun strict field preflight",
        command: strictPreflightCommand,
        doneWhen: "The latest field preflight manifest has no REVIEW/SKIPPED item for this owner's keys.",
      },
    ],
  }));
}

function buildManifest(options = {}) {
  const readiness = Object.prototype.hasOwnProperty.call(options, "readiness")
    ? options.readiness
    : readLatestJsonManifest("artifacts/field-readiness");
  const baseUrl = options.baseUrl || process.env.FIELD_BASE_URL || readiness?.data?.baseUrl || "http://localhost:8080";
  const requiredFieldValues = Array.isArray(readiness?.data?.env?.requiredFieldValues)
    ? readiness.data.env.requiredFieldValues
    : [];
  const envActionGroups = Array.isArray(readiness?.data?.env?.envActionGroups)
    ? readiness.data.env.envActionGroups
    : [];
  const blockingItems = requiredFieldValues.filter((item) => ["missing", "placeholder", "not-approved"].includes(String(item.state || "")));
  const reviewItems = requiredFieldValues.filter(
    (item) =>
      !blockingItems.includes(item) &&
      !["configured", "trusted-only", "restricted", "approved", "true", "lax", "strict", "none"].includes(String(item.state || "")),
  );
  const closeoutItems = [...blockingItems, ...reviewItems].map((item) => ({
    name: item.name,
    state: item.state,
    owner: (envActionGroups.find((group) => (group.items || []).some((groupItem) => groupItem.name === item.name)) || {}).owner || "Field Operations",
    priority: blockingItems.includes(item) ? "BLOCKING" : "REVIEW",
    redacted: item.redacted !== false,
    completionGate: item.completionGate,
    nextAction: item.nextAction,
    closeoutCommand: actionCommandForItem(item, baseUrl),
  }));

  const ownerGroups = closeoutItems.reduce((acc, item) => {
    if (!acc[item.owner]) acc[item.owner] = { owner: item.owner, blockingCount: 0, reviewCount: 0, items: [] };
    if (item.priority === "BLOCKING") acc[item.owner].blockingCount += 1;
    else acc[item.owner].reviewCount += 1;
    acc[item.owner].items.push(item.name);
    return acc;
  }, {});
  const ownerEnvTemplates = Object.values(ownerGroups).map((group) => {
    const groupItems = closeoutItems.filter((item) => item.owner === group.owner);
    return {
      owner: group.owner,
      envTemplateLines: buildEnvTemplateLines(groupItems),
      blockingCount: group.blockingCount,
      reviewCount: group.reviewCount,
    };
  });

  const strictPreflightCommand = `npm.cmd run field:preflight -- -BaseUrl ${baseUrl} -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME" -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict`;

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    generatedBy: options.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: options.siteName || readiness?.data?.siteName || "unspecified",
    hostName: os.hostname(),
    baseUrl,
    git: buildGitState(),
    status: !readiness ? "MISSING_READINESS" : closeoutItems.length > 0 ? "OPEN" : "READY_TO_CLOSE",
    readinessEvidence: readiness?.path || null,
    readinessStatus: readiness?.data?.status || null,
    controlBoardSafetyStatus: readiness?.data?.env?.controlBoardSafetyStatus || null,
    requiredFieldValueCount: requiredFieldValues.length,
    blockingCount: blockingItems.length,
    reviewCount: reviewItems.length,
    closeoutItemCount: closeoutItems.length,
    ownerGroups: Object.values(ownerGroups),
    ownerEnvTemplates,
    ownerCloseoutChecklists: buildOwnerCloseoutChecklists(closeoutItems, strictPreflightCommand),
    envTemplateLines: buildEnvTemplateLines(closeoutItems),
    suggestedEnvLines: buildSuggestedEnvLines(closeoutItems),
    closeoutItems,
    strictPreflightCommand,
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function buildMarkdown(manifest) {
  return [
    "# Field Environment Closeout",
    "",
    `- Status: ${manifest.status}`,
    `- Readiness evidence: ${manifest.readinessEvidence || "missing"}`,
    `- Readiness status: ${manifest.readinessStatus || "missing"}`,
    `- Control-board safety status: ${manifest.controlBoardSafetyStatus || "missing"}`,
    `- Required field values: ${manifest.requiredFieldValueCount}`,
    `- Blocking field values: ${manifest.blockingCount}`,
    `- Review field values: ${manifest.reviewCount}`,
    `- Closeout item count: ${manifest.closeoutItemCount}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    "",
    "## Strict Preflight Command",
    "",
    "```powershell",
    manifest.strictPreflightCommand,
    "```",
    "",
    "## Owner Groups",
    "",
    "| Owner | Blocking | Review | Items |",
    "| --- | --- | --- | --- |",
    ...(manifest.ownerGroups.length > 0
      ? manifest.ownerGroups.map((group) => `| ${markdownCell(group.owner)} | ${group.blockingCount} | ${group.reviewCount} | ${markdownCell(group.items.join(", "))} |`)
      : ["| none | 0 | 0 | none |"]),
    "",
    "## Redacted Env Skeleton",
    "",
    "Copy these keys into the field `.env`, replacing placeholders on the delivery PC only. Do not paste real secret values into evidence.",
    "",
    "```dotenv",
    ...(manifest.envTemplateLines.length > 0 ? manifest.envTemplateLines : ["# no open env keys"]),
    "```",
    "",
    "## Suggested Field Env Draft",
    "",
    "Use this as a safer starting shape only. Replace host, port, CIDR, origin, and secret placeholders with approved field values before strict acceptance.",
    "",
    "```dotenv",
    ...(manifest.suggestedEnvLines.length > 0 ? manifest.suggestedEnvLines : ["# no open env keys"]),
    "```",
    "",
    "## Owner Env Skeletons",
    "",
    ...(manifest.ownerEnvTemplates.length > 0
      ? manifest.ownerEnvTemplates.flatMap((group) => [
          `### ${group.owner}`,
          "",
          `- Blocking: ${group.blockingCount}`,
          `- Review: ${group.reviewCount}`,
          "",
          "```dotenv",
          ...group.envTemplateLines,
          "```",
          "",
        ])
      : ["No owner-specific env skeletons remain.", ""]),
    "## Owner Closeout Checklists",
    "",
    ...(manifest.ownerCloseoutChecklists.length > 0
      ? manifest.ownerCloseoutChecklists.flatMap((group) => [
          `### ${group.owner}`,
          "",
          `- Step count: ${group.stepCount}`,
          "",
          "| Order | Step | Command / Placeholder | Done When |",
          "| --- | --- | --- | --- |",
          ...group.steps.map(
            (step) =>
              `| ${step.order} | ${markdownCell(step.title)} | \`${markdownCell(step.command)}\` | ${markdownCell(step.doneWhen)} |`,
          ),
          "",
        ])
      : ["No owner closeout checklists remain.", ""]),
    "## Closeout Items",
    "",
    "| Priority | Owner | Env Key | State | Redacted | Completion Gate | Next Action | Closeout Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.closeoutItems.length > 0
      ? manifest.closeoutItems.map(
          (item) =>
            `| ${item.priority} | ${markdownCell(item.owner)} | ${markdownCell(item.name)} | ${markdownCell(item.state)} | ${item.redacted ? "yes" : "no"} | ${markdownCell(item.completionGate)} | ${markdownCell(item.nextAction)} | ${markdownCell(item.closeoutCommand)} |`,
        )
      : ["| READY | none | none | configured | yes | No open field environment gate remains. | No action required. | Rerun final:refresh. |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-env-closeout");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildManifest({
    baseUrl: argValue("base-url", null),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field env closeout written to ${path.relative(root, outputDir)}`);
  console.log(`field env closeout status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManifest,
  buildMarkdown,
  actionCommandForItem,
  buildOwnerCloseoutChecklists,
  buildEnvTemplateLines,
  buildSuggestedEnvLines,
  envPlaceholderForItem,
  suggestedValueForItem,
};
