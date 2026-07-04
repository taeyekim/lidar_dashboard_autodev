const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { isPlaceholderFieldText } = require("./generate-final-status-report");

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

function ownerForGate(gate) {
  const text = `${gate.category || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("security") || text.includes("scanner") || text.includes("cookie") || text.includes("jwt") || text.includes("password") || text.includes("cors")) return "Auth/Security";
  if (text.includes("lidar") || text.includes("ingest") || text.includes("device")) return "LiDAR Ingest";
  if (text.includes("control-board") || text.includes("live_tcp") || text.includes("tcp") || text.includes("hardware")) return "Control-board TCP";
  if (text.includes("swagger") || text.includes("nginx") || text.includes("rate limit") || text.includes("burst") || text.includes("content security") || text.includes("csp")) return "Nginx Delivery";
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
  if (text.includes("preflight") || text.includes("jwt") || text.includes("cookie") || text.includes("cors") || text.includes("swagger") || text.includes("rate limit") || text.includes("burst") || text.includes("content security") || text.includes("csp") || text.includes("device ingest key")) return "Field Preflight";
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) return "Security Evidence";
  if (text.includes("db") || text.includes("prisma") || text.includes("lidar") || text.includes("control-board") || text.includes("tcp") || text.includes("hardware")) return "Field Rehearsal";
  if (text.includes("field acceptance") || text.includes("readiness") || text.includes("runtime smoke")) return "Field Acceptance";
  if (text.includes("handover")) return "Handover Package";
  if (text.includes("completion") || text.includes("final")) return "Final Status";
  return "Field Review";
}

function commandForGate(gate, baseUrl) {
  if (gate.closeoutCommands?.dockerFallbackCommand) return gate.closeoutCommands.dockerFallbackCommand;
  if (gate.closeoutCommands?.nativeCommand) return gate.closeoutCommands.nativeCommand;
  if (gate.command) return gate.command;
  const text = `${gate.category || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  if (text.includes("manual evidence") || text.includes("operator ui walkthrough") || text.includes("field risk acceptance")) {
    return `npm.cmd run manual:evidence-readiness -- --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`;
  }
  if (text.includes("preflight") || text.includes("jwt") || text.includes("cookie") || text.includes("cors") || text.includes("swagger") || text.includes("rate limit") || text.includes("burst") || text.includes("content security") || text.includes("csp")) {
    return `npm.cmd run field:preflight -- -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict`;
  }
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) {
    return `npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=${baseUrl}`;
  }
  if (text.includes("db") || text.includes("prisma")) {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`;
  }
  if (text.includes("lidar") || text.includes("ingest")) {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}`;
  }
  if (text.includes("control-board") || text.includes("tcp") || text.includes("hardware")) {
    const liveSwitch = text.includes("live_tcp") || text.includes("live tcp") || text.includes("ack") ? " -AllowLiveTcp" : "";
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg}${liveSwitch}`;
  }
  if (text.includes("field readiness") || text.includes("readiness")) {
    return `npm.cmd run field:readiness -- --base-url=${baseUrl} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg}`;
  }
  if (text.includes("field acceptance")) {
    return `npm.cmd run field:acceptance -- -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners`;
  }
  if (text.includes("evidence source revision") && text.includes("fieldacceptance")) {
    return `npm.cmd run field:acceptance -- -BaseUrl ${baseUrl} -Reviewer ${fieldReviewerArg} -SiteName ${fieldSiteArg} -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners`;
  }
  if (text.includes("evidence source revision") && text.includes("cistatus")) {
    return `npm.cmd run ci:status -- --generated-by=${fieldReviewerArg}`;
  }
  if (text.includes("handover")) return `npm.cmd run handover:package -- --base-url=${baseUrl} --generated-by=${fieldReviewerArg} --site-name=${fieldSiteArg} --strict`;
  if (text.includes("completion")) return "npm.cmd run completion:audit";
  return `npm.cmd run final:execution-plan -- --base-url=${baseUrl}`;
}

function runtimeNoteForGate(gate) {
  if (gate.dockerScannerRuntime?.ready === false) {
    return gate.dockerScannerRuntime.error || "Docker scanner runtime is not ready.";
  }
  return "";
}

function prerequisiteHintsForGate(gate) {
  const text = `${gate.category || ""} ${gate.status || ""} ${gate.actionType || ""} ${gate.message || ""} ${gate.closeWhen || ""}`.toLowerCase();
  const hints = {
    env: ["FIELD_REVIEWER", "FIELD_SITE_NAME"],
    evidence: [],
    runtime: [],
    closeout: [],
  };

  if (text.includes("manual evidence") || text.includes("operator ui walkthrough")) {
    hints.evidence.push("artifacts/manual/operator-ui-walkthrough.md");
  }
  if (text.includes("manual evidence") || text.includes("field risk acceptance") || text.includes("risk acceptance")) {
    hints.evidence.push("artifacts/manual/field-risk-acceptance.md");
  }
  if (text.includes("jwt")) hints.env.push("JWT_SECRET");
  if (text.includes("password")) hints.env.push("SEED_ADMIN_PASSWORD");
  if (text.includes("cors")) hints.env.push("CORS_ORIGINS");
  if (text.includes("device ingest key") || text.includes("device key")) hints.env.push("DEVICE_INGEST_API_KEY");
  if (text.includes("cookie") || text.includes("https")) hints.env.push("AUTH_COOKIE_SECURE", "AUTH_COOKIE_SAMESITE");
  if (text.includes("swagger")) hints.env.push("NGINX_SWAGGER_ALLOW");
  if (text.includes("control-board") || text.includes("live_tcp") || text.includes("tcp") || text.includes("hardware")) {
    hints.env.push("CONTROL_BOARD_HOST", "CONTROL_BOARD_PORT", "CONTROL_BOARD_LIVE_APPROVED");
    hints.runtime.push("Approved integrated control board reachable on the field network");
  }
  if (text.includes("lidar") || text.includes("ingest")) {
    hints.runtime.push("Representative LiDAR PC payload source or approved replay fixture");
  }
  if (text.includes("db") || text.includes("prisma") || text.includes("runtime smoke") || text.includes("readiness") || text.includes("acceptance")) {
    hints.runtime.push("Delivery Nginx/API entrypoint is running at the configured base URL");
  }
  if (text.includes("security") || text.includes("scanner") || text.includes("zap") || text.includes("trivy") || text.includes("gitleaks")) {
    hints.runtime.push("gitleaks, Trivy, and OWASP ZAP are installed or Docker scanner runtime is reachable");
    hints.closeout.push("Attach scanner reports or accepted field-risk evidence");
  }
  if (gate.closeoutCommands?.riskAcceptanceEvidence) hints.evidence.push(gate.closeoutCommands.riskAcceptanceEvidence);
  if (gate.evidence) hints.closeout.push(`Refresh ${gate.evidence}`);

  return {
    env: [...new Set(hints.env)],
    evidence: [...new Set(hints.evidence)],
    runtime: [...new Set(hints.runtime)],
    closeout: [...new Set(hints.closeout)],
  };
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
    scanner: gate.scanner || null,
    closeoutCommands: gate.closeoutCommands || null,
    dockerScannerRuntime: gate.dockerScannerRuntime || null,
    runtimeNote: runtimeNoteForGate(gate),
    prerequisites: prerequisiteHintsForGate(gate),
    command: commandForGate(gate, baseUrl),
  }));
}

function buildMetadataActionItems(generatedBy, siteName, baseUrl) {
  const rerunCommand = `npm.cmd run field:action-board -- --base-url=${baseUrl} --site-name=${fieldSiteArg} --generated-by=${fieldReviewerArg}`;
  const items = [];
  if (isPlaceholderFieldText(generatedBy)) {
    items.push({
      id: "META-001",
      owner: "PM/QA",
      priority: "P1",
      phase: "Field Review",
      actionType: "FIELD_ACTION_REQUIRED",
      category: "Field Metadata",
      status: "PLACEHOLDER_METADATA",
      message: "Generated-by reviewer metadata is missing or placeholder.",
      closeWhen: "Set FIELD_REVIEWER to a concrete field reviewer and rerun field:action-board.",
        evidence: null,
        runtimeNote: "",
        prerequisites: {
          env: ["FIELD_REVIEWER", "FIELD_SITE_NAME"],
          evidence: [],
          runtime: [],
          closeout: ["Regenerate field-action-board with concrete reviewer metadata"],
        },
        command: rerunCommand,
      });
  }
  if (isPlaceholderFieldText(siteName)) {
    items.push({
      id: "META-002",
      owner: "PM/QA",
      priority: "P1",
      phase: "Field Review",
      actionType: "FIELD_ACTION_REQUIRED",
      category: "Field Metadata",
      status: "PLACEHOLDER_METADATA",
      message: "Site name metadata is missing or placeholder.",
      closeWhen: "Set FIELD_SITE_NAME to a concrete delivery site and rerun field:action-board.",
      evidence: null,
      runtimeNote: "",
      prerequisites: {
        env: ["FIELD_REVIEWER", "FIELD_SITE_NAME"],
        evidence: [],
        runtime: [],
        closeout: ["Regenerate field-action-board with concrete site metadata"],
      },
      command: rerunCommand,
    });
  }
  return items;
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

function buildExecutionQueue(items) {
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
  const priorityScore = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const queued = [];
  const seen = new Map();

  items.forEach((item) => {
    const key = `${item.phase}::${item.command}`;
    if (!seen.has(key)) {
      const entry = {
        order: 0,
        phase: item.phase,
        command: item.command,
        owner: item.owner,
        owners: [item.owner],
        priority: item.priority,
        gateCount: 0,
        categories: [],
        evidence: [],
        prerequisites: {
          env: [],
          evidence: [],
          runtime: [],
          closeout: [],
        },
      };
      seen.set(key, entry);
      queued.push(entry);
    }

    const entry = seen.get(key);
    entry.gateCount += 1;
    if (!entry.owners.includes(item.owner)) entry.owners.push(item.owner);
    if (priorityScore[item.priority] < priorityScore[entry.priority]) entry.priority = item.priority;
      if (!entry.categories.includes(item.category)) entry.categories.push(item.category);
      if (item.evidence && !entry.evidence.includes(item.evidence)) entry.evidence.push(item.evidence);
      if (item.runtimeNote) {
        entry.runtimeNotes = entry.runtimeNotes || [];
        if (!entry.runtimeNotes.includes(item.runtimeNote)) entry.runtimeNotes.push(item.runtimeNote);
      }
      ["env", "evidence", "runtime", "closeout"].forEach((key) => {
        (item.prerequisites?.[key] || []).forEach((value) => {
          if (!entry.prerequisites[key].includes(value)) entry.prerequisites[key].push(value);
        });
      });
  });

  return queued
    .sort(
      (a, b) =>
        phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) ||
        priorityScore[a.priority] - priorityScore[b.priority] ||
        b.gateCount - a.gateCount ||
        a.command.localeCompare(b.command),
    )
    .map((entry, index) => ({
      ...entry,
      order: index + 1,
      owner: entry.owners.join(", "),
    }));
}

function buildManifest(input = {}) {
  const finalStatus = input.finalStatus || readLatestJsonManifest("artifacts/final-status");
  const baseUrl = input.baseUrl || finalStatus?.data?.baseUrl || "http://localhost:8080";
  const generatedBy = input.generatedBy || process.env.USERNAME || process.env.USER || "Codex";
  const siteName = input.siteName || finalStatus?.data?.siteName || "unspecified";
  const items = [
    ...buildActionItems(finalStatus, baseUrl),
    ...buildMetadataActionItems(generatedBy, siteName, baseUrl),
  ];
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedBy,
    siteName,
    hostName: input.hostName || os.hostname(),
    baseUrl,
    status: finalStatus ? (items.length > 0 ? "OPEN" : "READY_TO_CLOSE") : "FINAL_STATUS_MISSING",
    openActionCount: items.length,
    sourceFinalStatus: finalStatus?.path || null,
    git: buildGitState(input.git),
    ownerGroups: groupByOwner(items),
    phaseGroups: groupByPhase(items),
    executionQueue: buildExecutionQueue(items),
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
    "## Execution Queue",
    "",
    "| Order | Phase | Priority | Gate Count | Owners | Categories | Evidence | Runtime Notes | Prerequisites | Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.executionQueue.length > 0
      ? manifest.executionQueue.map(
          (item) =>
            `| ${item.order} | ${markdownCell(item.phase)} | ${markdownCell(item.priority)} | ${item.gateCount} | ${markdownCell(item.owner)} | ${markdownCell(item.categories.join(", "))} | ${markdownCell(item.evidence.join(", ") || "missing")} | ${markdownCell((item.runtimeNotes || []).join("; ") || "-")} | ${markdownCell(formatPrerequisites(item.prerequisites))} | \`${markdownCell(item.command)}\` |`,
        )
      : ["| 0 | none | - | 0 | - | - | - | - | - | No commands required. |"]),
    "",
    "## Action Items",
    "",
    "| ID | Priority | Phase | Owner | Action Type | Category | Status | Message | Close When | Evidence | Scanner | Risk Acceptance Evidence | Runtime Note | Prerequisites | Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(manifest.actionItems.length > 0
      ? manifest.actionItems.map(
          (item) =>
            `| ${item.id} | ${item.priority} | ${markdownCell(item.phase)} | ${markdownCell(item.owner)} | ${markdownCell(item.actionType)} | ${markdownCell(item.category)} | ${markdownCell(item.status)} | ${markdownCell(item.message)} | ${markdownCell(item.closeWhen)} | ${item.evidence ? `\`${markdownCell(item.evidence)}\`` : "missing"} | ${markdownCell(item.scanner || "-")} | ${item.closeoutCommands?.riskAcceptanceEvidence ? `\`${markdownCell(item.closeoutCommands.riskAcceptanceEvidence)}\`` : "-"} | ${markdownCell(item.runtimeNote || "-")} | ${markdownCell(formatPrerequisites(item.prerequisites))} | \`${markdownCell(item.command)}\` |`,
        )
      : ["| none | - | - | - | - | - | PASS | No open final-status gates. | - | - | - | - | - | - | - |"]),
    "",
  ].join("\n");
}

function formatPrerequisites(prerequisites) {
  if (!prerequisites) return "-";
  const parts = [
    prerequisites.env?.length ? `env=${prerequisites.env.join(", ")}` : "",
    prerequisites.evidence?.length ? `evidence=${prerequisites.evidence.join(", ")}` : "",
    prerequisites.runtime?.length ? `runtime=${prerequisites.runtime.join(", ")}` : "",
    prerequisites.closeout?.length ? `closeout=${prerequisites.closeout.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "-";
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
  buildMetadataActionItems,
  buildManifest,
  buildMarkdown,
  buildActionItems,
  buildExecutionQueue,
  groupByOwner,
  groupByPhase,
  ownerForGate,
  priorityForGate,
  prerequisiteHintsForGate,
  runtimeNoteForGate,
  phaseForGate,
  commandForGate,
  formatPrerequisites,
};
