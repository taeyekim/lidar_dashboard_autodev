const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { manualEvidenceRefs } = require("./manual-evidence");

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

function evidencePath(manifest) {
  return manifest?.path || null;
}

function ownerForArea(area) {
  const text = String(area || "").toLowerCase();
  if (text.includes("security") || text.includes("scanner") || text.includes("cookie") || text.includes("jwt")) return "Auth/Security";
  if (text.includes("device") || text.includes("ingest") || text.includes("lidar")) return "LiDAR Ingest";
  if (text.includes("control") || text.includes("tcp") || text.includes("hardware")) return "Control-board TCP";
  if (text.includes("swagger") || text.includes("nginx")) return "Nginx Delivery";
  if (text.includes("operator") || text.includes("manual")) return "PM/QA";
  return "Field Operations";
}

function riskAreaForFieldValue(name) {
  const mapping = {
    DEVICE_INGEST_API_KEY: "DEVICE_INGEST_API_KEY trusted-LAN exception",
    AUTH_COOKIE_SECURE: "HTTPS cookie posture",
    AUTH_COOKIE_SAMESITE: "Cookie SameSite posture",
    NGINX_SWAGGER_ALLOW: "Swagger exposure",
    NGINX_WRONGWAY_RATE_LIMIT: "Nginx wrong-way rate limit",
    NGINX_WRONGWAY_BURST: "Nginx wrong-way rate limit",
    NGINX_CONTENT_SECURITY_POLICY: "Nginx content security policy",
    CONTROL_BOARD_DRY_RUN: "Control-board live TCP",
    CONTROL_BOARD_HOST: "Control-board live TCP",
    CONTROL_BOARD_PORT: "Control-board live TCP",
    CONTROL_BOARD_LIVE_APPROVED: "Control-board live approval",
  };
  return mapping[name] || `${name} field value`;
}

function riskForFieldValue(item) {
  return {
    area: riskAreaForFieldValue(item.name),
    source: "field-readiness.envActionGroups",
    status: item.priority,
    risk: `${item.name} is ${item.state}, so the related completion gate remains open.`,
    preferredResolution: item.nextAction,
    acceptableRiskPath: "If the field owner intentionally accepts this posture, record the decision in artifacts/manual/field-risk-acceptance.md using docs/ops/field-risk-acceptance-template.md.",
    evidenceReference: "artifacts/field-readiness/<timestamp>/manifest.json",
    owner: ownerForArea(riskAreaForFieldValue(item.name)),
    targetRecheckDate: "TODO",
    requiresReviewerDecision: item.priority !== "READY",
    copyToRiskAcceptance: item.priority !== "READY",
  };
}

function buildFieldValueRisks(fieldReadiness) {
  const groups = fieldReadiness?.data?.env?.envActionGroups || [];
  return groups.flatMap((group) =>
    (group.items || [])
      .filter((item) => item.priority && item.priority !== "READY")
      .map((item) => ({
        ...riskForFieldValue(item),
        owner: group.owner || ownerForArea(item.name),
        sourceManifest: evidencePath(fieldReadiness),
      })),
  );
}

function buildSecurityRisks(security) {
  const checks = security?.data?.checks || [];
  return checks
    .filter((check) => check.disposition?.code === "BLOCKING" || check.status === "skipped")
    .map((check) => ({
      area: "Security scanners",
      source: "security.evidence",
      status: check.disposition?.code || check.status,
      risk: `${check.label} is ${check.status}: ${check.reason || check.disposition?.reason || "security scanner evidence is not complete"}.`,
      preferredResolution: "Install/approve the scanner and rerun npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=<delivery-url>.",
      acceptableRiskPath: "If the scanner cannot be installed or run on the field PC, record reviewer acceptance, compensating controls, owner, and recheck date in artifacts/manual/field-risk-acceptance.md.",
      evidenceReference: evidencePath(security) || "artifacts/security/<timestamp>/manifest.json",
      owner: "Auth/Security",
      targetRecheckDate: "TODO",
      requiresReviewerDecision: true,
      copyToRiskAcceptance: true,
    }));
}

function riskAreaForGate(gate) {
  const text = `${gate.category || ""} ${gate.message || ""}`.toLowerCase();
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) return "Security scanners";
  if (text.includes("swagger")) return "Swagger exposure";
  if (text.includes("rate limit") || text.includes("burst")) return "Nginx wrong-way rate limit";
  if (text.includes("content security") || text.includes("csp")) return "Nginx content security policy";
  if (text.includes("samesite")) return "Cookie SameSite posture";
  if (text.includes("cookie") || text.includes("https")) return "HTTPS cookie posture";
  if (text.includes("device") || text.includes("ingest")) return "DEVICE_INGEST_API_KEY trusted-LAN exception";
  if (text.includes("control") || text.includes("tcp") || text.includes("live")) return "Control-board live TCP";
  if (text.includes("operator") || text.includes("walkthrough")) return "Operator UI walkthrough";
  if (text.includes("manual") || text.includes("risk acceptance")) return "Manual risk acceptance";
  return gate.category || "Field risk";
}

function buildFinalStatusRisks(finalStatus) {
  const gates = finalStatus?.data?.remainingGates || [];
  return gates
    .filter((gate) => ["FIELD_ACTION_REQUIRED", "SECURITY_REVIEW_REQUIRED", "MANUAL_EVIDENCE_REQUIRED"].includes(gate.actionType))
    .map((gate) => ({
      area: riskAreaForGate(gate),
      source: "final-status.remainingGates",
      status: gate.status,
      risk: gate.message || `${gate.category} gate remains open.`,
      preferredResolution: gate.closeWhen || "Resolve the gate and rerun npm.cmd run final:status.",
      acceptableRiskPath: gate.actionType === "MANUAL_EVIDENCE_REQUIRED"
        ? "Attach the required reviewer-filled manual evidence file before final close."
        : "If the field reviewer accepts this risk instead of direct resolution, document the decision in artifacts/manual/field-risk-acceptance.md.",
      evidenceReference: gate.evidence || evidencePath(finalStatus) || "artifacts/final-status/<timestamp>/manifest.json",
      owner: ownerForArea(riskAreaForGate(gate)),
      targetRecheckDate: "TODO",
      requiresReviewerDecision: true,
      copyToRiskAcceptance: gate.actionType !== "MANUAL_EVIDENCE_REQUIRED",
    }));
}

function buildManualEvidenceRisks() {
  return manualEvidenceRefs()
    .filter((item) => item.required && item.status !== "PRESENT")
    .map((item) => ({
      area: item.type,
      source: "manual-evidence.refs",
      status: item.status,
      risk: `${item.type} evidence is ${item.status}: ${item.validationReason || "required manual evidence is not present"}.`,
      preferredResolution: item.nextAction || `Fill ${item.template} and save the field copy to ${item.path}.`,
      acceptableRiskPath: item.type === "Field Risk Acceptance"
        ? "This item is the acceptance target; it must be completed when risks are accepted."
        : "Attach the reviewer-filled manual evidence before strict field acceptance.",
      evidenceReference: item.path,
      owner: "PM/QA",
      targetRecheckDate: "TODO",
      requiresReviewerDecision: true,
      copyToRiskAcceptance: item.type === "Field Risk Acceptance",
    }));
}

function dedupeRisks(risks) {
  const seen = new Set();
  return risks.filter((risk) => {
    const key = `${risk.area}|${risk.source}|${risk.risk}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupRiskItems(items) {
  return Object.values(
    items.reduce((acc, item) => {
      if (!acc[item.area]) {
        acc[item.area] = {
          area: item.area,
          count: 0,
          reviewerDecisionCount: 0,
          copyToRiskAcceptanceCount: 0,
          owners: [],
          items: [],
        };
      }
      acc[item.area].count += 1;
      if (item.requiresReviewerDecision) acc[item.area].reviewerDecisionCount += 1;
      if (item.copyToRiskAcceptance) acc[item.area].copyToRiskAcceptanceCount += 1;
      acc[item.area].owners = [...new Set([...acc[item.area].owners, item.owner].filter(Boolean))];
      acc[item.area].items.push(item);
      return acc;
    }, {}),
  );
}

function buildManifest(options = {}) {
  const finalStatus = options.finalStatus || readLatestJsonManifest("artifacts/final-status");
  const fieldReadiness = options.fieldReadiness || readLatestJsonManifest("artifacts/field-readiness");
  const security = options.security || readLatestJsonManifest("artifacts/security");
  const manualReadiness = options.manualReadiness || readLatestJsonManifest("artifacts/manual-evidence-readiness");
  const riskItems = dedupeRisks([
    ...buildFieldValueRisks(fieldReadiness),
    ...buildSecurityRisks(security),
    ...buildFinalStatusRisks(finalStatus),
    ...buildManualEvidenceRisks(),
  ]);
  const groups = groupRiskItems(riskItems);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    generatedBy: options.generatedBy || process.env.USERNAME || process.env.USER || "Codex",
    siteName: options.siteName || finalStatus?.data?.siteName || "unspecified",
    hostName: options.hostName || os.hostname(),
    baseUrl: options.baseUrl || finalStatus?.data?.baseUrl || "http://localhost:8080",
    status: riskItems.length > 0 ? "OPEN" : "NO_OPEN_RISKS",
    openRiskCount: riskItems.length,
    copyToRiskAcceptanceCount: riskItems.filter((item) => item.copyToRiskAcceptance).length,
    reviewerDecisionCount: riskItems.filter((item) => item.requiresReviewerDecision).length,
    sourceFinalStatus: evidencePath(finalStatus),
    sourceFieldReadiness: evidencePath(fieldReadiness),
    sourceSecurityEvidence: evidencePath(security),
    sourceManualEvidenceReadiness: evidencePath(manualReadiness),
    git: {
      branch: options.git?.branch || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: options.git?.commit || gitValue(["rev-parse", "HEAD"]),
      clean: options.git?.clean ?? gitValue(["status", "--short"]) === "",
    },
    riskGroups: groups,
    riskItems,
    guardrails: [
      "This risk register is preparation evidence, not reviewer acceptance.",
      "Final completion still requires artifacts/manual/field-risk-acceptance.md when risks are accepted.",
      "Do not include secret values in risk acceptance evidence.",
    ],
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# Field Risk Register",
    "",
    `- Status: ${manifest.status}`,
    `- Open risk count: ${manifest.openRiskCount}`,
    `- Copy to risk acceptance count: ${manifest.copyToRiskAcceptanceCount}`,
    `- Reviewer decision count: ${manifest.reviewerDecisionCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Source final status: ${manifest.sourceFinalStatus || "missing"}`,
    `- Source field readiness: ${manifest.sourceFieldReadiness || "missing"}`,
    `- Source security evidence: ${manifest.sourceSecurityEvidence || "missing"}`,
    `- Source manual evidence readiness: ${manifest.sourceManualEvidenceReadiness || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Risk Groups",
    "",
    "| Area | Count | Reviewer Decisions | Copy To Risk Acceptance | Owners |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.riskGroups.length > 0
      ? manifest.riskGroups.map((group) => `| ${markdownCell(group.area)} | ${group.count} | ${group.reviewerDecisionCount} | ${group.copyToRiskAcceptanceCount} | ${markdownCell(group.owners.join(", "))} |`)
      : ["| none | 0 | 0 | 0 | - |"]),
    "",
    "## Risk Items",
    "",
    "| Area | Status | Owner | Risk | Preferred Resolution | Acceptable Risk Path | Evidence | Copy To Risk Acceptance | Target Recheck Date |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.riskItems.length > 0
      ? manifest.riskItems.map(
          (item) =>
            `| ${markdownCell(item.area)} | ${markdownCell(item.status)} | ${markdownCell(item.owner)} | ${markdownCell(item.risk)} | ${markdownCell(item.preferredResolution)} | ${markdownCell(item.acceptableRiskPath)} | ${item.evidenceReference ? `\`${markdownCell(item.evidenceReference)}\`` : "missing"} | ${item.copyToRiskAcceptance ? "yes" : "no"} | ${markdownCell(item.targetRecheckDate)} |`,
        )
      : ["| none | PASS | - | No open field risks. | - | - | - | no | - |"]),
    "",
    "## Risk Acceptance Draft Rows",
    "",
    "| Decision | Area | Accepted Risk | Compensating Control | Evidence | Recheck Date |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(manifest.riskItems.filter((item) => item.copyToRiskAcceptance).length > 0
      ? manifest.riskItems
          .filter((item) => item.copyToRiskAcceptance)
          .map(
            (item) =>
              `| TODO | ${markdownCell(item.area)} | ${markdownCell(item.risk)} | TODO: reviewer-approved compensating control. | ${item.evidenceReference ? `\`${markdownCell(item.evidenceReference)}\`` : "missing"} | TODO |`,
          )
      : ["| none | - | No risk acceptance rows are required by the latest evidence. | - | - | - |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-risk-register");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildManifest({
    baseUrl: argValue("base-url", undefined),
    siteName: argValue("site-name", undefined),
    generatedBy: argValue("generated-by", undefined),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field risk register written to ${path.relative(root, outputDir)}`);
  console.log(`field risk register status: ${manifest.status}`);
  if (manifest.openRiskCount > 0) {
    console.log(`open risk count: ${manifest.openRiskCount}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManifest,
  buildMarkdown,
  buildFieldValueRisks,
  buildSecurityRisks,
  buildFinalStatusRisks,
  groupRiskItems,
};
