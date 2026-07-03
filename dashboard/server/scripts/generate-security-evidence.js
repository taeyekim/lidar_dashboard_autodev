const fs = require("fs");
const os = require("os");
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

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform !== "win32",
  });
  return result.status === 0;
}

function firstMeaningfulLine(text) {
  return (
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || ""
  );
}

function commandVersion(command, args) {
  if (!commandExists(command)) {
    return {
      command,
      available: false,
      versionCommand: [command, ...args].join(" "),
      version: null,
      exitCode: null,
      error: "command is not installed",
    };
  }

  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  return {
    command,
    available: true,
    versionCommand: [command, ...args].join(" "),
    version: firstMeaningfulLine(result.stdout) || firstMeaningfulLine(result.stderr) || "version output unavailable",
    exitCode: result.status ?? (result.error ? 1 : 0),
    error: result.error?.message || null,
  };
}

function buildToolInventory() {
  return [
    commandVersion("gitleaks", ["version"]),
    commandVersion("trivy", ["--version"]),
    commandVersion("zap-baseline.py", ["-h"]),
  ];
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

function statusLabel(item) {
  if (item.status === "skipped") return "SKIPPED";
  return item.exitCode === 0 ? "PASS" : "REVIEW";
}

function buildMarkdown(manifest) {
  const lines = [
    "# Security Evidence Manifest",
    "",
    `- Generated at: ${manifest.generatedAt}`,
    `- Operator: ${manifest.operator}`,
    `- Hostname: ${manifest.hostname}`,
    `- Platform: ${manifest.platform}`,
    `- Target URL: ${manifest.targetUrl}`,
    `- Include container images: ${manifest.options.includeContainerImages ? "yes" : "no"}`,
    `- Include ZAP baseline: ${manifest.options.includeZap ? "yes" : "no"}`,
    "",
    "## Tool Inventory",
    "",
    "| Tool | Available | Version Command | Version Or Reason |",
    "| --- | --- | --- | --- |",
  ];

  manifest.toolInventory.forEach((item) => {
    lines.push(
      `| ${item.command} | ${item.available ? "yes" : "no"} | \`${item.versionCommand}\` | ${item.available ? item.version : item.error} |`,
    );
  });

  lines.push(
    "",
    "## Checks",
    "",
    "| Status | Check | Command Or Reason | Log |",
    "| --- | --- | --- | --- |",
  );

  manifest.checks.forEach((item) => {
    const commandOrReason = item.status === "skipped" ? item.reason : `\`${item.command}\``;
    const log = item.logFile ? `\`${item.logFile}\`` : "";
    lines.push(`| ${statusLabel(item)} | ${item.label} | ${commandOrReason} | ${log} |`);
  });

  lines.push(
    "",
    "## Notes",
    "",
    "- `npm audit raw json` is captured as evidence and may report the documented Prisma development-tooling exception.",
    "- `npm audit policy gate` is the required automated pass/fail gate for dependency audit findings.",
    "- Optional tools are recorded as `SKIPPED` when not installed or when image/ZAP switches are not provided.",
    "- Do not run active scans against the real integrated control board.",
    "",
  );

  return lines.join("\n");
}

function skipped(label, reason) {
  return {
    label,
    status: "skipped",
    reason,
    exitCode: null,
    command: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    logFile: null,
  };
}

function main() {
  const includeContainerImages = process.argv.includes("--include-container-images");
  const includeZap = process.argv.includes("--include-zap");
  const targetUrlArg = process.argv.find((arg) => arg.startsWith("--target-url="));
  const outputRootArg = process.argv.find((arg) => arg.startsWith("--output-root="));
  const targetUrl = targetUrlArg ? targetUrlArg.slice("--target-url=".length) : "http://localhost:8080";
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/security";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const toolInventory = buildToolInventory();

  const checks = [
    runCommand("npm audit raw json", npmCommand, ["audit", "--workspaces", "--json"]),
    runCommand("npm audit policy gate", npmCommand, ["run", "verify:audit-policy"]),
  ];

  if (commandExists("gitleaks")) {
    checks.push(
      runCommand("gitleaks secret scan", "gitleaks", [
        "detect",
        "--source",
        ".",
        "--redact",
        "--report-format",
        "json",
        "--report-path",
        path.join(outputDir, "gitleaks.json"),
      ]),
    );
  } else {
    checks.push(skipped("gitleaks secret scan", "gitleaks command is not installed on this PC"));
  }

  if (commandExists("trivy")) {
    checks.push(
      runCommand("trivy filesystem scan", "trivy", [
        "fs",
        "--scanners",
        "vuln,secret,misconfig",
        "--format",
        "json",
        "--output",
        path.join(outputDir, "trivy-fs.json"),
        ".",
      ]),
    );

    if (includeContainerImages) {
      checks.push(
        runCommand("trivy backend image scan", "trivy", [
          "image",
          "--format",
          "json",
          "--output",
          path.join(outputDir, "trivy-backend-image.json"),
          "lidar_dashboard_autodev-backend",
        ]),
      );
      checks.push(
        runCommand("trivy frontend image scan", "trivy", [
          "image",
          "--format",
          "json",
          "--output",
          path.join(outputDir, "trivy-frontend-image.json"),
          "lidar_dashboard_autodev-frontend",
        ]),
      );
    } else {
      checks.push(skipped("trivy image scan", "Run with --include-container-images after Docker images are built"));
    }
  } else {
    checks.push(skipped("trivy filesystem scan", "trivy command is not installed on this PC"));
    checks.push(skipped("trivy image scan", "trivy command is not installed on this PC"));
  }

  if (includeZap) {
    if (commandExists("zap-baseline.py")) {
      checks.push(
        runCommand("OWASP ZAP baseline", "zap-baseline.py", [
          "-t",
          targetUrl,
          "-r",
          path.join(outputDir, "zap-baseline.html"),
        ]),
      );
    } else {
      checks.push(skipped("OWASP ZAP baseline", "zap-baseline.py command is not installed on this PC"));
    }
  } else {
    checks.push(skipped("OWASP ZAP baseline", "Run with --include-zap against the delivery Nginx entrypoint"));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    operator: process.env.SECURITY_EVIDENCE_OPERATOR || process.env.USERNAME || process.env.USER || "unknown",
    hostname: os.hostname(),
    platform: `${process.platform} ${process.arch}`,
    targetUrl,
    options: {
      includeContainerImages,
      includeZap,
    },
    toolInventory,
    checks: checks.map((item) => {
      const logFile = item.status === "skipped" ? null : writeCommandLog(outputDir, item);
      return {
        label: item.label,
        status: item.status || "executed",
        command: item.command,
        reason: item.reason || null,
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

  const requiredFailures = manifest.checks.filter(
    (item) => item.status !== "skipped" && item.label === "npm audit policy gate" && item.exitCode !== 0,
  );

  console.log(`security evidence written to ${path.relative(root, outputDir)}`);
  if (requiredFailures.length > 0) {
    console.error("security evidence captured required gate failures");
    process.exit(1);
  }
}

main();
