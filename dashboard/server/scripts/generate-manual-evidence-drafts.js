const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
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
  content = replaceTableValue(content, "Base API URL", options.baseApiUrl || `${options.baseUrl || "http://localhost:8080"}/api`);
  content = replaceTableValue(content, "Base URL", options.baseUrl);
  content = replaceTableValue(content, "Captured at", options.generatedAt);
  content = replaceTableValue(content, "Acceptance date", options.generatedAt ? options.generatedAt.slice(0, 10) : "");
  if (definition.type === "Field Risk Acceptance") {
    content = replaceAcceptedItemRows(content, options.riskAcceptanceDraftRows || []);
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
  const plan = buildManualEvidenceDraftPlan({ ...options, generatedAt });
  const items = plan.map((item) => {
    if (item.status !== "READY_TO_WRITE") return item;
    const definition = manualEvidenceDefinitions.find((candidate) => candidate.type === item.type);
    const templateContent = fs.readFileSync(path.join(root, definition.template), "utf8");
    const draftContent = buildDraftContent(templateContent, definition, {
      ...options,
      generatedAt,
      riskAcceptanceDraftRows,
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
    baseUrl: options.baseUrl || "http://localhost:8080",
    force: options.force === true,
    git: options.git || {
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: gitValue(["rev-parse", "HEAD"]),
      clean: gitValue(["status", "--short"]) === "",
    },
    sourceFieldRiskRegister: fieldRiskRegister?.path || null,
    riskAcceptanceDraftRowCount: riskAcceptanceDraftRows.length,
    riskAcceptanceDraftRows,
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
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/manual-evidence-drafts");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = writeManualEvidenceDrafts({
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
    reviewer: argValue("reviewer", ""),
    baseUrl: argValue("base-url", "http://localhost:8080"),
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
  buildRiskAcceptanceDraftRows,
  buildMarkdown,
  replaceAcceptedItemRows,
  writeManualEvidenceDrafts,
};
