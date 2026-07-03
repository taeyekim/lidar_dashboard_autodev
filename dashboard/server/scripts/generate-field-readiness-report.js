const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { timestampForPath } = require("./generate-delivery-evidence");

const root = path.join(__dirname, "..", "..", "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function runCommand(label, command, args) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    label,
    command: [command, ...args].join(" "),
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  return runCommand(`${command} availability`, probe, args).exitCode === 0;
}

function readEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, values: {} };
  const values = {};
  fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .forEach((line) => {
      const index = line.indexOf("=");
      values[line.slice(0, index)] = line.slice(index + 1);
    });
  return { exists: true, values };
}

function envValue(values, name) {
  return process.env[name] || values[name] || "";
}

function buildCheck(name, status, severity, message, nextAction = "") {
  return { name, status, severity, message, nextAction };
}

function buildEnvChecks() {
  const example = readEnvFile(".env.example");
  const local = readEnvFile(".env");
  const values = local.values;
  const checks = [];

  checks.push(buildCheck(".env presence", local.exists ? "PASS" : "REVIEW", "critical", local.exists ? ".env is present." : ".env is missing.", "Copy .env.example to .env and fill field values."));

  const jwtSecret = envValue(values, "JWT_SECRET");
  checks.push(buildCheck("JWT secret", jwtSecret && jwtSecret !== "change-this-to-a-long-random-secret" ? "PASS" : "REVIEW", "critical", jwtSecret ? "JWT_SECRET is present without exposing the value." : "JWT_SECRET is missing.", "Set a long random JWT_SECRET."));

  const adminPassword = envValue(values, "SEED_ADMIN_PASSWORD");
  checks.push(buildCheck("seed admin password", adminPassword && adminPassword !== "admin1234!" ? "PASS" : "REVIEW", "critical", adminPassword ? "SEED_ADMIN_PASSWORD is present without exposing the value." : "SEED_ADMIN_PASSWORD is missing.", "Set a non-example seed admin password before field acceptance."));

  const deviceKey = envValue(values, "DEVICE_INGEST_API_KEY");
  checks.push(buildCheck("device ingest key", deviceKey ? "PASS" : "REVIEW", "warning", deviceKey ? "DEVICE_INGEST_API_KEY is configured and redacted." : "DEVICE_INGEST_API_KEY is not configured.", "Configure the device key or document the trusted-LAN exception."));

  const dryRun = envValue(values, "CONTROL_BOARD_DRY_RUN").toLowerCase();
  const host = envValue(values, "CONTROL_BOARD_HOST");
  const port = envValue(values, "CONTROL_BOARD_PORT");
  const liveReady = dryRun === "false" && host && port;
  const safetyStatus = dryRun === "false" ? (liveReady ? "LIVE_TCP_READY" : "LIVE_TCP_REVIEW") : "DRY_RUN_SAFE";
  checks.push(buildCheck("control-board TCP mode", liveReady ? "PASS" : "REVIEW", "critical", `${safetyStatus}: ${liveReady ? "LIVE_TCP values are configured." : "Control-board is dry-run or live TCP values are incomplete."}`, "Set CONTROL_BOARD_DRY_RUN=false only after field IP/port and hardware approval are confirmed."));

  const secureCookie = envValue(values, "AUTH_COOKIE_SECURE").toLowerCase();
  const swaggerAllow = envValue(values, "NGINX_SWAGGER_ALLOW");
  checks.push(buildCheck("HTTPS cookie setting", secureCookie === "true" ? "PASS" : "REVIEW", "warning", secureCookie === "true" ? "AUTH_COOKIE_SECURE=true." : "AUTH_COOKIE_SECURE is not true.", "Set AUTH_COOKIE_SECURE=true when HTTPS/TLS is used."));
  checks.push(buildCheck("Swagger allowlist", swaggerAllow && swaggerAllow !== "all" ? "PASS" : "REVIEW", "warning", swaggerAllow && swaggerAllow !== "all" ? "NGINX_SWAGGER_ALLOW is restricted." : "NGINX_SWAGGER_ALLOW is open or missing.", "Restrict Swagger to the operator/internal network before delivery."));

  const exampleKeys = Object.keys(example.values);
  const missingExampleKeys = local.exists ? exampleKeys.filter((key) => !(key in values)) : exampleKeys;
  return {
    exists: local.exists,
    exampleExists: example.exists,
    presentKeyCount: Object.keys(values).length,
    exampleKeyCount: exampleKeys.length,
    missingExampleKeys,
    controlBoardSafetyStatus: safetyStatus,
    checks,
  };
}

function buildRuntimeChecks(baseUrl) {
  const checks = [];
  const dockerCli = runCommand("docker cli", "docker", ["--version"]);
  checks.push(buildCheck("Docker CLI", dockerCli.exitCode === 0 ? "PASS" : "REVIEW", "critical", dockerCli.exitCode === 0 ? dockerCli.stdout.trim() : "Docker CLI is unavailable.", "Install Docker Desktop/Engine."));
  const dockerDaemon = runCommand("docker daemon", "docker", ["compose", "ps", "--format", "json"]);
  checks.push(buildCheck("Docker daemon", dockerDaemon.exitCode === 0 ? "PASS" : "REVIEW", "critical", dockerDaemon.exitCode === 0 ? "Docker daemon is reachable." : "Docker daemon is not reachable.", "Start Docker Desktop/Engine before runtime smoke."));
  const composeConfig = runCommand("docker compose config", "docker", ["compose", "config", "--quiet"]);
  checks.push(buildCheck("Docker compose config", composeConfig.exitCode === 0 ? "PASS" : "REVIEW", "critical", composeConfig.exitCode === 0 ? "docker compose config passes." : "docker compose config failed.", "Fix compose configuration before field acceptance."));
  const health = runCommand("Nginx API health", "curl", ["-sS", "-f", `${baseUrl}/api/health`]);
  checks.push(buildCheck("Nginx/API health", health.exitCode === 0 ? "PASS" : "REVIEW", "critical", health.exitCode === 0 ? "API health endpoint responded." : "API health endpoint is not reachable.", "Start the delivery stack and confirm the Nginx base URL."));
  return checks;
}

function buildToolChecks() {
  return ["gitleaks", "trivy", "zap-baseline.py"].map((tool) => {
    const available = commandExists(tool);
    return buildCheck(`${tool} availability`, available ? "PASS" : "SKIPPED", "warning", available ? `${tool} is installed.` : `${tool} is not installed.`, `Install ${tool} or document skipped scanner evidence.`);
  });
}

function buildManifest(options) {
  const env = buildEnvChecks();
  const checks = [
    ...env.checks,
    ...buildRuntimeChecks(options.baseUrl),
    ...buildToolChecks(),
  ];
  const reviewCount = checks.filter((check) => check.status === "REVIEW").length;
  const skippedCount = checks.filter((check) => check.status === "SKIPPED").length;
  return {
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy,
    siteName: options.siteName,
    hostName: os.hostname(),
    baseUrl: options.baseUrl,
    status: reviewCount > 0 ? "REVIEW" : skippedCount > 0 ? "PASS_WITH_SKIPS" : "PASS",
    reviewCount,
    skippedCount,
    env,
    checks,
  };
}

function buildMarkdown(manifest) {
  const tableValue = (value) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return [
    "# Field Readiness Report",
    "",
    `- Status: ${manifest.status}`,
    `- Review count: ${manifest.reviewCount}`,
    `- Skipped count: ${manifest.skippedCount}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    "",
    "## Checks",
    "",
    "| Status | Severity | Check | Message | Next Action |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.checks.map((check) => `| ${check.status} | ${check.severity} | ${tableValue(check.name)} | ${tableValue(check.message)} | ${tableValue(check.nextAction)} |`),
    "",
    "## Environment Keys",
    "",
    `- .env exists: ${manifest.env.exists}`,
    `- .env.example exists: ${manifest.env.exampleExists}`,
    `- Present .env key count: ${manifest.env.presentKeyCount}`,
    `- .env.example key count: ${manifest.env.exampleKeyCount}`,
    `- Missing .env.example keys: ${manifest.env.missingExampleKeys.join(", ") || "none"}`,
    `- Control-board safety status: ${manifest.env.controlBoardSafetyStatus}`,
    "",
  ].join("\n");
}

function main() {
  const outputRoot = argValue("output-root", "artifacts/field-readiness");
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const manifest = buildManifest({
    baseUrl: argValue("base-url", "http://localhost:8080"),
    generatedBy: argValue("generated-by", process.env.USERNAME || process.env.USER || "Codex"),
    siteName: argValue("site-name", "unspecified"),
  });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));
  console.log(`field readiness report written to ${path.relative(root, outputDir)}`);
  console.log(`field readiness status: ${manifest.status}`);
}

if (require.main === module) {
  main();
}
