const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { resolveFieldBaseUrl } = require("./field-env");
const { manualEvidenceDefinitions } = require("./manual-evidence");

const root = path.join(__dirname, "..", "..", "..");
const manualEvidenceTargetPaths = [
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.stdout.trim();
}

function replaceTableValue(content, item, value) {
  if (!value) return content;
  return content
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split("|");
      if (cells.length < 4 || cells[1].trim() !== item) return line;
      cells[2] = ` ${value} `;
      return cells.join("|");
    })
    .join("\n");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildRiskAcceptanceDraftRows(fieldRiskRegister) {
  const items = fieldRiskRegister?.data?.riskItems || [];
  return items
    .filter((item) => item.copyToRiskAcceptance)
    .map((item) => ({
      status: "TODO",
      area: item.area || "Field risk",
      riskAccepted: item.risk || "Open field/security/manual gate remains accepted for delivery.",
      compensatingControl: "TODO: reviewer-approved compensating control.",
      evidenceReference: item.evidenceReference || fieldRiskRegister?.path || "artifacts/field-risk-register/<timestamp>/manifest.json",
      expiryOrRecheck: "TODO",
      owner: item.owner || "Field Operations",
    }));
}

function buildOperatorWalkthroughCapturePlan(options = {}) {
  const baseUrl = resolveFieldBaseUrl(options.baseUrl);
  const baseApiUrl = options.baseApiUrl || `${baseUrl}/api`;
  const trim = (value) => String(value || "").replace(/\/+$/, "");
  const ui = trim(baseUrl);
  const api = trim(baseApiUrl);
  return [
    {
      screen: "Login",
      route: `${ui}/login`,
      apiCheck: `${api}/auth/me`,
      evidenceHint: "Capture the login form and the signed-in operator session without recording credentials, JWTs, or cookies.",
    },
    {
      screen: "Dashboard",
      route: `${ui}/`,
      apiCheck: `${api}/status`,
      evidenceHint: "Capture server, detector, control-board state, latest event, latest command, and realtime state.",
    },
    {
      screen: "Control-board mode",
      route: `${ui}/settings`,
      apiCheck: `${api}/control-board/status`,
      evidenceHint: "Capture DRY_RUN/LIVE_TCP mode, liveApproved, packet hex, latest command status, and any LIVE_TCP_APPROVAL_REQUIRED state.",
    },
    {
      screen: "Event detail",
      route: `${ui}/events`,
      apiCheck: `${api}/events`,
      evidenceHint: "Capture raw LiDAR payload, wrong-way stage, linked command timeline, response/CRC evidence, and event logs.",
    },
    {
      screen: "Devices",
      route: `${ui}/devices`,
      apiCheck: `${api}/devices/status`,
      evidenceHint: "Capture LiDAR PC, control board, device connection/status history, or the configured empty state.",
    },
    {
      screen: "Event Log",
      route: `${ui}/events`,
      apiCheck: `${api}/ingest/events/recent`,
      evidenceHint: "Capture realtime connected/degraded/disabled state and polling fallback behavior.",
    },
    {
      screen: "Statistics",
      route: `${ui}/`,
      apiCheck: `${api}/statistics/traffic?range=daily`,
      evidenceHint: "Capture daily, weekly, monthly, yearly unique normal/wrong-way counts and wrong-way rate.",
    },
    {
      screen: "Swagger",
      route: `${ui}/api-docs`,
      apiCheck: `${ui}/api-docs.json`,
      evidenceHint: "Capture auth schemes plus wrong-way/control-board endpoints under the approved Swagger exposure policy.",
    },
  ];
}

function buildOperatorCapturePlanMarkdown(rows) {
  if (!rows || rows.length === 0) return "";
  return [
    "## Capture Route Checklist",
    "",
    "Use these reviewer-facing routes to collect the screenshot and browser/network notes required above. This checklist does not replace PASS rows in `## Required Screens`.",
    "",
    "| Screen | Route | API Or Network Check | Evidence Hint |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${markdownCell(row.screen)} | \`${markdownCell(row.route)}\` | \`${markdownCell(row.apiCheck)}\` | ${markdownCell(row.evidenceHint)} |`,
    ),
    "",
  ].join("\n");
}

function buildFieldAcceptanceEvidencePackPlan(options = {}) {
  const baseUrl = resolveFieldBaseUrl(options.baseUrl);
  const baseApiUrl = options.baseApiUrl || `${baseUrl}/api`;
  const trim = (value) => String(value || "").replace(/\/+$/, "");
  const ui = trim(baseUrl);
  const api = trim(baseApiUrl);
  return [
    {
      phase: "Reviewer metadata",
      evidence: "FIELD_REVIEWER, FIELD_SITE_NAME, FIELD_BASE_URL, browser version, display resolution, and capture timestamp.",
      closeWhen: "All values are concrete delivery-session values and contain no placeholders such as TBD, unknown, or pending.",
    },
    {
      phase: "Operator route walkthrough",
      evidence: `Screenshots and browser/network notes for ${ui}/login, ${ui}/, ${ui}/events, ${ui}/devices, ${ui}/settings, ${ui}/api-docs, and API checks under ${api}.`,
      closeWhen: "Every Required Screens row is PASS and the evidence table links screenshot plus field-acceptance and handover-package manifests.",
    },
    {
      phase: "Level-2 escalation criteria",
      evidence: "Approved field-measurement basis for dashboard-side wrong-way level-2 escalation, including threshold owner, measurement source, and effective date.",
      closeWhen: "The approved threshold is attached or the limitation remains open; Codex must not invent level-2 criteria before field measurement approval.",
    },
    {
      phase: "Traffic statistics reconciliation",
      evidence: "Daily, weekly, monthly, and yearly unique normal/wrong-way counts plus wrong-way rate from the UI and `/api/statistics/traffic`.",
      closeWhen: "Reviewer confirms DB unique vehicle-track counts match the displayed KPI values for the sampled delivery window.",
    },
    {
      phase: "Control-board safety ladder",
      evidence: "DRY_RUN proof, LIVE_TCP approval proof, 10-byte packet hex, ACK/CRC evidence, and the post-LIVE TCP verification sequence after real hardware send.",
      closeWhen: "No barrier-affecting LIVE_TCP command is sent before hardware-owner approval, and post-live verification confirms the expected safe state.",
    },
    {
      phase: "Final package linkage",
      evidence: "Latest field acceptance, manual evidence readiness, field risk acceptance, handover package, final status, and final bundle handoff manifests.",
      closeWhen: "Strict handover package and final status reference the same pushed dev commit and show no stale local-only evidence.",
    },
  ];
}

function buildFieldAcceptanceEvidencePackMarkdown(rows) {
  if (!rows || rows.length === 0) return "";
  return [
    "## Field Acceptance Evidence Pack Checklist",
    "",
    "Use this sequence after the route walkthrough so reviewer evidence closes the same gates that final-status and final-bundle-handoff report. Keep field-measurement-dependent items open until an approved owner provides concrete criteria.",
    "",
    "| Phase | Evidence To Attach | Close When |",
    "| --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${markdownCell(row.phase)} | ${markdownCell(row.evidence)} | ${markdownCell(row.closeWhen)} |`,
    ),
    "",
  ].join("\n");
}

function replaceAcceptedItemRows(content, rows) {
  if (!rows || rows.length === 0) return content;
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes("| Status | Area | Risk Accepted |"));
  if (headerIndex === -1) return content;
  const bodyStart = headerIndex + 2;
  let bodyEnd = bodyStart;
  while (bodyEnd < lines.length && lines[bodyEnd].trim().startsWith("|")) {
    bodyEnd += 1;
  }
  const replacement = rows.map(
    (row) =>
      `| ${markdownCell(row.status)} | ${markdownCell(row.area)} | ${markdownCell(row.riskAccepted)} | ${markdownCell(row.compensatingControl)} | ${markdownCell(row.evidenceReference)} | ${markdownCell(row.expiryOrRecheck)} |`,
  );
  return [...lines.slice(0, bodyStart), ...replacement, ...lines.slice(bodyEnd)].join("\n");
}

function buildDraftContent(templateContent, definition, options = {}) {
  let content = templateContent;
  content = replaceTableValue(content, "Site name", options.siteName);
  content = replaceTableValue(content, "Reviewer", options.reviewer);
  content = replaceTableValue(content, "Entry URL", options.baseUrl);
  content = replaceTableValue(content, "Base API URL", options.baseApiUrl || `${resolveFieldBaseUrl(options.baseUrl)}/api`);
  content = replaceTableValue(content, "Base URL", options.baseUrl);
  content = replaceTableValue(content, "Captured at", options.generatedAt);
  content = replaceTableValue(content, "Acceptance date", options.generatedAt ? options.generatedAt.slice(0, 10) : "");
  if (definition.type === "Field Risk Acceptance") {
    content = replaceAcceptedItemRows(content, options.riskAcceptanceDraftRows || []);
  }
  if (definition.type === "Operator UI Walkthrough") {
    const checklist = buildOperatorCapturePlanMarkdown(options.operatorWalkthroughCapturePlan || []);
    if (checklist && !content.includes("## Capture Route Checklist")) {
      content = `${content.trimEnd()}\n\n${checklist}`;
    }
    const evidencePack = buildFieldAcceptanceEvidencePackMarkdown(options.fieldAcceptanceEvidencePackPlan || []);
    if (evidencePack && !content.includes("## Field Acceptance Evidence Pack Checklist")) {
      content = `${content.trimEnd()}\n\n${evidencePack}`;
    }
  }

  const header = [
    "<!--",
    "Generated manual evidence draft.",
    "Fill reviewer-only values, replace TODO rows after real walkthrough/review, and do not include secrets.",
    "This draft is not valid final evidence until manual:evidence-readiness reports PRESENT.",
    "-->",
    "",
  ].join("\n");

  return content.startsWith("<!--\nGenerated manual evidence draft.") ? content : `${header}${content}`;
}

function buildManualEvidenceDraftPlan(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  return manualEvidenceDefinitions.map((definition) => {
    const templatePath = path.join(root, definition.template);
    const targetPath = path.join(root, definition.path);
    const templateExists = fs.existsSync(templatePath);
    const targetExists = fs.existsSync(targetPath);
    const shouldWrite = templateExists && (!targetExists || options.force === true);
    return {
      type: definition.type,
      templatePath: definition.template,
      targetPath: definition.path,
      templateExists,
      targetExists,
      status: shouldWrite ? "READY_TO_WRITE" : targetExists ? "SKIP_EXISTS" : "TEMPLATE_MISSING",
      force: options.force === true,
      generatedAt,
      nextAction: shouldWrite
        ? "Write the draft, then fill reviewer evidence and rerun manual:evidence-readiness."
        : targetExists
          ? "Existing manual evidence draft/evidence was preserved. Use --force only after backing up reviewer content."
          : "Restore the missing template before drafting manual evidence.",
    };
  });
}

function writeManualEvidenceDrafts(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const fieldRiskRegister = options.fieldRiskRegister || readLatestJsonManifest("artifacts/field-risk-register");
  const riskAcceptanceDraftRows = options.riskAcceptanceDraftRows || buildRiskAcceptanceDraftRows(fieldRiskRegister);
  const operatorWalkthroughCapturePlan = options.operatorWalkthroughCapturePlan || buildOperatorWalkthroughCapturePlan(options);
  const fieldAcceptanceEvidencePackPlan =
    options.fieldAcceptanceEvidencePackPlan || buildFieldAcceptanceEvidencePackPlan(options);
  const plan = buildManualEvidenceDraftPlan({ ...options, generatedAt });
  const items = plan.map((item) => {
    if (item.status !== "READY_TO_WRITE") return item;
    const definition = manualEvidenceDefinitions.find((candidate) => candidate.type === item.type);
    const templateContent = fs.readFileSync(path.join(root, definition.template), "utf8");
    const draftContent = buildDraftContent(templateContent, definition, {
      ...options,
      generatedAt,
      riskAcceptanceDraftRows,
      operatorWalkthroughCapturePlan,
      fieldAcceptanceEvidencePackPlan,
    });
    const targetPath = path.join(root, definition.path);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, draftContent);
    return { ...item, status: "CREATED" };
  });

  return {
    generatedAt,
    generatedBy: options.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: options.siteName || "unspecified",
    hostName: os.hostname(),
    baseUrl: resolveFieldBaseUrl(options.baseUrl),
    force: options.force === true,
    git: options.git || {
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: gitValue(["rev-parse", "HEAD"]),
      clean: gitValue(["status", "--short"]) === "",
    },
    sourceFieldRiskRegister: fieldRiskRegister?.path || null,
    riskAcceptanceDraftRowCount: riskAcceptanceDraftRows.length,
    riskAcceptanceDraftRows,
    operatorWalkthroughCapturePlan,
    fieldAcceptanceEvidencePackPlan,
    createdCount: items.filter((item) => item.status === "CREATED").length,
    skippedCount: items.filter((item) => item.status === "SKIP_EXISTS").length,
    missingTemplateCount: items.filter((item) => item.status === "TEMPLATE_MISSING").length,
    items,
    guardrails: [
      "Draft files are not final evidence.",
      "Do not commit artifacts/manual files unless the delivery policy explicitly changes.",
      "Do not include passwords, JWTs, cookies, private keys, or unrestricted internal network maps.",
      "Run npm.cmd run manual:evidence-readiness after reviewer values are filled.",
    ],
  };
}

function buildMarkdown(manifest) {
  return [
    "# Manual Evidence Drafts",
    "",
    `- Created: ${manifest.createdCount}`,
    `- Skipped existing: ${manifest.skippedCount}`,
    `- Missing templates: ${manifest.missingTemplateCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Force overwrite: ${manifest.force}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Source field risk register: ${manifest.sourceFieldRiskRegister || "missing"}`,
    `- Risk acceptance draft rows: ${manifest.riskAcceptanceDraftRowCount}`,
    `- Operator walkthrough capture routes: ${manifest.operatorWalkthroughCapturePlan.length}`,
    `- Field acceptance evidence pack phases: ${manifest.fieldAcceptanceEvidencePackPlan.length}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Draft Targets",
    "",
    "| Type | Status | Target | Template | Next Action |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.items.map(
      (item) =>
        `| ${markdownCell(item.type)} | ${markdownCell(item.status)} | \`${markdownCell(item.targetPath)}\` | \`${markdownCell(item.templatePath)}\` | ${markdownCell(item.nextAction)} |`,
    ),
    "",
    "## Risk Acceptance Draft Rows",
    "",
    "These rows are copied from the latest field risk register to help the reviewer fill `artifacts/manual/field-risk-acceptance.md`. They are not final acceptance until the reviewer replaces TODO values and `manual:evidence-readiness` reports PRESENT.",
    "",
    "| Status | Area | Risk Accepted | Compensating Control | Evidence Reference | Expiry Or Recheck | Owner |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.riskAcceptanceDraftRows.length > 0
      ? manifest.riskAcceptanceDraftRows.map(
          (row) =>
            `| ${markdownCell(row.status)} | ${markdownCell(row.area)} | ${markdownCell(row.riskAccepted)} | ${markdownCell(row.compensatingControl)} | ${markdownCell(row.evidenceReference)} | ${markdownCell(row.expiryOrRecheck)} | ${markdownCell(row.owner)} |`,
        )
      : ["| none | - | No field-risk-register rows are currently marked for risk acceptance. | - | - | - | - |"]),
    "",
    "## Operator Walkthrough Capture Routes",
    "",
    "These routes are copied into newly created operator walkthrough drafts to guide screenshot and browser/network capture. They are not final evidence until the reviewer records PASS rows and evidence references.",
    "",
    "| Screen | Route | API Or Network Check | Evidence Hint |",
    "| --- | --- | --- | --- |",
    ...(manifest.operatorWalkthroughCapturePlan.length > 0
      ? manifest.operatorWalkthroughCapturePlan.map(
          (row) =>
            `| ${markdownCell(row.screen)} | \`${markdownCell(row.route)}\` | \`${markdownCell(row.apiCheck)}\` | ${markdownCell(row.evidenceHint)} |`,
        )
      : ["| none | - | - | No operator walkthrough routes were generated. |"]),
    "",
    "## Field Acceptance Evidence Pack Checklist",
    "",
    "This sequence helps reviewers close field acceptance, level-2 escalation, control-board safety, statistics reconciliation, and final package linkage without inventing field-only evidence.",
    "",
    "| Phase | Evidence To Attach | Close When |",
    "| --- | --- | --- |",
    ...(manifest.fieldAcceptanceEvidencePackPlan.length > 0
      ? manifest.fieldAcceptanceEvidencePackPlan.map(
          (row) =>
            `| ${markdownCell(row.phase)} | ${markdownCell(row.evidence)} | ${markdownCell(row.closeWhen)} |`,
        )
      : ["| none | - | No field acceptance evidence pack phases were generated. |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/manual-evidence-drafts");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = writeManualEvidenceDrafts({
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
    reviewer: argValue("reviewer", ""),
    baseUrl: argValue("base-url", resolveFieldBaseUrl()),
    baseApiUrl: argValue("base-api-url", ""),
    force: hasFlag("force"),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`manual evidence drafts report written to ${path.relative(root, outputDir)}`);
  console.log(`manual evidence drafts created=${manifest.createdCount} skipped=${manifest.skippedCount}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDraftContent,
  buildManualEvidenceDraftPlan,
  buildOperatorWalkthroughCapturePlan,
  buildFieldAcceptanceEvidencePackPlan,
  buildRiskAcceptanceDraftRows,
  buildMarkdown,
  buildOperatorCapturePlanMarkdown,
  buildFieldAcceptanceEvidencePackMarkdown,
  replaceAcceptedItemRows,
  writeManualEvidenceDrafts,
};
