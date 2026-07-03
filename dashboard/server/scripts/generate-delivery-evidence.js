const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function runCommand(label, command, args, options = {}) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  return {
    label,
    command: [command, ...args].join(" "),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function gitValue(args) {
  const result = runCommand(`git ${args.join(" ")}`, "git", args);
  return result.stdout.trim();
}

function writeCommandLog(dir, item) {
  const fileName = `${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "command"}.log`;
  fs.writeFileSync(
    path.join(dir, fileName),
    [
      `# ${item.label}`,
      `command=${item.command}`,
      `startedAt=${item.startedAt}`,
      `finishedAt=${item.finishedAt}`,
      `exitCode=${item.exitCode}`,
      item.error ? `error=${item.error}` : "",
      "## stdout",
      item.stdout,
      "## stderr",
      item.stderr,
      "",
    ].join("\n"),
  );
  return fileName;
}

function statusLabel(exitCode) {
  return exitCode === 0 ? "PASS" : "FAIL";
}

function buildMarkdown(manifest) {
  const lines = [
    "# Delivery Evidence Manifest",
    "",
    `- Generated at: ${manifest.generatedAt}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Verification Commands",
    "",
    "| Status | Command | Log |",
    "| --- | --- | --- |",
  ];

  manifest.commands.forEach((item) => {
    lines.push(`| ${statusLabel(item.exitCode)} | \`${item.command}\` | \`${item.logFile}\` |`);
  });

  lines.push(
    "",
    "## Field Verification Still Required",
    "",
    "- Real integrated control board TCP test requires field IP/port and hardware approval.",
    "- Dashboard-side wrong-way level-2 escalation criteria remain field-measurement dependent.",
    "- Optional external tools such as gitleaks, Trivy, and OWASP ZAP are captured by `npm run security:evidence` or `scripts/security-scan.ps1` when installed.",
    "- Cross-platform security evidence can be generated with `npm run security:evidence`.",
    "- Runtime smoke with real Docker services and device ingest key should be attached here when performed on the delivery machine.",
    "",
    "## Evidence Notes",
    "",
    "- `manifest.json` contains the machine-readable version of this file.",
    "- Raw command output is stored next to this manifest.",
    "- The `artifacts/` directory is intentionally ignored by Git; attach the generated folder to the delivery package.",
    "",
  );

  return lines.join("\n");
}

function main() {
  const outputRootArg = process.argv.find((arg) => arg.startsWith("--output-root="));
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/delivery";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const commands = [
    ["smoke", npmCommand, ["run", "smoke"]],
    ["frontend lint", npmCommand, ["--prefix", "dashboard/dashboard-web", "run", "lint"]],
    ["ci", npmCommand, ["run", "ci"]],
    ["audit policy", npmCommand, ["run", "verify:audit-policy"]],
    ["docker compose config", "docker", ["compose", "config", "--quiet"]],
  ].map(([label, command, args]) => runCommand(label, command, args));

  const manifest = {
    generatedAt: new Date().toISOString(),
    git: {
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      commit: gitValue(["rev-parse", "HEAD"]),
      clean: gitValue(["status", "--short"]) === "",
    },
    commands: commands.map((item) => ({
      label: item.label,
      command: item.command,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      exitCode: item.exitCode,
      error: item.error,
      logFile: writeCommandLog(outputDir, item),
    })),
    fieldVerificationStillRequired: [
      "Real integrated control board TCP test requires field IP/port and hardware approval.",
      "Dashboard-side wrong-way level-2 escalation criteria remain field-measurement dependent.",
      "Optional gitleaks, Trivy, and OWASP ZAP evidence depends on installed tools and explicit security evidence run.",
      "Run npm run security:evidence to capture npm audit, policy gate, optional scan results, and skipped-check reasons.",
      "Runtime smoke against live Docker services should be attached when performed on the delivery machine.",
    ],
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));

  const failed = manifest.commands.filter((item) => item.exitCode !== 0);
  console.log(`delivery evidence written to ${path.relative(root, outputDir)}`);
  if (failed.length > 0) {
    console.error(`delivery evidence captured failures: ${failed.map((item) => item.label).join(", ")}`);
    process.exit(1);
  }
}

main();
