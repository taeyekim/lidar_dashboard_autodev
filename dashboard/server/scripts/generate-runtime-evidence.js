const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..", "..");

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

function parseEnvKeys() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    return { exists: false, keys: [] };
  }

  const keys = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")))
    .sort();

  return { exists: true, keys };
}

function statusLabel(item) {
  if (item.status === "skipped") return "SKIPPED";
  return item.exitCode === 0 ? "PASS" : "REVIEW";
}

function buildMarkdown(manifest) {
  const lines = [
    "# Runtime Evidence Manifest",
    "",
    `- Generated at: ${manifest.generatedAt}`,
    `- Run compose smoke: ${manifest.options.runSmoke ? "yes" : "no"}`,
    `- .env exists: ${manifest.env.exists ? "yes" : "no"}`,
    `- .env keys recorded: ${manifest.env.keys.length}`,
    "",
    "## Commands",
    "",
    "| Status | Command | Log |",
    "| --- | --- | --- |",
  ];

  manifest.commands.forEach((item) => {
    lines.push(`| ${statusLabel(item)} | \`${item.command || item.reason}\` | ${item.logFile ? `\`${item.logFile}\`` : ""} |`);
  });

  if (manifest.notes.length > 0) {
    lines.push("", "## Notes", "");
    manifest.notes.forEach((note) => lines.push(`- ${note}`));
  }

  lines.push(
    "",
    "## Environment Keys",
    "",
    "Values are intentionally omitted.",
    "",
    "```text",
    ...manifest.env.keys,
    "```",
    "",
  );

  return lines.join("\n");
}

function skipped(label, reason) {
  return {
    label,
    status: "skipped",
    reason,
    command: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    logFile: null,
  };
}

function main() {
  const runSmoke = process.argv.includes("--run-smoke");
  const outputRootArg = process.argv.find((arg) => arg.startsWith("--output-root="));
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/runtime";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);

  const commands = [
    runCommand("docker version", "docker", ["--version"]),
    runCommand("docker compose version", "docker", ["compose", "version"]),
    runCommand("docker compose config", "docker", ["compose", "config", "--quiet"]),
    runCommand("docker compose daemon check", "docker", ["compose", "ps", "--format", "json"]),
  ];

  const daemonAvailable = commands.find((item) => item.label === "docker compose daemon check")?.exitCode === 0;
  const notes = [];

  if (!daemonAvailable) {
    notes.push("Docker CLI is installed, but Docker daemon/engine is not reachable on this machine.");
  }

  if (runSmoke) {
    if (!daemonAvailable) {
      commands.push(skipped("runtime smoke", "Docker daemon is not reachable; run again after Docker Desktop/engine is started"));
    } else {
      const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";
      commands.push(
        runCommand("runtime smoke", shell, [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/runtime-smoke.ps1",
          "-StartCompose",
          "-StopCompose",
        ]),
      );
    }
  } else {
    commands.push(skipped("runtime smoke", "Run with --run-smoke to start Docker compose and execute scripts/runtime-smoke.ps1"));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    options: { runSmoke },
    env: parseEnvKeys(),
    notes,
    commands: commands.map((item) => {
      const logFile = item.status === "skipped" ? null : writeCommandLog(outputDir, item);
      return {
        label: item.label,
        status: item.status || "executed",
        reason: item.reason || null,
        command: item.command,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        exitCode: item.exitCode,
        error: item.error,
        logFile,
      };
    }),
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));

  console.log(`runtime evidence written to ${path.relative(root, outputDir)}`);
  const requiredFailures = manifest.commands.filter(
    (item) =>
      item.status !== "skipped" &&
      ["docker version", "docker compose version", "docker compose config"].includes(item.label) &&
      item.exitCode !== 0,
  );
  if (requiredFailures.length > 0) {
    process.exit(1);
  }
}

main();
