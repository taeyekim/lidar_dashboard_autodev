const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { resolveFieldBaseUrl } = require("./field-env");

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

function parseEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    return { exists: false, keys: [] };
  }

  const keys = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")))
    .sort();

  return { exists: true, keys };
}

function buildEnvReadiness() {
  const example = parseEnvFile(".env.example");
  const local = parseEnvFile(".env");
  const presentKeySet = new Set(local.keys);
  const missingKeys = local.exists ? example.keys.filter((key) => !presentKeySet.has(key)) : [];

  return {
    exists: local.exists,
    exampleExists: example.exists,
    exampleKeys: example.keys,
    presentKeys: local.keys,
    missingKeys,
    // Backward-compatible alias for older evidence readers.
    keys: local.keys,
  };
}

function statusLabel(item) {
  if (item.status === "skipped") return "SKIPPED";
  return item.exitCode === 0 ? "PASS" : "REVIEW";
}

const RUNTIME_SMOKE_COVERAGE = Object.freeze([
  {
    id: "nginx-health-security",
    area: "Nginx And Runtime",
    evidence: "healthz, SPA, and frontend asset status/security/cache headers",
    probes: ["Nginx healthz smoke", "healthz security header smoke", "SPA security header smoke", "frontend asset security header smoke"],
    acceptance: "Nginx entrypoint returns expected status codes and security/cache headers.",
  },
  {
    id: "swagger-entrypoint",
    area: "API And Swagger",
    evidence: "GET /api-docs.json and Swagger UI path",
    probes: ["Swagger UI path smoke"],
    acceptance: "Swagger JSON and UI are reachable through the delivery entrypoint.",
  },
  {
    id: "auth-cookie-csrf",
    area: "Authentication",
    evidence: "HttpOnly login, readable CSRF cookie, protected reads, CSRF mutation checks, logout clearing",
    probes: ["non-json mutation smoke", "cookie-auth mutation without CSRF smoke", "cookie-auth mutation with CSRF smoke", "cookie-auth logout smoke", "logout clears cookie smoke"],
    acceptance: "Cookie auth does not expose JWT body token, CSRF is required for mutations, and logout clears session cookies.",
  },
  {
    id: "device-ingest-key",
    area: "LiDAR Ingest + Security",
    evidence: "missing X-Device-Key rejection for wrongway, LiDAR ingest, and control-board bridge paths when configured",
    probes: ["missing X-Device-Key wrongway smoke", "missing X-Device-Key lidar ingest smoke", "missing X-Device-Key control-board ingest smoke"],
    acceptance: "Configured device ingest key gates reject unauthenticated device/bridge writes before processing.",
  },
  {
    id: "wrongway-lifecycle",
    area: "LiDAR Ingest",
    evidence: "normal-driving, wrong-way level-1/2, duplicate handling, situation-ended, event detail raw payload and command timeline",
    probes: ["POST /api/wrongway", "event detail raw payload", "controlCommands", "packetHex"],
    acceptance: "Representative LiDAR payloads create/update tracks and events, retain raw payload, and expose linked control command data.",
  },
  {
    id: "control-board-frame",
    area: "Control Board TCP",
    evidence: "POST /api/ingest/control-board/tcp/test parser/CRC and status metrics",
    probes: ["/api/ingest/control-board/tcp/test", "TCP_FRAME_TEST", "GET /api/control-board/status", "averageResponseMs", "responseSampleCount", "liveTcpReady", "liveApproved", "safetyStatus"],
    acceptance: "TCP frame diagnostic endpoint validates the 10-byte frame contract and status exposes timing/safety fields.",
  },
  {
    id: "operator-kpis",
    area: "Traffic Statistics",
    evidence: "events summary and daily traffic statistics counters/rates/latency",
    probes: ["/api/events/summary", "vehiclesPassed", "wrongwayVehicles", "wrongWayEvents", "wrongwayRate", "/api/statistics/traffic?range=daily", "normalVehicles", "averageResponseMs"],
    acceptance: "Operator KPI endpoints expose unique vehicle counts, wrong-way counts/rate, and command latency fields.",
  },
]);

function buildRuntimeSmokeCoverage(commands, options) {
  const runtimeSmoke = commands.find((item) => item.label === "runtime smoke");
  const commandStatus = !runtimeSmoke || runtimeSmoke.status === "skipped" ? "SKIPPED" : runtimeSmoke.exitCode === 0 ? "PASS" : "REVIEW";
  const rows = RUNTIME_SMOKE_COVERAGE.map((item) => ({
    ...item,
    status: commandStatus,
    command: runtimeSmoke?.command || null,
    logFile: runtimeSmoke?.logFile || null,
    baseUrl: options.baseUrl,
  }));
  return {
    source: "scripts/runtime-smoke.ps1",
    enabled: options.runSmoke === true,
    baseUrl: options.baseUrl,
    useExistingStack: options.useExistingStack === true,
    commandStatus,
    coveredAreaCount: commandStatus === "PASS" ? rows.length : 0,
    reviewAreaCount: commandStatus === "REVIEW" ? rows.length : 0,
    skippedAreaCount: commandStatus === "SKIPPED" ? rows.length : 0,
    rows,
  };
}

function buildMarkdown(manifest) {
  const lines = [
    "# Runtime Evidence Manifest",
    "",
    `- Generated at: ${manifest.generatedAt}`,
    `- Run compose smoke: ${manifest.options.runSmoke ? "yes" : "no"}`,
    `- Smoke base URL: ${manifest.options.baseUrl}`,
    `- Use existing stack: ${manifest.options.useExistingStack ? "yes" : "no"}`,
    `- .env exists: ${manifest.env.exists ? "yes" : "no"}`,
    `- .env keys recorded: ${manifest.env.presentKeys.length}`,
    `- .env.example keys recorded: ${manifest.env.exampleKeys.length}`,
    `- Missing .env keys: ${manifest.env.exists ? manifest.env.missingKeys.length : "not checked"}`,
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
    "## Runtime Smoke Coverage",
    "",
    `- Source: ${manifest.runtimeSmokeCoverage.source}`,
    `- Enabled: ${manifest.runtimeSmokeCoverage.enabled ? "yes" : "no"}`,
    `- Base URL: ${manifest.runtimeSmokeCoverage.baseUrl}`,
    `- Use existing stack: ${manifest.runtimeSmokeCoverage.useExistingStack ? "yes" : "no"}`,
    `- Command status: ${manifest.runtimeSmokeCoverage.commandStatus}`,
    `- Covered area count: ${manifest.runtimeSmokeCoverage.coveredAreaCount}`,
    `- Review area count: ${manifest.runtimeSmokeCoverage.reviewAreaCount}`,
    `- Skipped area count: ${manifest.runtimeSmokeCoverage.skippedAreaCount}`,
    "",
    "| Area | Status | Evidence | Probes | Acceptance | Log |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  manifest.runtimeSmokeCoverage.rows.forEach((item) => {
    lines.push(
      `| ${item.area} | ${item.status} | ${item.evidence.replace(/\|/g, "\\|")} | ${item.probes.join(", ").replace(/\|/g, "\\|")} | ${item.acceptance.replace(/\|/g, "\\|")} | ${item.logFile ? `\`${item.logFile}\`` : "-"} |`,
    );
  });

  lines.push(
    "",
    "## Environment Readiness",
    "",
    "Values are intentionally omitted.",
    "",
    "| Check | Result |",
    "| --- | --- |",
    `| .env.example exists | ${manifest.env.exampleExists ? "yes" : "no"} |`,
    `| .env exists | ${manifest.env.exists ? "yes" : "no"} |`,
    `| .env.example key count | ${manifest.env.exampleKeys.length} |`,
    `| .env key count | ${manifest.env.presentKeys.length} |`,
    `| Missing keys | ${manifest.env.exists ? manifest.env.missingKeys.join(", ") || "none" : "skipped because .env is missing"} |`,
    "",
    "## Environment Keys",
    "",
    "Values are intentionally omitted.",
    "",
    "```text",
    ...manifest.env.presentKeys,
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
  const useExistingStack = process.argv.includes("--use-existing-stack");
  const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="));
  const baseUrl = baseUrlArg ? baseUrlArg.slice("--base-url=".length) : resolveFieldBaseUrl();
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
    const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";
    if (useExistingStack) {
      commands.push(
        runCommand("runtime smoke", shell, [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/runtime-smoke.ps1",
          "-BaseUrl",
          baseUrl,
        ]),
      );
    } else if (!daemonAvailable) {
      commands.push(skipped("runtime smoke", "Docker daemon is not reachable; run again after Docker Desktop/engine is started"));
    } else {
      commands.push(
        runCommand("runtime smoke", shell, [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/runtime-smoke.ps1",
          "-BaseUrl",
          baseUrl,
          "-StartCompose",
          "-StopCompose",
        ]),
      );
    }
  } else {
    commands.push(
      skipped(
        "runtime smoke",
        "Run with --run-smoke to start Docker compose, or --run-smoke --use-existing-stack --base-url=<url> against an already running delivery stack",
      ),
    );
  }

  const env = buildEnvReadiness();
  if (!env.exists) {
    notes.push(".env is not present; copy .env.example to .env and fill field values before runtime smoke.");
  } else if (env.missingKeys.length > 0) {
    notes.push(`.env is missing keys from .env.example: ${env.missingKeys.join(", ")}`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    options: { runSmoke, baseUrl, useExistingStack },
    env,
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
  manifest.runtimeSmokeCoverage = buildRuntimeSmokeCoverage(manifest.commands, manifest.options);

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
