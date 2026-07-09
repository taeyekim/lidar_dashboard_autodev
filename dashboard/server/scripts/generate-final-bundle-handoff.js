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

function metadataReviewItems(generatedBy, siteName) {
  return [
    isPlaceholderFieldText(generatedBy) ? "Generated-by reviewer metadata is missing or placeholder." : "",
    isPlaceholderFieldText(siteName) ? "Site name metadata is missing or placeholder." : "",
  ].filter(Boolean);
}

function buildBundleHandoff(input = {}) {
  const finalExecutionPlan = Object.prototype.hasOwnProperty.call(input, "finalExecutionPlan")
    ? input.finalExecutionPlan
    : readLatestJsonManifest("artifacts/final-execution-plan");
  const finalGateClassification = Object.prototype.hasOwnProperty.call(input, "finalGateClassification")
    ? input.finalGateClassification
    : readLatestJsonManifest("artifacts/final-gate-classification");
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = input.siteName || finalExecutionPlan?.data?.siteName || "unspecified";
  const metadataReview = metadataReviewItems(generatedBy, siteName);
  const bundles = (finalExecutionPlan?.data?.closureBundles || []).map((bundle) => ({
    ...bundle,
    fileName: `${String(bundle.order).padStart(2, "0")}-${slug(bundle.id || bundle.label)}.md`,
    reviewerChecklist: bundle.reviewerChecklist || [],
    commands: bundle.commands || [],
  }));

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: input.hostName || os.hostname(),
    git: buildGitState(input.git),
    status: !finalExecutionPlan ? "FINAL_EXECUTION_PLAN_MISSING" : metadataReview.length > 0 ? "REVIEW" : bundles.length > 0 ? "OPEN" : "READY_TO_CLOSE",
    sourceFinalExecutionPlan: finalExecutionPlan?.path || null,
    sourceFinalGateClassification: finalGateClassification?.path || null,
    remainingGateCount: finalExecutionPlan?.data?.remainingGateCount || 0,
    bundleCount: bundles.length,
    totalBundleGateCount: bundles.reduce((sum, bundle) => sum + (bundle.gateCount || 0), 0),
    metadataReview,
    bundles,
    ownerCloseoutFiles: (finalGateClassification?.data?.ownerCloseoutFileIndex || []).map((item) => ({
      order: item.order,
      bucketId: item.bucketId,
      bucketLabel: item.bucketLabel,
      owner: item.owner,
      gateCount: item.gateCount,
      fileName: item.fileName,
    })),
    guardrails: [
      "Final bundle handoff files are field execution aids, not completion evidence.",
      "Do not paste secrets into bundle notes, screenshots, or manual evidence.",
      "The final close decision still comes only from final:status READY_TO_CLOSE with canMarkGoalComplete=true.",
    ],
  };
}

function commandGuardrail(command) {
  const text = String(command?.command || "").toLowerCase();
  if (text.includes("ci:closeout") && text.includes("--dispatch")) {
    return "Requires an approved external CI closeout window; do not dispatch from local auto-mode.";
  }
  if (text.includes("-allowlivetcp")) {
    return "Requires hardware owner approval, field CONTROL_BOARD_HOST/PORT, CONTROL_BOARD_LIVE_APPROVED=true, ACK capture, and STAGE_2_RETURN rollback/return confirmation.";
  }
  if (text.includes("field:preflight") || text.includes("field:acceptance")) {
    return "Do not paste or publish secrets; attach only redacted manifests and signed field evidence.";
  }
  if (text.includes("security:evidence")) {
    return "Attach scanner reports or signed risk acceptance for unavailable scanners.";
  }
  if (text.includes("handover:package") && text.includes("--strict")) {
    return "Strict package must be run only after upstream field/security/manual evidence is refreshed.";
  }
  return "No special guardrail beyond the bundle checklist.";
}

function buildIndexMarkdown(manifest) {
  return [
    "# Final Bundle Handoff",
    "",
    `- Status: ${manifest.status}`,
    `- Bundle count: ${manifest.bundleCount}`,
    `- Bundle gate count: ${manifest.totalBundleGateCount}`,
    `- Remaining gate count: ${manifest.remainingGateCount}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Source final execution plan: ${manifest.sourceFinalExecutionPlan || "missing"}`,
    `- Source final gate classification: ${manifest.sourceFinalGateClassification || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Bundles",
    "",
    "| Order | Bundle | Gates | Source Gate IDs | Owners | File | Reviewer Checklist |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...(manifest.bundles.length > 0
      ? manifest.bundles.map(
          (bundle) =>
            `| ${bundle.order} | ${markdownCell(bundle.label)} | ${bundle.gateCount} | ${markdownCell((bundle.sourceGateIds || []).join(", ") || "none")} | ${markdownCell((bundle.owners || []).join(", ") || "none")} | \`${markdownCell(bundle.fileName)}\` | ${markdownCell((bundle.reviewerChecklist || []).join("; ") || "none")} |`,
        )
      : ["| none | none | 0 | none | none | none | none |"]),
    "",
    "## Owner Closeout Files",
    "",
    "| Order | Bucket | Owner | Gates | File |",
    "| ---: | --- | --- | ---: | --- |",
    ...(manifest.ownerCloseoutFiles.length > 0
      ? manifest.ownerCloseoutFiles.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.bucketLabel || item.bucketId)} | ${markdownCell(item.owner)} | ${item.gateCount} | \`${markdownCell(item.fileName)}\` |`,
        )
      : ["| - | none | none | 0 | none |"]),
    ...(manifest.metadataReview.length
      ? ["", "## Metadata Review", "", ...manifest.metadataReview.map((item) => `- ${item}`)]
      : []),
    "",
  ].join("\n");
}

function buildBundleMarkdown(bundle, manifest) {
  return [
    `# Bundle Handoff - ${bundle.label}`,
    "",
    `- Bundle ID: ${bundle.id}`,
    `- Order: ${bundle.order}`,
    `- Status: ${bundle.status}`,
    `- Gate count: ${bundle.gateCount}`,
    `- Source gate IDs: ${(bundle.sourceGateIds || []).join(", ") || "none"}`,
    `- Owners: ${(bundle.owners || []).join(", ") || "none"}`,
    `- Source final execution plan: ${manifest.sourceFinalExecutionPlan || "missing"}`,
    "",
    "## Outcome",
    "",
    bundle.outcome || "No outcome recorded.",
    "",
    "## Reviewer Checklist",
    "",
    ...(bundle.reviewerChecklist?.length ? bundle.reviewerChecklist.map((item) => `- [ ] ${item}`) : ["- [ ] No reviewer checklist recorded."]),
    "",
    "## Evidence Targets",
    "",
    ...(bundle.evidenceTargets?.length ? bundle.evidenceTargets.map((item) => `- \`${item}\``) : ["- none"]),
    "",
    "## Commands",
    "",
    "| Order | ID | Phase | Command | Guardrail | Done When |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(bundle.commands?.length
      ? bundle.commands.map(
          (command) =>
            `| ${command.order} | ${markdownCell(command.id)} | ${markdownCell(command.phase)} | \`${markdownCell(command.command)}\` | ${markdownCell(commandGuardrail(command))} | ${markdownCell(command.doneWhen)} |`,
        )
      : ["| none | none | none | No command recorded. | - | - |"]),
    "",
    "## Close When",
    "",
    bundle.closeWhen || "No close condition recorded.",
    "",
  ].join("\n");
}

function writeBundleFiles(outputDir, manifest) {
  return manifest.bundles.map((bundle) => {
    fs.writeFileSync(path.join(outputDir, bundle.fileName), buildBundleMarkdown(bundle, manifest));
    return bundle.fileName;
  });
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/final-bundle-handoff");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildBundleHandoff({
    generatedBy: argValue("generated-by", undefined),
    siteName: argValue("site-name", undefined),
  });

  ensureDir(outputDir);
  writeBundleFiles(outputDir, manifest);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildIndexMarkdown(manifest));
  console.log(`final bundle handoff written to ${path.relative(root, outputDir)}`);
  console.log(`final bundle handoff status: ${manifest.status}`);
  if (manifest.bundleCount > 0) console.log(`bundle count: ${manifest.bundleCount}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBundleHandoff,
  buildBundleMarkdown,
  buildIndexMarkdown,
  commandGuardrail,
  metadataReviewItems,
  slug,
  writeBundleFiles,
};
