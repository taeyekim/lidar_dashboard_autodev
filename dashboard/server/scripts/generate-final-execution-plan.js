const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { isPlaceholderFieldText } = require("./generate-final-status-report");
const { manualEvidenceRefs } = require("./manual-evidence");

const root = path.join(__dirname, "..", "..", "..");
const fieldReviewerArg = '"$env:FIELD_REVIEWER"';
const fieldSiteArg = '"$env:FIELD_SITE_NAME"';

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

function buildGitState(inputGit) {
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

function commandCatalog(baseUrl) {
  return [
    {
      id: "field-risk-register",
      phase: "Manual Evidence",
      actionTypes: ["FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED"],
      command: `npm.cmd run field:risk-register -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --generated-by=${fieldReviewerArg}`,
      purpose: "Collect open field/security/manual gates into reviewer-copyable risk acceptance rows.",
      doneWhen: "The register identifies every risk that must be resolved directly or copied into artifacts/manual/field-risk-acceptance.md.",
    },
    {
      id: "manual-evidence-drafts",
      phase: "Manual Evidence",
      actionTypes: ["MANUAL_EVIDENCE_REQUIRED"],
      command: `npm.cmd run manual:evidence-drafts -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --reviewer=${fieldReviewerArg}`,
      purpose: "Create missing reviewer-fillable manual evidence drafts after the latest risk register rows are available.",
      doneWhen: "Draft files exist under artifacts/manual/ and risk-acceptance drafts include the latest copyable register rows when applicable.",
    },
    {
      id: "manual-evidence-readiness",
      phase: "Manual Evidence",
      actionTypes: ["MANUAL_EVIDENCE_REQUIRED"],
      command: `npm.cmd run manual:evidence-readiness -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      purpose: "Validate reviewer-filled manual evidence targets before final close.",
      doneWhen: "Manual evidence readiness is READY and required manual evidence files are PRESENT.",
    },
    {
      id: "field-action-board",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED", "AUTOMATED_REFRESH_AVAILABLE"],
      command: `npm.cmd run field:action-board -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --generated-by=${fieldReviewerArg}`,
      purpose: "Group remaining final-status gates by owner, priority, execution phase, command, evidence, and close criteria.",
      doneWhen: "The board shows owner-ready commands for every remaining final-status gate.",
    },
    {
      id: "field-gate-closure-map",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED", "AUTOMATED_REFRESH_AVAILABLE"],
      command: `npm.cmd run field:gate-closure-map -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --generated-by=${fieldReviewerArg}`,
      purpose: "Map field commands back to the gates, owners, phases, evidence paths, and close criteria they are expected to resolve.",
      doneWhen: "The closure map shows command-centered coverage for every remaining final-status gate.",
    },
    {
      id: "field-owner-briefs",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED", "AUTOMATED_REFRESH_AVAILABLE"],
      command: `npm.cmd run field:owner-briefs -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --generated-by=${fieldReviewerArg}`,
      purpose: "Split the latest action board into per-owner field execution briefs.",
      doneWhen: "Each owner has a brief file with commands, evidence paths, and close criteria for their gates.",
    },
    {
      id: "field-preflight",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED"],
      command: `npm.cmd run field:preflight -- -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`,
      purpose: "Capture .env, cookie, Swagger, device-key, and control-board TCP preflight evidence.",
      doneWhen: "Field preflight status is PASS with no unaccepted REVIEW/SKIPPED checks.",
    },
    {
      id: "runtime-evidence",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED", "AUTOMATED_REFRESH_AVAILABLE"],
      command: `npm.cmd run runtime:evidence -- --run-smoke --use-existing-stack --base-url=${baseUrl}`,
      purpose: "Record Docker, Nginx/API, health, security header, statistics, and control-board status evidence.",
      doneWhen: "Runtime evidence has no failed required delivery checks.",
    },
    {
      id: "runtime-smoke",
      phase: "Field Runtime",
      actionTypes: ["FIELD_ACTION_REQUIRED"],
      command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/runtime-smoke.ps1 -BaseUrl ${baseUrl}`,
      purpose: "Smoke test the already-running delivery Nginx entrypoint.",
      doneWhen: "Runtime smoke completes against the delivery URL.",
    },
    {
      id: "db-field-rehearsal",
      phase: "Field Rehearsal",
      actionTypes: ["FIELD_ACTION_REQUIRED"],
      command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`,
      purpose: "Prove Prisma/DB health, seed posture, and authenticated database/status APIs in the delivery runtime.",
      doneWhen: "DB field rehearsal manifest is PASS.",
    },
    {
      id: "lidar-field-rehearsal",
      phase: "Field Rehearsal",
      actionTypes: ["FIELD_ACTION_REQUIRED"],
      command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`,
      purpose: "Prove normal-driving track de-duplication and wrong-way ingest/command creation with representative payloads.",
      doneWhen: "LiDAR field rehearsal manifest is PASS.",
    },
    {
      id: "control-board-field-rehearsal",
      phase: "Field Rehearsal",
      actionTypes: ["FIELD_ACTION_REQUIRED"],
      command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`,
      purpose: "Prove control-board command lifecycle in DRY_RUN or approved LIVE_TCP mode.",
      doneWhen: "Control-board field rehearsal manifest is PASS and LIVE_TCP evidence is attached when required.",
    },
    {
      id: "security-evidence",
      phase: "Security",
      actionTypes: ["SECURITY_REVIEW_REQUIRED"],
      command: `npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=${baseUrl}`,
      purpose: "Capture audit, container image, and ZAP/scanner evidence for strict acceptance.",
      doneWhen: "Security evidence is not strictAcceptanceBlocked, or risk acceptance evidence is attached.",
    },
    {
      id: "field-readiness",
      phase: "Readiness",
      actionTypes: ["FIELD_ACTION_REQUIRED", "SECURITY_REVIEW_REQUIRED", "AUTOMATED_REFRESH_AVAILABLE"],
      command: `npm.cmd run field:readiness -- --base-url=${baseUrl} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      purpose: "Summarize delivery runtime, required env values, scanner availability, and control-board safety status.",
      doneWhen: "Field readiness is PASS and control-board safety is LIVE_TCP_READY for final close.",
    },
    {
      id: "field-acceptance",
      phase: "Acceptance",
      actionTypes: ["FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED"],
      command: `npm.cmd run field:acceptance -- -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners`,
      purpose: "Run strict acceptance after preflight, runtime, rehearsals, security, and manual walkthrough evidence are ready.",
      doneWhen: "Field acceptance status is PASS and readyForHandover=true.",
    },
    {
      id: "delivery-evidence",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "SECURITY_REVIEW_REQUIRED"],
      command: "npm.cmd run delivery:evidence",
      purpose: "Refresh delivery evidence and companion manifests before final audit.",
      doneWhen: "Delivery evidence has failedCommandCount=0 and current companion evidence.",
    },
    {
      id: "source-revision-closeout",
      phase: "Source Revision",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE"],
      command: "git status --short --branch; git push origin dev",
      purpose: "Confirm the final source is on dev, clean, and pushed before regenerating Git-bearing delivery evidence.",
      doneWhen: "Working tree is clean, current branch is dev, and HEAD matches origin/dev before final evidence refresh.",
    },
    {
      id: "docs-text-quality",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "REVIEW_REQUIRED"],
      command: "npm.cmd run verify:docs-text-quality",
      purpose: "Confirm delivery Markdown and acceptance labels do not contain mojibake before packaging handover evidence.",
      doneWhen: "Docs text quality contracts pass.",
    },
    {
      id: "ci-closeout",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "REVIEW_REQUIRED"],
      command: `npm.cmd run ci:closeout -- --dispatch --generated-by=${fieldReviewerArg}`,
      purpose: "During the approved external CI closeout window, intentionally dispatch GitHub Actions if needed, wait for the final dev commit run, and regenerate CI status evidence.",
      doneWhen: "CI closeout completes and CI status evidence is PASS for the final pushed dev commit.",
    },
    {
      id: "ci-status",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "REVIEW_REQUIRED"],
      command: `npm.cmd run ci:status -- --generated-by=${fieldReviewerArg}`,
      purpose: "Record or refresh the latest GitHub Actions CI result for the final dev commit.",
      doneWhen: "CI status evidence is PASS and matches the final pushed dev commit.",
    },
    {
      id: "completion-audit",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
      command: "npm.cmd run completion:audit",
      purpose: "Recompute completion blockers after the latest field, manual, runtime, and security evidence.",
      doneWhen: "Completion audit is COMPLETE with canMarkGoalComplete=true.",
    },
    {
      id: "handover-index",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
      command: `npm.cmd run handover:index -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      purpose: "Index latest evidence, field action artifacts, manual evidence, and closure links before package assembly.",
      doneWhen: "Handover index is READY or explicitly lists missing, stale, review, and open field action artifact areas.",
    },
    {
      id: "field-closure-plan",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
      command: `npm.cmd run field:closure-plan -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      purpose: "Generate the ordered field closure plan, including Field Action Artifact Actions from completion audit.",
      doneWhen: "Field closure plan is READY or lists the remaining closure actions and done-when criteria.",
    },
    {
      id: "handover-package",
      phase: "Package Refresh",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
      command: `npm.cmd run handover:package -- --base-url=${baseUrl} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg} --strict`,
      purpose: "Regenerate the strict handover package with fresh references.",
      doneWhen: "Handover package status is READY with no residual field gates.",
    },
    {
      id: "final-status",
      phase: "Final Decision",
      actionTypes: ["AUTOMATED_REFRESH_AVAILABLE", "FIELD_ACTION_REQUIRED", "MANUAL_EVIDENCE_REQUIRED", "SECURITY_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
      command: `npm.cmd run final:status -- --base-url=${baseUrl} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`,
      purpose: "Write the final close/no-close decision after all evidence is refreshed.",
      doneWhen: "Final status is READY_TO_CLOSE and canMarkGoalComplete=true.",
    },
  ];
}

function actionTypesFromGates(gates) {
  const actionTypes = new Set(gates.map((gate) => gate.actionType).filter(Boolean));
  if (actionTypes.size === 0) actionTypes.add("REVIEW_REQUIRED");
  return actionTypes;
}

function buildOrderedCommands(gates, baseUrl) {
  const actionTypes = actionTypesFromGates(gates);
  return commandCatalog(baseUrl)
    .filter((item) => item.actionTypes.some((type) => actionTypes.has(type)))
    .map((item, index) => ({ order: index + 1, ...item }));
}

function buildCommandGateCoverage(orderedCommands, gates) {
  return orderedCommands.map((command) => {
    const matchedGates = gates.filter((gate) => command.actionTypes.includes(gate.actionType || "REVIEW_REQUIRED"));
    const categories = [...new Set(matchedGates.map((gate) => gate.category).filter(Boolean))];
    const statuses = [...new Set(matchedGates.map((gate) => gate.status).filter(Boolean))];
    const evidence = [...new Set(matchedGates.map((gate) => gate.evidence).filter(Boolean))];
    return {
      order: command.order,
      id: command.id,
      phase: command.phase,
      command: command.command,
      actionTypes: command.actionTypes,
      gateCount: matchedGates.length,
      categories,
      statuses,
      evidence,
      doneWhen: command.doneWhen,
    };
  });
}

function groupGatesByActionType(gates) {
  return gates.reduce((groups, gate) => {
    const type = gate.actionType || "REVIEW_REQUIRED";
    groups[type] = groups[type] || [];
    groups[type].push(gate);
    return groups;
  }, {});
}

function buildManualEvidenceTargets(manualEvidence = manualEvidenceRefs()) {
  return manualEvidence.map((item) => ({
    type: item.type,
    targetPath: item.path,
    template: item.template,
    status: item.status,
    validationReason: item.validationReason || "",
    nextAction: item.nextAction,
    doneWhen: item.doneWhen,
  }));
}

function buildFinalExecutionPlan(input = {}) {
  const hasInput = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const finalStatus = hasInput("finalStatus") ? input.finalStatus : readLatestJsonManifest("artifacts/final-status");
  const closurePlan = hasInput("closurePlan") ? input.closurePlan : readLatestJsonManifest("artifacts/field-closure-plan");
  const gateClosureMap = hasInput("gateClosureMap") ? input.gateClosureMap : readLatestJsonManifest("artifacts/field-gate-closure-map");
  const handoverPackage = hasInput("handoverPackage") ? input.handoverPackage : readLatestJsonManifest("artifacts/handover-package");
  const baseUrl = input.baseUrl || finalStatus?.data?.baseUrl || "http://localhost:8080";
  const remainingGates = finalStatus?.data?.remainingGates || [];
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = input.siteName || finalStatus?.data?.siteName || "unspecified";
  const metadataReview = [
    isPlaceholderFieldText(generatedBy) ? "Generated-by reviewer metadata is missing or placeholder." : "",
    isPlaceholderFieldText(siteName) ? "Site name metadata is missing or placeholder." : "",
  ].filter(Boolean);
  const planningGates = finalStatus
    ? [
        ...metadataReview.map((message) => ({
          actionType: "FIELD_ACTION_REQUIRED",
          category: "Final Execution Plan Metadata",
          status: "PLACEHOLDER_METADATA",
          message,
          closeWhen: "Rerun npm.cmd run final:execution-plan with concrete --generated-by=<field-reviewer> and --site-name=<delivery-site> values.",
          evidence: finalStatus?.path || null,
        })),
        ...remainingGates,
      ]
    : [
        {
          actionType: "AUTOMATED_REFRESH_AVAILABLE",
          category: "Final Status",
          status: "MISSING",
          message: "Latest final status manifest is missing.",
          closeWhen: "Run npm.cmd run final:status before building the final execution plan.",
          evidence: null,
        },
  ];
  const orderedCommands = planningGates.length > 0 ? buildOrderedCommands(planningGates, baseUrl) : [];
  const commandGateCoverage = buildCommandGateCoverage(orderedCommands, planningGates);
  const gatesByActionType = groupGatesByActionType(planningGates);
  const status = !finalStatus
    ? "FINAL_STATUS_MISSING"
    : finalStatus.data?.status === "READY_TO_CLOSE" && remainingGates.length === 0 && metadataReview.length === 0
      ? "READY_TO_CLOSE"
      : "OPEN";

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: input.hostName || os.hostname(),
    baseUrl,
    git: buildGitState(input.git),
    status,
    canMarkGoalComplete: status === "READY_TO_CLOSE",
    sourceFinalStatus: finalStatus?.path || null,
    sourceFieldClosurePlan: closurePlan?.path || null,
    sourceFieldGateClosureMap: gateClosureMap?.path || null,
    sourceHandoverPackage: handoverPackage?.path || null,
    remainingGateCount: planningGates.length,
    metadataReview,
    gatesByActionType,
    manualEvidenceTargets: buildManualEvidenceTargets(input.manualEvidence),
    orderedCommands,
    commandGateCoverage,
    guardrails: [
      "This execution plan does not prove field completion.",
      "Run the commands against the delivery Nginx entrypoint and approved field network/hardware.",
      "Do not mark the Codex goal complete until final:status reports READY_TO_CLOSE and canMarkGoalComplete=true.",
    ],
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  const actionTypeRows = Object.entries(manifest.gatesByActionType);
  return [
    "# Final Execution Plan",
    "",
    `- Status: ${manifest.status}`,
    `- Can mark goal complete: ${manifest.canMarkGoalComplete}`,
    `- Remaining gate count: ${manifest.remainingGateCount}`,
    `- Metadata review items: ${manifest.metadataReview?.length || 0}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Source final status: ${manifest.sourceFinalStatus || "missing"}`,
    `- Source closure plan: ${manifest.sourceFieldClosurePlan || "missing"}`,
    `- Source gate closure map: ${manifest.sourceFieldGateClosureMap || "missing"}`,
    `- Source handover package: ${manifest.sourceHandoverPackage || "missing"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Gate Groups",
    "",
    "| Action Type | Count |",
    "| --- | --- |",
    ...(actionTypeRows.length > 0
      ? actionTypeRows.map(([type, gates]) => `| ${markdownCell(type)} | ${gates.length} |`)
      : ["| none | 0 |"]),
    "",
    "## Ordered Commands",
    "",
    "| Order | Phase | Command | Purpose | Done When |",
    "| --- | --- | --- | --- | --- |",
    ...(manifest.orderedCommands.length > 0
      ? manifest.orderedCommands.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.phase)} | \`${markdownCell(item.command)}\` | ${markdownCell(item.purpose)} | ${markdownCell(item.doneWhen)} |`,
        )
      : ["| none | Final Decision | No commands required by the latest final status. | Final status is already READY_TO_CLOSE. | READY_TO_CLOSE remains current. |"]),
    "",
    "## Command Gate Coverage",
    "",
    "| Order | Command ID | Gate Count | Action Types | Categories | Statuses | Evidence | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.commandGateCoverage.length > 0
      ? manifest.commandGateCoverage.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.id)} | ${item.gateCount} | ${markdownCell(item.actionTypes.join(", "))} | ${markdownCell(item.categories.join(", ") || "none")} | ${markdownCell(item.statuses.join(", ") || "none")} | ${markdownCell(item.evidence.join(", ") || "missing")} | ${markdownCell(item.doneWhen)} |`,
        )
      : ["| none | none | 0 | none | none | none | missing | No commands are required by the latest final status. |"]),
    "",
    "## Manual Evidence Targets",
    "",
    "| Type | Status | Target | Template | Validation | Done When |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.manualEvidenceTargets.map(
      (item) =>
        `| ${markdownCell(item.type)} | ${markdownCell(item.status)} | \`${markdownCell(item.targetPath)}\` | \`${markdownCell(item.template)}\` | ${markdownCell(item.validationReason || "ok")} | ${markdownCell(item.doneWhen)} |`,
    ),
    "",
    "## Remaining Gates",
    "",
    "| Action Type | Category | Status | Message | Close When | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(Object.values(manifest.gatesByActionType).flat().length > 0
      ? Object.values(manifest.gatesByActionType).flat().map(
          (gate) =>
            `| ${markdownCell(gate.actionType)} | ${markdownCell(gate.category)} | ${markdownCell(gate.status)} | ${markdownCell(gate.message)} | ${markdownCell(gate.closeWhen)} | ${gate.evidence ? `\`${markdownCell(gate.evidence)}\`` : "missing"} |`,
        )
      : ["| none | none | PASS | No remaining final gates. | - | - |"]),
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/final-execution-plan");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  const manifest = buildFinalExecutionPlan({
    baseUrl: argValue("base-url", undefined),
    siteName: argValue("site-name", undefined),
    generatedBy: argValue("generated-by", undefined),
  });

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`final execution plan written to ${path.relative(root, outputDir)}`);
  console.log(`final execution plan status: ${manifest.status}`);
  if (manifest.remainingGateCount > 0) {
    console.log(`remaining gate count: ${manifest.remainingGateCount}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFinalExecutionPlan,
  buildMarkdown,
  buildOrderedCommands,
  buildCommandGateCoverage,
  commandCatalog,
};
