const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { readLatestJsonManifest, timestampForPath } = require("./generate-delivery-evidence");
const { buildGitState } = require("./generate-final-status-report");
const { resolveFieldBaseUrl } = require("./field-env");

const root = path.join(__dirname, "..", "..", "..");
const OUTPUT_ROOT = "artifacts/field-acceptance";
const BLOCKING_RUNTIME_PREFIXES = [
  "dashboard/server/src/",
  "dashboard/server/prisma/",
  "dashboard/dashboard-web/src/",
  "dashboard/dashboard-web/public/",
  "dashboard/dashboard-web/Dockerfile",
  "dashboard/server/Dockerfile",
  "docker-compose.yml",
  "nginx/",
  "scripts/runtime-smoke.ps1",
  "scripts/db-field-rehearsal.ps1",
  "scripts/lidar-ingest-rehearsal.ps1",
  "scripts/control-board-field-rehearsal.ps1",
  "scripts/field-acceptance.ps1",
  "scripts/field-preflight.ps1",
];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function runGit(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function isPassAcceptance(manifest) {
  const data = manifest?.data || {};
  const steps = Array.isArray(data.steps) ? data.steps : [];
  return (
    data.status === "PASS" &&
    data.handover?.readyForHandover === true &&
    data.handover?.requiresFieldReview === false &&
    steps.length > 0 &&
    steps.every((step) => step.status === "PASS")
  );
}

function listChangedFiles(fromCommit, toCommit) {
  if (!fromCommit || !toCommit || fromCommit === toCommit) return [];
  return runGit(["diff", "--name-only", `${fromCommit}..${toCommit}`])
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function isRuntimeBlockingFile(filePath) {
  return BLOCKING_RUNTIME_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

function normalizeEvidencePath(value) {
  if (!value) return null;
  return path.relative(root, path.isAbsolute(value) ? value : path.join(root, value)).replace(/\\/g, "/");
}

function writeMarkdown(filePath, manifest) {
  const lines = [
    "# Field Acceptance Carry-Forward",
    "",
    `- Status: ${manifest.status}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Source acceptance: ${manifest.carryForward.sourceManifest}`,
    `- Source commit: ${manifest.carryForward.sourceCommit}`,
    `- Current commit: ${manifest.git.commit}`,
    `- Changed files checked: ${manifest.carryForward.changedFiles.length}`,
    `- Blocking runtime files: ${manifest.carryForward.blockingRuntimeFiles.length}`,
    "",
    "## Scope",
    "",
    "- This manifest carries forward a prior PASS field acceptance only when runtime UI/API/DB/protocol sources did not change after that acceptance.",
    "- It does not close field preflight, live control-board TCP, device-key, HTTPS cookie, Swagger allowlist, or CI gates.",
    "- If any blocking runtime file changed, rerun the full field acceptance instead of carrying it forward.",
    "",
    "## Changed Files",
    "",
    ...(manifest.carryForward.changedFiles.length > 0 ? manifest.carryForward.changedFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const source = readLatestJsonManifest(OUTPUT_ROOT);
  if (!isPassAcceptance(source)) {
    throw new Error("Latest accepted field acceptance PASS manifest was not found; cannot carry forward.");
  }

  const git = buildGitState();
  if (git.clean !== true || git.branch !== "dev" || git.pushed !== true) {
    throw new Error("Carry-forward requires a clean pushed dev worktree.");
  }

  const sourceCommit = source.data.git?.commit || null;
  const changedFiles = listChangedFiles(sourceCommit, git.commit);
  const blockingRuntimeFiles = changedFiles.filter(isRuntimeBlockingFile);
  if (blockingRuntimeFiles.length > 0) {
    throw new Error(`Runtime-affecting files changed after source acceptance: ${blockingRuntimeFiles.join(", ")}`);
  }

  const outputDir = path.join(root, OUTPUT_ROOT, timestampForPath());
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceSteps = Array.isArray(source.data.steps) ? source.data.steps : [];
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: argValue("base-url", resolveFieldBaseUrl(undefined, source.data.baseUrl)),
    outputDir: path.relative(root, outputDir).replace(/\\/g, "/"),
    git,
    status: "PASS",
    handover: {
      ...(source.data.handover || {}),
      readyForHandover: true,
      requiresFieldReview: false,
      reviewStepCount: 0,
      skippedStepCount: 0,
      nextActions: [
        "Attach this carry-forward manifest beside the source PASS field acceptance evidence.",
        "Close field preflight and hardware gates with current field values before final handover.",
      ],
    },
    safety: source.data.safety || {},
    evidenceRefs: {
      ...(source.data.evidenceRefs || {}),
      carryForwardSource: source.path,
    },
    carryForward: {
      evidenceType: "FIELD_ACCEPTANCE_CARRY_FORWARD",
      sourceManifest: source.path,
      sourceCommit,
      currentCommit: git.commit,
      changedFiles,
      blockingRuntimeFiles,
      policy: "Allowed only when runtime UI/API/DB/protocol sources did not change after the source PASS acceptance.",
    },
    steps: [
      {
        name: "field acceptance carry-forward compatibility",
        status: "PASS",
        command: "node dashboard/server/scripts/generate-field-acceptance-carry-forward.js",
        logPath: "",
        exitCode: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        reason: "Prior PASS field acceptance was carried forward because no blocking runtime source files changed.",
      },
      ...sourceSteps.map((step) => ({
        ...step,
        logPath: normalizeEvidencePath(step.logPath),
        reason: step.reason || "Carried forward from source PASS field acceptance.",
      })),
    ],
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeMarkdown(path.join(outputDir, "manifest.md"), manifest);
  console.log("field acceptance carry-forward ok");
  console.log(`evidence written to ${manifest.outputDir}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
