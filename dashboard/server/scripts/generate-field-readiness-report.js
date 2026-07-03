const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { timestampForPath } = require("./generate-delivery-evidence");
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

function gitValue(args) {
  const result = runCommand(`git ${args.join(" ")}`, "git", args);
  return result.stdout.trim();
}

function buildGitState() {
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

function checkEvidenceCommand(name) {
  const commands = {
    ".env presence": "Inspect the delivery .env on the target host; do not attach secret values.",
    "JWT secret": "Confirm JWT_SECRET is configured with a field-only value; record only configured/placeholder/missing.",
    "seed admin password": "Confirm SEED_ADMIN_PASSWORD is non-example before seeding the intended field DB.",
    "device ingest key": "Confirm DEVICE_INGEST_API_KEY is configured or attach the trusted-LAN exception note.",
    "control-board TCP mode": "Confirm CONTROL_BOARD_DRY_RUN, CONTROL_BOARD_HOST, and CONTROL_BOARD_PORT in .env before live TCP rehearsal.",
    "control-board live approval": "Confirm CONTROL_BOARD_LIVE_APPROVED=true only after the hardware owner approves live TCP testing.",
    "control-board TCP timing": "Confirm CONTROL_BOARD_CONNECT_TIMEOUT_MS, CONTROL_BOARD_RESPONSE_TIMEOUT_MS, CONTROL_BOARD_RETRY_COUNT, and CONTROL_BOARD_HEARTBEAT_INTERVAL_MS match the field board firmware/network.",
    "HTTPS cookie setting": "Confirm AUTH_COOKIE_SECURE=true in the HTTPS/TLS delivery topology.",
    "SameSite cookie setting": "Confirm AUTH_COOKIE_SAMESITE matches the delivery topology; SameSite=None requires Secure cookies.",
    "CORS trusted origins": "Confirm CORS_ORIGINS contains only approved operator UI origins.",
    "Swagger allowlist": "Confirm NGINX_SWAGGER_ALLOW is restricted to the operator/internal CIDR.",
    "Nginx wrong-way rate limit": "Confirm NGINX_WRONGWAY_RATE_LIMIT and NGINX_WRONGWAY_BURST match the expected lidar event rate.",
    "Nginx content security policy": "Confirm NGINX_CONTENT_SECURITY_POLICY allows final media hosts while keeping script/object restrictions.",
    "Docker CLI": "docker --version",
    "Docker daemon": "docker compose ps --format json",
    "Docker compose config": "docker compose config --quiet",
    "Nginx/API health": "curl -sS -f <base-url>/api/health",
    "gitleaks availability": "gitleaks detect --source . --redact",
    "trivy availability": "trivy fs --scanners vuln,secret,misconfig .",
    "zap-baseline.py availability": "zap-baseline.py -t <base-url> -r zap-baseline.html",
  };
  return commands[name] || "Record the field evidence command or reviewer note used to close this check.";
}

function checkDoneWhen(name) {
  const doneWhen = {
    ".env presence": ".env exists on the delivery host and contains every required .env.example key.",
    "JWT secret": "JWT_SECRET is present and is not the example placeholder.",
    "seed admin password": "SEED_ADMIN_PASSWORD is present and is not the example password.",
    "device ingest key": "DEVICE_INGEST_API_KEY is configured, or a signed trusted-LAN exception is attached.",
    "control-board TCP mode": "Dry-run is explicitly accepted or live TCP host/port are configured with hardware approval.",
    "control-board live approval": "CONTROL_BOARD_LIVE_APPROVED=true is recorded after hardware owner approval.",
    "control-board TCP timing": "TCP connect timeout, response timeout, retry count, and heartbeat interval are configured as non-negative numeric values approved for the field board.",
    "HTTPS cookie setting": "AUTH_COOKIE_SECURE=true for the HTTPS/TLS delivery route.",
    "SameSite cookie setting": "AUTH_COOKIE_SAMESITE matches the same-site or cross-site HTTPS delivery route.",
    "CORS trusted origins": "CORS_ORIGINS contains only approved operator UI origins and no wildcard/open entry.",
    "Swagger allowlist": "NGINX_SWAGGER_ALLOW is restricted to the approved operator/internal CIDR.",
    "Nginx wrong-way rate limit": "Wrong-way ingest rate limit and burst values match the expected lidar sender rate.",
    "Nginx content security policy": "Content Security Policy is reviewed for the final camera/lidar/media hosts.",
    "Docker CLI": "Docker CLI version command exits successfully on the delivery host.",
    "Docker daemon": "Docker daemon responds and compose service state can be listed.",
    "Docker compose config": "Docker compose config validates without errors.",
    "Nginx/API health": "The Nginx entrypoint returns a successful /api/health response.",
    "gitleaks availability": "Gitleaks is installed and secret scan evidence is attached or intentionally accepted as skipped.",
    "trivy availability": "Trivy is installed and filesystem/image scan evidence is attached or intentionally accepted as skipped.",
    "zap-baseline.py availability": "OWASP ZAP baseline is installed and report evidence is attached or intentionally accepted as skipped.",
  };
  return doneWhen[name] || "The check no longer reports REVIEW or SKIPPED in the field readiness manifest.";
}

function buildCheck(name, status, severity, message, nextAction = "") {
  return {
    name,
    status,
    severity,
    message,
    nextAction,
    evidenceCommand: checkEvidenceCommand(name),
    doneWhen: checkDoneWhen(name),
  };
}

function metadataReviewItems(generatedBy, siteName) {
  return [
    isPlaceholderFieldText(generatedBy) ? "Generated-by reviewer metadata is missing or placeholder." : "",
    isPlaceholderFieldText(siteName) ? "Site name metadata is missing or placeholder." : "",
  ].filter(Boolean);
}

function isPlaceholderFieldValue(value) {
  const normalized = String(value || "").trim();
  return /^(?:-|n\/a|na|none|null|tbd|todo|pending|unknown|example|change-me|changeme)$/i.test(normalized) || /^change-this-/i.test(normalized);
}

function valueState(value, placeholder = "") {
  if (!value) return "missing";
  if ((placeholder && value === placeholder) || isPlaceholderFieldValue(value)) return "placeholder";
  return "configured";
}

function fieldStringState(value) {
  return valueState(value);
}

function listValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsOriginState(value) {
  const origins = listValue(value);
  if (origins.length === 0) return "missing";
  if (origins.some((origin) => ["*", "all"].includes(origin.toLowerCase()))) return "open-or-wildcard";
  return "trusted-only";
}

function numericState(value, options = {}) {
  if (!value) return "missing";
  if (!/^\d+$/.test(String(value))) return "invalid";
  const numericValue = Number(value);
  const minimum = options.minimum ?? 1;
  if (numericValue < minimum) return "invalid";
  return "configured";
}

function buildRequiredFieldValue(name, state, requiredForPass, completionGate, nextAction, redacted = true) {
  return {
    name,
    state,
    requiredForPass,
    completionGate,
    nextAction,
    redacted,
  };
}

function fieldValueOwner(name) {
  if (["JWT_SECRET", "SEED_ADMIN_PASSWORD", "AUTH_COOKIE_SECURE", "AUTH_COOKIE_SAMESITE"].includes(name)) return "Auth/Security";
  if (["CORS_ORIGINS"].includes(name)) return "Auth/Security";
  if (["DEVICE_INGEST_API_KEY"].includes(name)) return "LiDAR Ingest";
  if (name.startsWith("CONTROL_BOARD_")) return "Control-board TCP";
  if (name.startsWith("NGINX_")) return "Nginx Delivery";
  return "Field Operations";
}

function fieldValuePriority(item) {
  const state = String(item.state || "");
  if (["missing", "placeholder", "not-approved"].includes(state)) return "BLOCKING";
  if (state.includes("exception") || state === "open-or-missing" || state === "open-or-wildcard") return "REVIEW";
  if (state === "true" || state === "configured" || state === "approved" || state === "restricted" || state === "trusted-only") return "READY";
  return "REVIEW";
}

function buildEnvActionGroups(requiredFieldValues) {
  const groups = requiredFieldValues.reduce((acc, item) => {
    const owner = fieldValueOwner(item.name);
    if (!acc[owner]) {
      acc[owner] = {
        owner,
        blockingCount: 0,
        reviewCount: 0,
        readyCount: 0,
        items: [],
      };
    }
    const priority = fieldValuePriority(item);
    if (priority === "BLOCKING") acc[owner].blockingCount += 1;
    else if (priority === "READY") acc[owner].readyCount += 1;
    else acc[owner].reviewCount += 1;
    acc[owner].items.push({
      name: item.name,
      state: item.state,
      priority,
      redacted: item.redacted,
      completionGate: item.completionGate,
      nextAction: item.nextAction,
    });
    return acc;
  }, {});

  return Object.values(groups).map((group) => ({
    ...group,
    status: group.blockingCount > 0 ? "BLOCKING" : group.reviewCount > 0 ? "REVIEW" : "READY",
    nextAction:
      group.blockingCount > 0
        ? "Fill or approve the blocking field values before strict field acceptance."
        : group.reviewCount > 0
          ? "Resolve review values directly or attach accepted field-risk evidence."
          : "No open field value action remains for this owner.",
  }));
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
  checks.push(buildCheck("seed admin password", valueState(adminPassword) === "configured" && adminPassword !== "admin1234!" ? "PASS" : "REVIEW", "critical", adminPassword ? "SEED_ADMIN_PASSWORD is present without exposing the value." : "SEED_ADMIN_PASSWORD is missing.", "Set a non-example seed admin password before field acceptance."));

  const deviceKey = envValue(values, "DEVICE_INGEST_API_KEY");
  const deviceKeyState = fieldStringState(deviceKey);
  checks.push(buildCheck("device ingest key", deviceKeyState === "configured" ? "PASS" : "REVIEW", "warning", deviceKeyState === "configured" ? "DEVICE_INGEST_API_KEY is configured and redacted." : "DEVICE_INGEST_API_KEY is not configured or is placeholder.", "Configure the device key or document the trusted-LAN exception."));

  const dryRun = envValue(values, "CONTROL_BOARD_DRY_RUN").toLowerCase();
  const liveApproved = envValue(values, "CONTROL_BOARD_LIVE_APPROVED").toLowerCase() === "true";
  const host = envValue(values, "CONTROL_BOARD_HOST");
  const port = envValue(values, "CONTROL_BOARD_PORT");
  const connectTimeout = envValue(values, "CONTROL_BOARD_CONNECT_TIMEOUT_MS");
  const responseTimeout = envValue(values, "CONTROL_BOARD_RESPONSE_TIMEOUT_MS");
  const retryCount = envValue(values, "CONTROL_BOARD_RETRY_COUNT");
  const heartbeatInterval = envValue(values, "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS");
  const connectTimeoutState = numericState(connectTimeout);
  const responseTimeoutState = numericState(responseTimeout);
  const retryCountState = numericState(retryCount, { minimum: 0 });
  const heartbeatIntervalState = numericState(heartbeatInterval);
  const hostState = fieldStringState(host);
  const portState = numericState(port);
  const tcpTimingReady = [connectTimeoutState, responseTimeoutState, retryCountState, heartbeatIntervalState].every((state) => state === "configured");
  const liveReady = dryRun === "false" && liveApproved && hostState === "configured" && portState === "configured" && tcpTimingReady;
  const safetyStatus = dryRun === "false" ? (liveReady ? "LIVE_TCP_READY" : "LIVE_TCP_REVIEW") : "DRY_RUN_SAFE";
  checks.push(buildCheck("control-board TCP mode", liveReady ? "PASS" : "REVIEW", "critical", `${safetyStatus}: ${liveReady ? "LIVE_TCP host, port, approval, and timing values are configured." : "Control-board is dry-run or live TCP host, port, approval, or timing values are incomplete."}`, "Set CONTROL_BOARD_DRY_RUN=false only after field IP/port, timing values, and hardware approval are confirmed."));
  checks.push(buildCheck("control-board live approval", liveApproved ? "PASS" : "REVIEW", "critical", liveApproved ? "CONTROL_BOARD_LIVE_APPROVED=true." : "CONTROL_BOARD_LIVE_APPROVED is not true.", "Set CONTROL_BOARD_LIVE_APPROVED=true only after hardware owner approval is recorded."));
  checks.push(buildCheck("control-board TCP timing", tcpTimingReady ? "PASS" : "REVIEW", "warning", tcpTimingReady ? "Control-board TCP timing values are numeric and configured." : "Control-board TCP timing values are missing or invalid.", "Set CONTROL_BOARD_CONNECT_TIMEOUT_MS, CONTROL_BOARD_RESPONSE_TIMEOUT_MS, CONTROL_BOARD_RETRY_COUNT, and CONTROL_BOARD_HEARTBEAT_INTERVAL_MS for the field board."));

  const secureCookie = envValue(values, "AUTH_COOKIE_SECURE").toLowerCase();
  const sameSiteCookie = envValue(values, "AUTH_COOKIE_SAMESITE").toLowerCase();
  const corsOrigins = envValue(values, "CORS_ORIGINS");
  const swaggerAllow = envValue(values, "NGINX_SWAGGER_ALLOW");
  const wrongwayRateLimit = envValue(values, "NGINX_WRONGWAY_RATE_LIMIT");
  const wrongwayBurst = envValue(values, "NGINX_WRONGWAY_BURST");
  const contentSecurityPolicy = envValue(values, "NGINX_CONTENT_SECURITY_POLICY");
  const wrongwayRateLimitState = fieldStringState(wrongwayRateLimit);
  const wrongwayBurstState = fieldStringState(wrongwayBurst);
  const contentSecurityPolicyState = fieldStringState(contentSecurityPolicy);
  const swaggerAllowState = isPlaceholderFieldValue(swaggerAllow)
    ? "placeholder"
    : swaggerAllow && swaggerAllow !== "all"
      ? "restricted"
      : "open-or-missing";
  checks.push(buildCheck("HTTPS cookie setting", secureCookie === "true" ? "PASS" : "REVIEW", "warning", secureCookie === "true" ? "AUTH_COOKIE_SECURE=true." : "AUTH_COOKIE_SECURE is not true.", "Set AUTH_COOKIE_SECURE=true when HTTPS/TLS is used."));
  checks.push(buildCheck("SameSite cookie setting", ["lax", "strict", "none"].includes(sameSiteCookie) ? "PASS" : "REVIEW", "warning", sameSiteCookie ? "AUTH_COOKIE_SAMESITE is configured." : "AUTH_COOKIE_SAMESITE is missing.", "Set AUTH_COOKIE_SAMESITE to lax, strict, or none according to the delivery topology."));
  const corsState = corsOriginState(corsOrigins);
  checks.push(buildCheck("CORS trusted origins", corsState === "trusted-only" ? "PASS" : "REVIEW", "warning", corsState === "trusted-only" ? "CORS_ORIGINS contains explicit origins only." : "CORS_ORIGINS is missing, wildcard, or open.", "Set CORS_ORIGINS to the approved operator UI origin list before delivery."));
  checks.push(buildCheck("Swagger allowlist", swaggerAllowState === "restricted" ? "PASS" : "REVIEW", "warning", swaggerAllowState === "restricted" ? "NGINX_SWAGGER_ALLOW is restricted." : "NGINX_SWAGGER_ALLOW is open, missing, or placeholder.", "Restrict Swagger to the operator/internal network before delivery."));
  checks.push(buildCheck("Nginx wrong-way rate limit", wrongwayRateLimitState === "configured" && wrongwayBurstState === "configured" ? "PASS" : "REVIEW", "warning", wrongwayRateLimitState === "configured" && wrongwayBurstState === "configured" ? "Nginx wrong-way rate limit and burst are configured." : "Nginx wrong-way rate limit or burst is missing or placeholder.", "Set NGINX_WRONGWAY_RATE_LIMIT and NGINX_WRONGWAY_BURST for the expected lidar event rate."));
  checks.push(buildCheck("Nginx content security policy", contentSecurityPolicyState === "configured" ? "PASS" : "REVIEW", "warning", contentSecurityPolicyState === "configured" ? "NGINX_CONTENT_SECURITY_POLICY is configured." : "NGINX_CONTENT_SECURITY_POLICY is missing or placeholder.", "Review and set NGINX_CONTENT_SECURITY_POLICY for final camera/lidar/media hosts."));

  const exampleKeys = Object.keys(example.values);
  const missingExampleKeys = local.exists ? exampleKeys.filter((key) => !(key in values)) : exampleKeys;
  const requiredFieldValues = [
    buildRequiredFieldValue(
      "JWT_SECRET",
      valueState(jwtSecret, "change-this-to-a-long-random-secret"),
      "Set a unique long random value before delivery.",
      "Blocks authentication/security acceptance while missing or placeholder.",
      "Generate and store a field-only JWT_SECRET in .env.",
    ),
    buildRequiredFieldValue(
      "SEED_ADMIN_PASSWORD",
      valueState(adminPassword, "admin1234!"),
      "Set a non-example seed admin password before DB seed or field acceptance.",
      "Blocks field readiness while missing or example value.",
      "Update SEED_ADMIN_PASSWORD in .env and re-run the seed only against the intended field DB.",
    ),
    buildRequiredFieldValue(
      "DEVICE_INGEST_API_KEY",
      deviceKeyState === "missing" ? "missing-or-trusted-lan-exception-required" : deviceKeyState,
      "Configure the device key, or document the trusted-LAN exception for the lidar PC/bridge.",
      "Blocks ingest hardening evidence unless an explicit exception is accepted.",
      "Set DEVICE_INGEST_API_KEY and configure the lidar sender to use X-Device-Key, or attach the exception note.",
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_HOST",
      hostState,
      "Set the integrated control-board TCP host before approved live TCP rehearsal.",
      "Blocks live control-board TCP evidence.",
      "Fill CONTROL_BOARD_HOST after the hardware owner confirms the field IP.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_LIVE_APPROVED",
      liveApproved ? "approved" : "not-approved",
      "Record hardware owner approval before approved live TCP rehearsal.",
      "Blocks final live TCP completion while not approved.",
      "Set CONTROL_BOARD_LIVE_APPROVED=true only after hardware owner approval is recorded.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_PORT",
      portState,
      "Set the integrated control-board TCP port before approved live TCP rehearsal.",
      "Blocks live control-board TCP evidence.",
      "Fill CONTROL_BOARD_PORT after the hardware owner confirms the field port.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_DRY_RUN",
      dryRun || "missing",
      "Keep true before approval; set false only for approved live TCP rehearsal.",
      "Blocks final live TCP completion while true, but protects hardware before approval.",
      "Use CONTROL_BOARD_DRY_RUN=false only with field IP/port and hardware approval.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_CONNECT_TIMEOUT_MS",
      connectTimeoutState,
      "Set a positive TCP connect timeout before approved live TCP rehearsal.",
      "Blocks live TCP timing acceptance when missing or invalid.",
      "Confirm the field board/network connect timeout and set CONTROL_BOARD_CONNECT_TIMEOUT_MS.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_RESPONSE_TIMEOUT_MS",
      responseTimeoutState,
      "Set a positive TCP response timeout before approved live TCP rehearsal.",
      "Blocks live TCP ACK evidence when missing or invalid.",
      "Confirm the field board ACK response timeout and set CONTROL_BOARD_RESPONSE_TIMEOUT_MS.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_RETRY_COUNT",
      retryCountState,
      "Set a non-negative retry count before approved live TCP rehearsal.",
      "Blocks live TCP retry policy acceptance when missing or invalid.",
      "Confirm the field retry policy and set CONTROL_BOARD_RETRY_COUNT.",
      false,
    ),
    buildRequiredFieldValue(
      "CONTROL_BOARD_HEARTBEAT_INTERVAL_MS",
      heartbeatIntervalState,
      "Set a positive heartbeat interval before approved live TCP rehearsal.",
      "Blocks live TCP heartbeat acceptance when missing or invalid.",
      "Confirm the field heartbeat policy and set CONTROL_BOARD_HEARTBEAT_INTERVAL_MS.",
      false,
    ),
    buildRequiredFieldValue(
      "AUTH_COOKIE_SECURE",
      secureCookie || "missing",
      "Set true when HTTPS/TLS is used through the delivery proxy.",
      "Blocks HTTPS cookie delivery posture when false or missing.",
      "Set AUTH_COOKIE_SECURE=true for the TLS delivery topology.",
      false,
    ),
    buildRequiredFieldValue(
      "AUTH_COOKIE_SAMESITE",
      sameSiteCookie || "missing",
      "Set lax/strict for same-site delivery, or none only for cross-site HTTPS delivery.",
      "Blocks cookie topology acceptance when missing or invalid.",
      "Set AUTH_COOKIE_SAMESITE to lax, strict, or none according to the delivery topology.",
      false,
    ),
    buildRequiredFieldValue(
      "CORS_ORIGINS",
      corsState,
      "Set the approved operator UI origins for the delivery topology.",
      "Blocks browser/API exposure review when missing, wildcard, or open.",
      "Set CORS_ORIGINS to explicit delivery UI origins only.",
      false,
    ),
    buildRequiredFieldValue(
      "NGINX_WRONGWAY_RATE_LIMIT",
      wrongwayRateLimitState,
      "Set the wrong-way ingest rate limit for the expected lidar sender rate.",
      "Blocks Nginx delivery posture review when missing.",
      "Set NGINX_WRONGWAY_RATE_LIMIT after confirming the lidar PC event rate.",
      false,
    ),
    buildRequiredFieldValue(
      "NGINX_WRONGWAY_BURST",
      wrongwayBurstState,
      "Set the wrong-way ingest burst for the expected lidar sender burst profile.",
      "Blocks Nginx delivery posture review when missing.",
      "Set NGINX_WRONGWAY_BURST after confirming the lidar PC burst profile.",
      false,
    ),
    buildRequiredFieldValue(
      "NGINX_CONTENT_SECURITY_POLICY",
      contentSecurityPolicyState,
      "Review CSP for the final camera/lidar/media host topology.",
      "Blocks Nginx security posture review when missing.",
      "Set NGINX_CONTENT_SECURITY_POLICY after reviewing final media hosts.",
      false,
    ),
    buildRequiredFieldValue(
      "NGINX_SWAGGER_ALLOW",
      swaggerAllowState,
      "Restrict Swagger to the operator/internal network CIDR before delivery.",
      "Blocks Swagger exposure acceptance when open, missing, or placeholder.",
      "Set NGINX_SWAGGER_ALLOW to the approved operator/internal CIDR.",
      false,
    ),
  ];
  return {
    exists: local.exists,
    exampleExists: example.exists,
    presentKeyCount: Object.keys(values).length,
    exampleKeyCount: exampleKeys.length,
    missingExampleKeys,
    requiredFieldValues,
    envActionGroups: buildEnvActionGroups(requiredFieldValues),
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
  const metadataReview = metadataReviewItems(options.generatedBy, options.siteName);
  const checks = [
    ...metadataReview.map((message) =>
      buildCheck(
        "field readiness metadata",
        "REVIEW",
        "critical",
        message,
        "Rerun npm.cmd run field:readiness with concrete --generated-by=<field-reviewer> and --site-name=<delivery-site> values.",
      ),
    ),
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
    git: buildGitState(),
    status: reviewCount > 0 ? "REVIEW" : skippedCount > 0 ? "PASS_WITH_SKIPS" : "PASS",
    reviewCount,
    skippedCount,
    metadataReview,
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
    `- Metadata review: ${manifest.metadataReview?.length || 0}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Generated at: ${manifest.generatedAt}`,
    `- Generated by: ${manifest.generatedBy}`,
    `- Site name: ${manifest.siteName}`,
    `- Host name: ${manifest.hostName}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    "",
    "## Checks",
    "",
    "| Status | Severity | Check | Message | Next Action | Evidence Command | Done When |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...manifest.checks.map((check) => `| ${check.status} | ${check.severity} | ${tableValue(check.name)} | ${tableValue(check.message)} | ${tableValue(check.nextAction)} | ${tableValue(check.evidenceCommand)} | ${tableValue(check.doneWhen)} |`),
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
    "## Field Value Action Groups",
    "",
    "| Owner | Status | Blocking | Review | Ready | Next Action |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.env.envActionGroups.map((group) => `| ${tableValue(group.owner)} | ${group.status} | ${group.blockingCount} | ${group.reviewCount} | ${group.readyCount} | ${tableValue(group.nextAction)} |`),
    "",
    "## Field Value Action Items",
    "",
    "| Owner | Priority | Name | State | Completion Gate | Next Action | Redacted |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...manifest.env.envActionGroups.flatMap((group) =>
      group.items.map((item) => `| ${tableValue(group.owner)} | ${item.priority} | ${tableValue(item.name)} | ${tableValue(item.state)} | ${tableValue(item.completionGate)} | ${tableValue(item.nextAction)} | ${item.redacted} |`),
    ),
    "",
    "## Required Field Values",
    "",
    "| Name | State | Required For Pass | Completion Gate | Next Action | Redacted |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.env.requiredFieldValues.map((item) => `| ${tableValue(item.name)} | ${tableValue(item.state)} | ${tableValue(item.requiredForPass)} | ${tableValue(item.completionGate)} | ${tableValue(item.nextAction)} | ${item.redacted} |`),
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

module.exports = {
  buildManifest,
  buildMarkdown,
  corsOriginState,
  fieldStringState,
  fieldValuePriority,
  isPlaceholderFieldValue,
  metadataReviewItems,
  numericState,
  valueState,
};
