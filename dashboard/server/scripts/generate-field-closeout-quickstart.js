const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { resolveFieldBaseUrl } = require("./field-env");
const { fieldEnvMeta, isSecretFieldEnvKey, suggestedValueForFieldEnvKey } = require("./field-env-catalog");

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

function buildEnvGuide(envKeys) {
  return (envKeys || []).map((key) => ({
    key,
    owner: fieldEnvMeta(key).owner,
    valueShape: fieldEnvMeta(key).valueShape,
    secret: fieldEnvMeta(key).secret === true,
    closes: fieldEnvMeta(key).closes,
    verify: fieldEnvMeta(key).verify,
  }));
}

function placeholderForEnvKey(key) {
  if (isSecretFieldEnvKey(key)) return "replace_in_field";
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
  return placeholders[key] || suggestedValueForFieldEnvKey(key) || "replace_in_field";
}

function sanitizeEnvPatchLine(line) {
  const match = String(line || "").match(/^\s*([^#=\s]+)\s*=(.*)$/);
  if (!match) return "";
  const key = match[1].trim();
  if (!key) return "";
  if (isSecretFieldEnvKey(key)) return `${key}=replace_in_field`;
  const value = String(match[2] || "").trim();
  if (!value || value === "<field-secret-redacted>" || value === "<field-value>") {
    return `${key}=${placeholderForEnvKey(key)}`;
  }
  return `${key}=${value}`;
}

function buildEnvPatchBlockLines(envGuide, fieldEnvCloseout) {
  const closeout = unwrapManifestData(fieldEnvCloseout);
  const closeoutLines = closeout?.envFile?.appendMissingEnvBlockLines || [];
  const sanitizedCloseoutLines = closeoutLines.map(sanitizeEnvPatchLine).filter(Boolean);
  if (sanitizedCloseoutLines.length > 0) return uniq(sanitizedCloseoutLines);
  return uniq((envGuide || []).map((item) => `${item.key}=${placeholderForEnvKey(item.key)}`));
}

function unwrapManifestData(manifest) {
  if (!manifest) return null;
  return manifest.data || manifest;
}

function summarizeRequirementsBacklog(fieldRequirementsBacklog) {
  const data = fieldRequirementsBacklog?.data || null;
  if (!data) {
    return {
      status: "MISSING",
      itemCount: null,
      openItemCount: null,
      ownerCount: null,
      priorityCounts: {},
      actionTypeCounts: {},
    };
  }
  const summary = data.summary || {};
  return {
    status: data.status || "UNKNOWN",
    itemCount: data.itemCount ?? summary.itemCount ?? null,
    openItemCount: data.openItemCount ?? data.itemCount ?? summary.itemCount ?? null,
    ownerCount: data.ownerCount ?? Object.keys(summary.byOwner || {}).length,
    priorityCounts: data.priorityCounts || summary.byPriority || {},
    actionTypeCounts: data.actionTypeCounts || summary.byActionType || {},
  };
}

function summarizeFieldAnswerSheet(fieldRequirementsBacklog) {
  const data = fieldRequirementsBacklog?.data || null;
  const rows = Array.isArray(data?.fieldAnswerSheet) ? data.fieldAnswerSheet : [];
  return {
    status: rows.length > 0 ? "OPEN" : data ? "EMPTY" : "MISSING",
    answerCount: rows.length,
    todoCount: rows.filter((row) => row.answerStatus === "TODO").length,
    riskAcceptanceCount: rows.filter((row) => row.riskAcceptanceNeeded === true).length,
    owners: uniq(rows.map((row) => row.owner)).sort(),
    rows: rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      priority: row.priority,
      answerStatus: row.answerStatus,
      question: row.question,
      envKeysToFill: row.envKeysToFill || [],
      evidenceToAttach: row.evidenceToAttach || [],
      runtimeToRun: row.runtimeToRun || [],
      commandToRerun: row.commandToRerun || "",
      riskAcceptanceNeeded: row.riskAcceptanceNeeded === true,
      targetRecheckDate: row.targetRecheckDate || "",
      closeWhen: row.closeWhen || "",
    })),
  };
}

function filterEnvGuide(envGuide, keys) {
  const keySet = new Set(keys);
  return (envGuide || []).filter((item) => keySet.has(item.key));
}

function buildFieldCloseoutPacket({ baseUrl, envGuide, fieldEnvCloseout, classification, finalStatus, requirementsBacklogSummary }) {
  const envData = unwrapManifestData(fieldEnvCloseout) || {};
  const summary = classification?.data?.summary || {};
  const remainingGates = finalStatus?.data?.remainingGates || [];
  const liveTcpKeys = ["CONTROL_BOARD_HOST", "CONTROL_BOARD_PORT", "CONTROL_BOARD_DRY_RUN", "CONTROL_BOARD_LIVE_APPROVED"];
  const strictPreflightKeys = [
    "JWT_SECRET",
    "CORS_ORIGINS",
    "DEVICE_INGEST_API_KEY",
    "AUTH_COOKIE_SECURE",
    "AUTH_COOKIE_SAMESITE",
    "NGINX_SWAGGER_ALLOW",
    "NGINX_CONTENT_SECURITY_POLICY",
    "NGINX_WRONGWAY_RATE_LIMIT",
    "NGINX_WRONGWAY_BURST",
    "SEED_ADMIN_PASSWORD",
  ];
  const reviewerKeys = ["FIELD_SITE_NAME", "FIELD_REVIEWER", "FIELD_BASE_URL"];
  const envGroups = [
    { id: "reviewer", label: "Reviewer/site metadata", keys: reviewerKeys },
    { id: "auth-security", label: "Auth/security delivery values", keys: strictPreflightKeys },
    { id: "control-board-live-tcp", label: "Control-board live TCP values", keys: liveTcpKeys },
  ].map((group) => ({
    ...group,
    items: filterEnvGuide(envGuide, group.keys),
    missingCount: filterEnvGuide(envGuide, group.keys).length,
  }));

  return {
    summary: {
      baseUrl,
      remainingGateCount: remainingGates.length,
      openEnvItemCount: envData.openItemCount ?? envData.closeoutItemCount ?? envData.summary?.openItemCount ?? null,
      blockingEnvItemCount: envData.blockingItemCount ?? envData.blockingCount ?? envData.summary?.blockingItemCount ?? null,
      reviewEnvItemCount: envData.reviewItemCount ?? envData.reviewCount ?? envData.summary?.reviewItemCount ?? null,
      fieldRequiredCount: summary.fieldRequiredCount ?? null,
      refreshOnlyCount: summary.refreshOnlyCount ?? null,
      requirementsBacklogOpenItemCount: requirementsBacklogSummary.openItemCount,
    },
    envGroups,
    liveTcpChecklist: [
      "Keep CONTROL_BOARD_DRY_RUN=true for every local rehearsal until hardware approval is recorded.",
      "Fill CONTROL_BOARD_HOST and CONTROL_BOARD_PORT with the integrated control-board TCP endpoint from the field network.",
      "Set CONTROL_BOARD_LIVE_APPROVED=true only for the approved live window, then set CONTROL_BOARD_DRY_RUN=false.",
      "Run scripts/control-board-field-rehearsal.ps1 with -AllowLiveTcp and capture acknowledged command evidence.",
      "Restore the agreed safe/default control-board state and refresh field readiness, field acceptance, and final status.",
    ],
    liveTcpStopConditions: [
      "Stop the live window immediately if any command returns NACK, timeout, malformed ACK, or CRC mismatch.",
      "Stop if the observed sign, speaker, or barrier state differs from the command intent or the field spotter report.",
      "Stop if the dashboard operator loses visibility of LiDAR events, control-board status, or Nginx/API health.",
      "Stop if the hardware owner cannot confirm the safe fallback state before the next command.",
    ],
    safeStateEvidenceChecklist: [
      "Capture the final control-board rehearsal manifest showing the last command result and ACK/NACK state.",
      "Record a field note or screenshot that the display, speaker, and barrier returned to the agreed safe/default state.",
      "Refresh field readiness, field acceptance, handover package, final status, and final gate classification after rollback.",
      "Attach the hardware owner and field reviewer names without exposing secrets, cookies, JWTs, or device ingest keys.",
    ],
    strictCommandSequence: [
      `npm.cmd run field:preflight -- -BaseUrl "${baseUrl}" -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict`,
      `npm.cmd run field:readiness -- --base-url="${baseUrl}"`,
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl "${baseUrl}" -AllowLiveTcp`,
      `npm.cmd run field:acceptance -- -BaseUrl "${baseUrl}" -StrictPreflight -RequireScanners`,
      `npm.cmd run handover:package -- --base-url="${baseUrl}" --strict`,
      `npm.cmd run final:status -- --base-url="${baseUrl}"`,
      `npm.cmd run final:gate-classification -- --base-url="${baseUrl}"`,
      `npm.cmd run field:closeout-quickstart -- --base-url="${baseUrl}"`,
    ],
    evidenceToAttach: [
      "artifacts/field-preflight/<timestamp>/manifest.json",
      "artifacts/field-readiness/<timestamp>/manifest.json",
      "artifacts/field-control-board-rehearsal/<timestamp>/manifest.json",
      "artifacts/field-acceptance/<timestamp>/manifest.json",
      "artifacts/security/<timestamp>/manifest.json",
      "artifacts/ci-status/<timestamp>/manifest.json",
      "artifacts/handover-package/<timestamp>/manifest.json",
      "artifacts/final-status/<timestamp>/manifest.json",
    ],
    unresolvedRequirements: [
      "Level-2 escalation rule is intentionally a field measurement requirement before implementation is closed.",
      "Live integrated control-board ACK cannot be marked complete without hardware-owner approval and captured ACK evidence.",
      "Delivery Nginx exposure values must be reviewed against the final operator network and Swagger access policy.",
    ],
  };
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
  const requirementsBacklogSummary = summarizeRequirementsBacklog(fieldRequirementsBacklog);
  const fieldAnswerSheetLinkage = summarizeFieldAnswerSheet(fieldRequirementsBacklog);
  const fieldCloseoutPacket = buildFieldCloseoutPacket({
    baseUrl,
    envGuide,
    fieldEnvCloseout,
    classification,
    finalStatus,
    requirementsBacklogSummary,
  });
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
    requirementsBacklogSummary,
    fieldAnswerSheetLinkage,
    remainingGateCount: finalStatus?.data?.remainingGates?.length ?? null,
    openActionCount: actionItems.length,
    bucketGateCounts: summary.bucketGateCounts || {},
    fieldRequiredCount: summary.fieldRequiredCount ?? null,
    securityRequiredCount: summary.bucketGateCounts?.security_tooling ?? null,
    reviewRequiredCount: (finalStatus?.data?.remainingGates || []).filter((gate) => gate.actionType === "REVIEW_REQUIRED").length,
    prerequisites,
    envGuide,
    envPatchBlockLines: buildEnvPatchBlockLines(envGuide, fieldEnvCloseout),
    fieldCloseoutPacket,
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
    "## Requirements Backlog Summary",
    "",
    `- Status: ${manifest.requirementsBacklogSummary.status}`,
    `- Item count: ${manifest.requirementsBacklogSummary.itemCount ?? "unknown"}`,
    `- Open item count: ${manifest.requirementsBacklogSummary.openItemCount ?? "unknown"}`,
    `- Owner count: ${manifest.requirementsBacklogSummary.ownerCount ?? "unknown"}`,
    `- Priority counts: ${JSON.stringify(manifest.requirementsBacklogSummary.priorityCounts)}`,
    `- Action type counts: ${JSON.stringify(manifest.requirementsBacklogSummary.actionTypeCounts)}`,
    `- Field answer sheet status: ${manifest.fieldAnswerSheetLinkage.status}`,
    `- Field answer sheet TODO count: ${manifest.fieldAnswerSheetLinkage.todoCount}`,
    `- Field answer sheet risk-acceptance count: ${manifest.fieldAnswerSheetLinkage.riskAcceptanceCount}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Field Closeout Packet",
    "",
    `- Packet base URL: ${manifest.fieldCloseoutPacket.summary.baseUrl}`,
    `- Packet remaining gates: ${manifest.fieldCloseoutPacket.summary.remainingGateCount}`,
    `- Packet open env items: ${manifest.fieldCloseoutPacket.summary.openEnvItemCount ?? "unknown"}`,
    `- Packet blocking env items: ${manifest.fieldCloseoutPacket.summary.blockingEnvItemCount ?? "unknown"}`,
    `- Packet review env items: ${manifest.fieldCloseoutPacket.summary.reviewEnvItemCount ?? "unknown"}`,
    `- Packet field-required gates: ${manifest.fieldCloseoutPacket.summary.fieldRequiredCount ?? "unknown"}`,
    `- Packet refresh-only gates: ${manifest.fieldCloseoutPacket.summary.refreshOnlyCount ?? "unknown"}`,
    `- Packet open requirements: ${manifest.fieldCloseoutPacket.summary.requirementsBacklogOpenItemCount ?? "unknown"}`,
    "",
    "### Required Field Inputs",
    "",
    ...(manifest.fieldCloseoutPacket.envGroups.length > 0
      ? manifest.fieldCloseoutPacket.envGroups.flatMap((group) => [
          `#### ${group.label}`,
          "",
          "| Key | Owner | Secret | Value Shape | Verify With |",
          "| --- | --- | --- | --- | --- |",
          ...(group.items.length > 0
            ? group.items.map(
                (item) =>
                  `| ${markdownCell(item.key)} | ${markdownCell(item.owner)} | ${item.secret ? "yes" : "no"} | ${markdownCell(item.valueShape)} | ${markdownCell(item.verify)} |`,
              )
            : ["| none | - | no | - | - |"]),
          "",
        ])
      : ["- none", ""]),
    "### Live TCP ACK Checklist",
    "",
    ...manifest.fieldCloseoutPacket.liveTcpChecklist.map((item) => `- ${item}`),
    "",
    "### Live TCP Stop Conditions",
    "",
    ...manifest.fieldCloseoutPacket.liveTcpStopConditions.map((item) => `- ${item}`),
    "",
    "### Safe State Evidence Checklist",
    "",
    ...manifest.fieldCloseoutPacket.safeStateEvidenceChecklist.map((item) => `- ${item}`),
    "",
    "### Strict Closeout Command Sequence",
    "",
    ...manifest.fieldCloseoutPacket.strictCommandSequence.map((command, index) => `${index + 1}. \`${command}\``),
    "",
    "### Evidence To Attach",
    "",
    ...manifest.fieldCloseoutPacket.evidenceToAttach.map((item) => `- \`${item}\``),
    "",
    "### Deferred Field Requirements",
    "",
    ...manifest.fieldCloseoutPacket.unresolvedRequirements.map((item) => `- ${item}`),
    "",
    "## Field Answer Sheet Linkage",
    "",
    "Use this linkage after filling the field requirements backlog answer sheet. Every row keeps secrets out of evidence and points back to the command that should be rerun after the answer or evidence is available.",
    "",
    `- Answer rows: ${manifest.fieldAnswerSheetLinkage.answerCount}`,
    `- TODO rows: ${manifest.fieldAnswerSheetLinkage.todoCount}`,
    `- Risk acceptance rows: ${manifest.fieldAnswerSheetLinkage.riskAcceptanceCount}`,
    `- Owners: ${manifest.fieldAnswerSheetLinkage.owners.join(", ") || "none"}`,
    "",
    "| ID | Owner | Priority | Status | Question | Env Keys | Evidence | Runtime | Command To Rerun | Risk Acceptance | Target Recheck Date | Close When |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.fieldAnswerSheetLinkage.rows.length > 0
      ? manifest.fieldAnswerSheetLinkage.rows.map(
          (item) =>
            `| ${item.id} | ${markdownCell(item.owner)} | ${item.priority} | ${markdownCell(item.answerStatus)} | ${markdownCell(item.question)} | ${markdownCell(item.envKeysToFill.join(", ") || "-")} | ${markdownCell(item.evidenceToAttach.join(", ") || "-")} | ${markdownCell(item.runtimeToRun.join(", ") || "-")} | ${markdownCell(item.commandToRerun || "-")} | ${item.riskAcceptanceNeeded ? "yes" : "no"} | ${markdownCell(item.targetRecheckDate || "YYYY-MM-DD")} | ${markdownCell(item.closeWhen)} |`,
        )
      : ["| - | none | - | DONE | No field answer rows. | - | - | - | - | no | - | - |"]),
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
  buildFieldCloseoutPacket,
  summarizeFieldAnswerSheet,
};
