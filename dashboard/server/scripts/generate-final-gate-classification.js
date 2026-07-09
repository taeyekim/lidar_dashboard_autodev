const fs = require("fs");
const os = require("os");
const path = require("path");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { buildGitState } = require("./generate-final-status-report");
const { resolveFieldBaseUrl } = require("./field-env");

const root = path.join(__dirname, "..", "..", "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function bucketForGate(gate) {
  const category = String(gate.category || "").toLowerCase();
  const text = `${gate.category || ""} ${gate.status || ""} ${gate.actionType || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (
    category === "completion audit" ||
    category === "handover package" ||
    text.includes("handover package status") ||
    text.includes("canmarkgoalcomplete")
  ) {
    return "field_acceptance";
  }
  if (text.includes("control-board") || text.includes("control board") || text.includes("live_tcp") || text.includes("hardware")) {
    return "hardware_runtime";
  }
  if (text.includes("lidar") || text.includes("db and prisma") || text.includes("runtime smoke") || text.includes("field rehearsal")) {
    return "field_runtime";
  }
  if (text.includes("scanner") || text.includes("trivy") || text.includes("gitleaks") || text.includes("zap") || text.includes("security evidence")) {
    return "security_tooling";
  }
  if (text.includes("manual evidence") || text.includes("operator ui") || text.includes("risk acceptance") || text.includes("reviewer signature")) {
    return "manual_reviewer";
  }
  if (text.includes("ci status") || text.includes("github actions") || text.includes("ci workflow")) {
    return "external_ci";
  }
  if (
    text.includes(".env") ||
    text.includes("jwt secret") ||
    text.includes("seed admin") ||
    text.includes("cors") ||
    text.includes("swagger allowlist") ||
    text.includes("device ingest key") ||
    text.includes("cookie") ||
    text.includes("rate limit") ||
    text.includes("content security policy") ||
    text.includes(" csp")
  ) {
    return "field_configuration";
  }
  if (
    text.includes("field readiness") ||
    text.includes("field acceptance") ||
    text.includes("field preflight") ||
    text.includes("handover package status") ||
    text.includes("canmarkgoalcomplete") ||
    text.includes("level-2 escalation") ||
    text.includes("escalation threshold") ||
    text.includes("field risk register") ||
    text.includes("field action board") ||
    text.includes("field gate closure map") ||
    text.includes("field owner briefs")
  ) {
    return "field_acceptance";
  }
  return "package_refresh";
}

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

const bucketDefinitions = {
  field_configuration: {
    label: "Field Configuration",
    owner: "Auth/Security + Field Operations",
    localAutomationAllowed: false,
    reason: "Requires real delivery .env values, network posture, and operator-approved exposure settings.",
  },
  manual_reviewer: {
    label: "Manual Reviewer Evidence",
    owner: "PM + Field Reviewer",
    localAutomationAllowed: false,
    reason: "Requires reviewer-filled evidence and signatures; Codex must not fabricate acceptance.",
  },
  field_runtime: {
    label: "Field Runtime Rehearsal",
    owner: "Backend + Field Operations",
    localAutomationAllowed: false,
    reason: "Requires the delivery runtime, DB, representative LiDAR payloads, and accepted rehearsal evidence.",
  },
  hardware_runtime: {
    label: "Hardware Runtime",
    owner: "Hardware + Backend + Field Operations",
    localAutomationAllowed: false,
    reason: "Requires approved integrated control-board host/port, LIVE_TCP approval, and command ACK evidence.",
  },
  security_tooling: {
    label: "Security Tooling",
    owner: "Auth/Security",
    localAutomationAllowed: "conditional",
    reason: "Can be closed locally only when native scanners or Docker scanner runtime are available and approved.",
  },
  external_ci: {
    label: "External CI",
    owner: "Release/PM",
    localAutomationAllowed: "read_only",
    reason: "Read-only CI status is safe; dispatching GitHub Actions requires an approved closeout window.",
  },
  field_acceptance: {
    label: "Field Acceptance",
    owner: "Field Operations + PM",
    localAutomationAllowed: false,
    reason: "Depends on field configuration, runtime, security, and manual evidence being complete.",
  },
  package_refresh: {
    label: "Package Refresh",
    owner: "Codex",
    localAutomationAllowed: "refresh_only",
    reason: "Can be regenerated after upstream evidence changes, but cannot close upstream field/security gates by itself.",
  },
};

function summarizeBuckets(gates) {
  const buckets = Object.fromEntries(
    Object.entries(bucketDefinitions).map(([id, definition]) => [
      id,
      {
        id,
        ...definition,
        gateCount: 0,
        actionTypes: {},
        categories: {},
        examples: [],
        gates: [],
      },
    ]),
  );

  gates.forEach((gate) => {
    const bucketId = bucketForGate(gate);
    const bucket = buckets[bucketId] || buckets.package_refresh;
    bucket.gateCount += 1;
    const actionType = gate.actionType || "UNKNOWN";
    const category = gate.category || "Unknown";
    bucket.actionTypes[actionType] = (bucket.actionTypes[actionType] || 0) + 1;
    bucket.categories[category] = (bucket.categories[category] || 0) + 1;
    const gateRow = {
      id: gate.id || null,
      area: gate.area || gate.category || "Unknown",
      gate: gate.gate || `${gate.category || "Unknown"}: ${gate.status || "UNKNOWN"}`,
      category: gate.category || "Unknown",
      status: gate.status || "UNKNOWN",
      actionType,
      message: gate.message || "",
      evidence: gate.evidence || null,
      closeWhen: gate.closeWhen || "",
    };
    bucket.gates.push(gateRow);
    if (bucket.examples.length < 5) {
      bucket.examples.push(gateRow);
    }
  });

  return Object.values(buckets).filter((bucket) => bucket.gateCount > 0);
}

function buildNextActions(buckets, baseUrl) {
  const actions = [];
  if (buckets.some((bucket) => bucket.id === "security_tooling")) {
    actions.push({
      id: "security-tooling-closeout",
      mode: "conditional-local",
      command: `npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=${baseUrl}`,
      guardrail: "Run only when gitleaks/Trivy/ZAP are installed or Docker scanner runtime is approved and reachable.",
    });
  }
  if (buckets.some((bucket) => bucket.id === "external_ci")) {
    actions.push({
      id: "ci-status-readonly",
      mode: "local-readonly",
      command: "npm.cmd run ci:status -- --generated-by=Codex",
      guardrail: "Do not dispatch GitHub Actions unless the approved external CI closeout window is active.",
    });
  }
  if (buckets.some((bucket) => bucket.id === "package_refresh")) {
    actions.push({
      id: "package-refresh-after-evidence",
      mode: "local",
      command: `npm.cmd run final:refresh -- --base-url=${baseUrl} --generated-by=Codex --site-name=local-dev-review`,
      guardrail: "Refresh after upstream field/security/manual evidence changes; this does not replace field evidence.",
    });
  }
  actions.push({
    id: "field-owner-bundle",
    mode: "field-required",
    command: "Open artifacts/final-bundle-handoff/<timestamp>/manifest.md and distribute bundle files by owner.",
    guardrail: "Field reviewer must provide real .env, runtime, scanner, CI, hardware, and signed acceptance evidence.",
  });
  return actions;
}

function buildBucketGateCounts(buckets) {
  return Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket.gateCount]));
}

function buildOwnerCloseoutQueue(buckets) {
  return buckets
    .map((bucket, index) => ({
      order: index + 1,
      bucketId: bucket.id,
      bucketLabel: bucket.label,
      owner: bucket.owner,
      gateCount: bucket.gateCount,
      localAutomationAllowed: bucket.localAutomationAllowed,
      topCategories: Object.entries(bucket.categories)
        .sort((left, right) => right[1] - left[1])
        .map(([category, count]) => `${category}:${count}`),
      nextAction:
        bucket.localAutomationAllowed === "refresh_only"
          ? "Regenerate package/status artifacts after upstream field, security, CI, or reviewer evidence changes."
          : bucket.localAutomationAllowed === "read_only"
            ? "Record read-only status and obtain release/PM approval before any external dispatch."
            : bucket.localAutomationAllowed === "conditional"
              ? "Run approved local tooling only when scanner/runtime prerequisites are available; otherwise record reviewer evidence."
              : "Collect real field evidence from the listed owner and rerun the mapped closeout commands.",
      doneWhen:
        bucket.localAutomationAllowed === "refresh_only"
          ? "The package refresh bucket disappears after upstream evidence closes."
          : `${bucket.label} gate count is 0 in final:gate-classification and final:status no longer lists this bucket's gates.`,
    }))
    .sort((left, right) => {
      const priority = {
        false: 0,
        conditional: 1,
        read_only: 2,
        refresh_only: 3,
        true: 4,
      };
      return (priority[String(left.localAutomationAllowed)] ?? 5) - (priority[String(right.localAutomationAllowed)] ?? 5) || right.gateCount - left.gateCount;
    })
    .map((item, index) => ({
      ...item,
      order: index + 1,
      fileName: `${String(index + 1).padStart(2, "0")}-${slug(item.bucketId)}.md`,
    }));
}

function buildManifest(options) {
  const latestFinalStatus = readLatestJsonManifest("artifacts/final-status");
  const finalStatusData = latestFinalStatus?.data || {};
  const remainingGates = Array.isArray(finalStatusData.remainingGates) ? finalStatusData.remainingGates : [];
  const buckets = summarizeBuckets(remainingGates);
  const bucketGateCounts = buildBucketGateCounts(buckets);
  const ownerCloseoutQueue = buildOwnerCloseoutQueue(buckets);
  const localOnlyClosableCount = buckets
    .filter((bucket) => bucket.localAutomationAllowed === true)
    .reduce((sum, bucket) => sum + bucket.gateCount, 0);
  const conditionalLocalCount = buckets
    .filter((bucket) => bucket.localAutomationAllowed === "conditional" || bucket.localAutomationAllowed === "read_only")
    .reduce((sum, bucket) => sum + bucket.gateCount, 0);
  const refreshOnlyCount = buckets
    .filter((bucket) => bucket.localAutomationAllowed === "refresh_only")
    .reduce((sum, bucket) => sum + bucket.gateCount, 0);
  const fieldRequiredCount = remainingGates.length - localOnlyClosableCount - conditionalLocalCount - refreshOnlyCount;

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy,
    siteName: options.siteName,
    hostName: os.hostname(),
    baseUrl: options.baseUrl,
    git: buildGitState(),
    status: remainingGates.length === 0 ? "NO_OPEN_GATES" : "OPEN_GATES_CLASSIFIED",
    sourceFinalStatus: {
      path: latestFinalStatus?.path || null,
      status: finalStatusData.status || "MISSING",
      canMarkGoalComplete: finalStatusData.canMarkGoalComplete === true,
      remainingGateCount: remainingGates.length,
    },
    summary: {
      remainingGateCount: remainingGates.length,
      localOnlyClosableCount,
      conditionalLocalCount,
      refreshOnlyCount,
      fieldRequiredCount,
      bucketGateCounts,
      bucketCount: buckets.length,
    },
    buckets,
    ownerCloseoutQueue,
    ownerCloseoutFileIndex: ownerCloseoutQueue.map((item) => ({
      order: item.order,
      bucketId: item.bucketId,
      bucketLabel: item.bucketLabel,
      owner: item.owner,
      gateCount: item.gateCount,
      fileName: item.fileName,
    })),
    nextCodexActions: buildNextActions(buckets, options.baseUrl),
    guardrails: [
      "This classification is routing evidence, not completion evidence.",
      "Codex may regenerate package/status artifacts and run read-only checks without field approval.",
      "Codex must not fabricate reviewer signatures, field risk acceptance, real .env values, hardware ACKs, or external CI dispatch approval.",
      "Goal completion still requires final:status READY_TO_CLOSE and canMarkGoalComplete=true.",
    ],
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(manifest) {
  return [
    "# Final Gate Classification",
    "",
    `- Status: ${manifest.status}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Source final status: ${manifest.sourceFinalStatus.status} (${manifest.sourceFinalStatus.path || "missing"})`,
    `- Remaining gates: ${manifest.summary.remainingGateCount}`,
    `- Local-only closable gates: ${manifest.summary.localOnlyClosableCount}`,
    `- Conditional/read-only local gates: ${manifest.summary.conditionalLocalCount}`,
    `- Refresh-only gates: ${manifest.summary.refreshOnlyCount}`,
    `- Field-required gates: ${manifest.summary.fieldRequiredCount}`,
    `- Bucket gate counts: ${Object.entries(manifest.summary.bucketGateCounts || {}).map(([key, count]) => `${key}:${count}`).join(", ") || "none"}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Guardrails",
    "",
    ...manifest.guardrails.map((item) => `- ${item}`),
    "",
    "## Buckets",
    "",
    "| Bucket | Gates | Owner | Local Automation | Reason | Top Categories |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...manifest.buckets.map(
      (bucket) =>
        `| ${markdownCell(bucket.label)} | ${bucket.gateCount} | ${markdownCell(bucket.owner)} | ${markdownCell(bucket.localAutomationAllowed)} | ${markdownCell(bucket.reason)} | ${markdownCell(Object.entries(bucket.categories).map(([key, count]) => `${key}:${count}`).join(", "))} |`,
    ),
    "",
    "## Owner Closeout Queue",
    "",
    "| Order | Bucket | Owner | Gates | Local Automation | Top Categories | Next Action | Done When |",
    "| ---: | --- | --- | ---: | --- | --- | --- | --- |",
    ...manifest.ownerCloseoutQueue.map(
      (item) =>
        `| ${item.order} | ${markdownCell(item.bucketLabel)} | ${markdownCell(item.owner)} | ${item.gateCount} | ${markdownCell(item.localAutomationAllowed)} | ${markdownCell(item.topCategories.join(", "))} | ${markdownCell(item.nextAction)} | ${markdownCell(item.doneWhen)} |`,
    ),
    "",
    "## Owner Closeout Files",
    "",
    "| Order | Bucket | Owner | Gates | File |",
    "| ---: | --- | --- | ---: | --- |",
    ...(manifest.ownerCloseoutFileIndex.length > 0
      ? manifest.ownerCloseoutFileIndex.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.bucketLabel)} | ${markdownCell(item.owner)} | ${item.gateCount} | \`${markdownCell(item.fileName)}\` |`,
        )
      : ["| - | none | none | 0 | none |"]),
    "",
    "## Next Codex Actions",
    "",
    "| ID | Mode | Command | Guardrail |",
    "| --- | --- | --- | --- |",
    ...manifest.nextCodexActions.map(
      (action) =>
        `| ${markdownCell(action.id)} | ${markdownCell(action.mode)} | \`${markdownCell(action.command)}\` | ${markdownCell(action.guardrail)} |`,
    ),
    "",
    "## Examples",
    "",
    ...manifest.buckets.flatMap((bucket) => [
      `### ${bucket.label}`,
      "",
      "| Gate ID | Area | Category | Status | Action Type | Message | Evidence | Close When |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...bucket.examples.map(
        (gate) =>
          `| ${markdownCell(gate.id || "missing")} | ${markdownCell(gate.area || gate.category)} | ${markdownCell(gate.category)} | ${markdownCell(gate.status)} | ${markdownCell(gate.actionType)} | ${markdownCell(gate.message)} | ${markdownCell(gate.evidence || "missing")} | ${markdownCell(gate.closeWhen)} |`,
      ),
      "",
    ]),
    "## All Gates By Bucket",
    "",
    ...manifest.buckets.flatMap((bucket) => [
      `### ${bucket.label}`,
      "",
      "| # | Gate ID | Area | Gate | Category | Status | Action Type | Message | Evidence | Close When |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...(bucket.gates || []).map(
        (gate, index) =>
          `| ${index + 1} | ${markdownCell(gate.id || "missing")} | ${markdownCell(gate.area || gate.category)} | ${markdownCell(gate.gate || `${gate.category}: ${gate.status}`)} | ${markdownCell(gate.category)} | ${markdownCell(gate.status)} | ${markdownCell(gate.actionType)} | ${markdownCell(gate.message)} | ${markdownCell(gate.evidence || "missing")} | ${markdownCell(gate.closeWhen)} |`,
      ),
      "",
    ]),
  ].join("\n");
}

function buildOwnerCloseoutMarkdown(queueItem, bucket, manifest) {
  return [
    `# Owner Closeout - ${queueItem.bucketLabel}`,
    "",
    `- Bucket ID: ${queueItem.bucketId}`,
    `- Owner: ${queueItem.owner}`,
    `- Gate count: ${queueItem.gateCount}`,
    `- Local automation: ${queueItem.localAutomationAllowed}`,
    `- Source final status: ${manifest.sourceFinalStatus.path || "missing"}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Site name: ${manifest.siteName}`,
    "",
    "## Guardrails",
    "",
    "- This file is an execution aid, not completion evidence.",
    "- Do not write secrets, private IP details, or unsigned approvals into this file.",
    "- Final completion still requires final:status READY_TO_CLOSE and canMarkGoalComplete=true.",
    "",
    "## Owner Action",
    "",
    `- Next action: ${queueItem.nextAction}`,
    `- Done when: ${queueItem.doneWhen}`,
    "",
    "## Top Categories",
    "",
    ...(queueItem.topCategories.length > 0 ? queueItem.topCategories.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Gates",
    "",
    "| # | Gate ID | Area | Gate | Category | Status | Action Type | Message | Evidence | Close When |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...((bucket?.gates || []).length > 0
      ? bucket.gates.map(
          (gate, index) =>
            `| ${index + 1} | ${markdownCell(gate.id || "missing")} | ${markdownCell(gate.area || gate.category)} | ${markdownCell(gate.gate || `${gate.category}: ${gate.status}`)} | ${markdownCell(gate.category)} | ${markdownCell(gate.status)} | ${markdownCell(gate.actionType)} | ${markdownCell(gate.message)} | ${markdownCell(gate.evidence || "missing")} | ${markdownCell(gate.closeWhen)} |`,
        )
      : ["| - | none | none | none | none | PASS | - | No open gates. | - | - |"]),
    "",
  ].join("\n");
}

function writeOwnerCloseoutFiles(outputDir, manifest) {
  return manifest.ownerCloseoutQueue.map((queueItem) => {
    const bucket = manifest.buckets.find((item) => item.id === queueItem.bucketId);
    fs.writeFileSync(path.join(outputDir, queueItem.fileName), buildOwnerCloseoutMarkdown(queueItem, bucket, manifest));
    return queueItem.fileName;
  });
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/final-gate-classification");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildManifest({
    baseUrl: argValue("base-url", resolveFieldBaseUrl()),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeOwnerCloseoutFiles(outputDir, manifest);
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`final gate classification written to ${path.relative(root, outputDir)}`);
  console.log(`final gate classification status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBucketGateCounts,
  bucketForGate,
  buildManifest,
  buildMarkdown,
  buildOwnerCloseoutMarkdown,
  buildOwnerCloseoutQueue,
  summarizeBuckets,
  slug,
  writeOwnerCloseoutFiles,
};
