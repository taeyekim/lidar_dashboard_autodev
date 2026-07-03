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

const scannerCloseoutDefinitions = [
  {
    scanner: "gitleaks",
    checks: ["gitleaks secret scan"],
    requiredSwitch: "--require-scanners",
    evidenceFiles: ["gitleaks.json", "gitleaks-secret-scan.log"],
    installHint: "Install gitleaks and run `gitleaks detect --source . --redact`.",
    closeoutWhenSkipped: "Install gitleaks or document reviewer risk acceptance in artifacts/manual/field-risk-acceptance.md.",
  },
  {
    scanner: "Trivy filesystem",
    checks: ["trivy filesystem scan"],
    requiredSwitch: "--require-scanners",
    evidenceFiles: ["trivy-fs.json", "trivy-filesystem-scan.log"],
    installHint: "Install Trivy and run `trivy fs --scanners vuln,secret,misconfig .`.",
    closeoutWhenSkipped: "Install Trivy or document reviewer risk acceptance in artifacts/manual/field-risk-acceptance.md.",
  },
  {
    scanner: "Trivy images",
    checks: ["trivy image scan", "trivy backend image scan", "trivy frontend image scan"],
    requiredSwitch: "--include-container-images --require-scanners",
    evidenceFiles: ["trivy-backend-image.json", "trivy-frontend-image.json"],
    installHint: "Build delivery images, install Trivy, and rerun with `--include-container-images`.",
    closeoutWhenSkipped:
      "Build the delivery images and rerun image scans, or document why image scanning is unavailable for this handover.",
  },
  {
    scanner: "OWASP ZAP baseline",
    checks: ["OWASP ZAP baseline"],
    requiredSwitch: "--include-zap --require-scanners --target-url=<nginx-url>",
    evidenceFiles: ["zap-baseline.html", "owasp-zap-baseline.log"],
    installHint: "Install OWASP ZAP baseline tooling and run against the Nginx entrypoint only.",
    closeoutWhenSkipped:
      "Run the baseline against the delivery Nginx URL, or document reviewer risk acceptance before field closeout.",
  },
];

function buildScannerCloseout(checks) {
  return scannerCloseoutDefinitions.map((definition) => {
    const relatedChecks = checks.filter((item) => definition.checks.includes(item.label));
    const blocking = relatedChecks.some((item) => item.disposition.blocksStrictAcceptance);
    const skipped = relatedChecks.some((item) => item.status === "skipped");
    const failed = relatedChecks.some((item) => ["BLOCKING", "DELIVERY_FIX"].includes(item.disposition.code));
    const passed = relatedChecks.length > 0 && relatedChecks.every((item) => item.disposition.code === "PASS");
    const riskAccepted = relatedChecks.length > 0 && relatedChecks.every((item) => item.disposition.code === "RISK_ACCEPTED");
    const unverified = relatedChecks.some((item) => item.disposition.code === "UNVERIFIED");

    let closeoutStatus = "PENDING";
    if (passed) closeoutStatus = "EVIDENCE_READY";
    else if (riskAccepted) closeoutStatus = "RISK_ACCEPTED";
    else if (blocking || failed) closeoutStatus = "BLOCKING";
    else if (unverified || skipped) closeoutStatus = "UNVERIFIED";

    return {
      scanner: definition.scanner,
      requiredSwitch: definition.requiredSwitch,
      relatedChecks: relatedChecks.map((item) => item.label),
      dispositions: relatedChecks.map((item) => item.disposition.code),
      closeoutStatus,
      blocksStrictAcceptance: blocking,
      evidenceFiles: definition.evidenceFiles,
      installHint: definition.installHint,
      closeoutWhenSkipped: definition.closeoutWhenSkipped,
    };
  });
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
  if (item.status === "policy_accepted") return "ACCEPTED";
  return item.exitCode === 0 ? "PASS" : "REVIEW";
}

function securityDisposition(item, requireScanners) {
  if (item.status === "policy_accepted") {
    return {
      code: "RISK_ACCEPTED",
      labelKo: "위험 수용",
      labelEn: "Risk accepted",
      reason: item.reason || "Finding is accepted by the documented audit policy.",
      blocksStrictAcceptance: false,
    };
  }
  if (requiredScannerFailure(item, requireScanners)) {
    return {
      code: "BLOCKING",
      labelKo: "차단",
      labelEn: "Blocking",
      reason: `${item.label} is required for strict security acceptance but was skipped.`,
      blocksStrictAcceptance: true,
    };
  }
  if (item.status === "skipped") {
    return {
      code: "UNVERIFIED",
      labelKo: "미검증",
      labelEn: "Unverified",
      reason: item.reason || "Security check was not executed.",
      blocksStrictAcceptance: false,
    };
  }
  if (item.exitCode === 0) {
    return {
      code: "PASS",
      labelKo: "통과",
      labelEn: "Pass",
      reason: "Command completed successfully.",
      blocksStrictAcceptance: false,
    };
  }
  return {
    code: item.label === "npm audit policy gate" ? "BLOCKING" : "DELIVERY_FIX",
    labelKo: item.label === "npm audit policy gate" ? "차단" : "납품 전 수정",
    labelEn: item.label === "npm audit policy gate" ? "Blocking" : "Delivery fix required",
    reason: item.error || `${item.label} exited with code ${item.exitCode}.`,
    blocksStrictAcceptance: item.label === "npm audit policy gate",
  };
}

function summarizeDispositions(checks) {
  const counts = {
    pass: 0,
    blocking: 0,
    deliveryFix: 0,
    riskAccepted: 0,
    unverified: 0,
  };
  checks.forEach((item) => {
    if (item.disposition.code === "PASS") counts.pass += 1;
    if (item.disposition.code === "BLOCKING") counts.blocking += 1;
    if (item.disposition.code === "DELIVERY_FIX") counts.deliveryFix += 1;
    if (item.disposition.code === "RISK_ACCEPTED") counts.riskAccepted += 1;
    if (item.disposition.code === "UNVERIFIED") counts.unverified += 1;
  });
  return counts;
}

function tableValue(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
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
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Git upstream: ${manifest.git.upstream || "missing"}`,
    `- Git upstream commit: ${manifest.git.upstreamCommit || "missing"}`,
    `- Git pushed to origin/dev: ${manifest.git.pushed ? "yes" : "no"}`,
    `- Working tree clean: ${manifest.git.clean ? "yes" : "no"}`,
    `- Include container images: ${manifest.options.includeContainerImages ? "yes" : "no"}`,
    `- Include ZAP baseline: ${manifest.options.includeZap ? "yes" : "no"}`,
    `- Require scanners: ${manifest.options.requireScanners ? "yes" : "no"}`,
    `- Strict acceptance blocked: ${manifest.strictAcceptanceBlocked ? "yes" : "no"}`,
    "",
    "## Security Disposition Summary",
    "",
    `- Pass: ${manifest.dispositionSummary.pass}`,
    `- Blocking: ${manifest.dispositionSummary.blocking}`,
    `- Delivery fix: ${manifest.dispositionSummary.deliveryFix}`,
    `- Risk accepted: ${manifest.dispositionSummary.riskAccepted}`,
    `- Unverified: ${manifest.dispositionSummary.unverified}`,
    "",
    "## Tool Inventory",
    "",
    "| Tool | Available | Version Command | Version Or Reason |",
    "| --- | --- | --- | --- |",
  ];

  manifest.toolInventory.forEach((item) => {
    lines.push(
      `| ${tableValue(item.command)} | ${item.available ? "yes" : "no"} | \`${tableValue(item.versionCommand)}\` | ${tableValue(item.available ? item.version : item.error)} |`,
    );
  });

  lines.push(
    "",
    "## Scanner Closeout Matrix",
    "",
    "| Scanner | Status | Required Switch | Related Checks | Evidence Files | Install Hint | Closeout If Skipped |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );

  manifest.scannerCloseout.forEach((item) => {
    lines.push(
      `| ${tableValue(item.scanner)} | ${tableValue(item.closeoutStatus)} | \`${tableValue(item.requiredSwitch)}\` | ${tableValue(item.relatedChecks.join(", ") || "none")} | ${tableValue(item.evidenceFiles.join(", "))} | ${tableValue(item.installHint)} | ${tableValue(item.closeoutWhenSkipped)} |`,
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
    lines.push(`| ${statusLabel(item)} | ${tableValue(item.label)} | ${tableValue(commandOrReason)} | ${log} |`);
  });

  lines.push(
    "",
    "## Acceptance Classification",
    "",
    "| Classification | Korean Label | English Label | Check | Blocks Strict Acceptance | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  manifest.checks.forEach((item) => {
    lines.push(
      `| ${item.disposition.code} | ${item.disposition.labelKo} | ${item.disposition.labelEn} | ${tableValue(item.label)} | ${item.disposition.blocksStrictAcceptance ? "yes" : "no"} | ${tableValue(item.disposition.reason)} |`,
    );
  });

  lines.push(
    "",
    "## Notes",
    "",
    "- `npm audit raw json` is captured as evidence and may report the documented Prisma development-tooling exception.",
    "- `npm audit policy gate` is the required automated pass/fail gate for dependency audit findings.",
    "- Optional tools are recorded as `SKIPPED` when not installed or when image/ZAP switches are not provided.",
    "- Acceptance classification maps results to PASS, BLOCKING, DELIVERY_FIX, RISK_ACCEPTED, or UNVERIFIED for delivery review.",
    "- Scanner closeout rows list the required switch, expected evidence files, install hint, and risk-acceptance path.",
    "- `--require-scanners` treats skipped gitleaks, Trivy, and OWASP ZAP checks as required BLOCKING failures for field acceptance.",
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

function requiredScannerFailure(item, requireScanners) {
  if (!requireScanners || item.status !== "skipped") return false;
  return ["gitleaks secret scan", "trivy filesystem scan", "trivy image scan", "OWASP ZAP baseline"].includes(item.label);
}

function main() {
  const includeContainerImages = process.argv.includes("--include-container-images");
  const includeZap = process.argv.includes("--include-zap");
  const requireScanners = process.argv.includes("--require-scanners");
  const targetUrlArg = process.argv.find((arg) => arg.startsWith("--target-url="));
  const outputRootArg = process.argv.find((arg) => arg.startsWith("--output-root="));
  const targetUrl = targetUrlArg ? targetUrlArg.slice("--target-url=".length) : "http://localhost:8080";
  const outputRoot = outputRootArg ? outputRootArg.slice("--output-root=".length) : "artifacts/security";
  const outputDir = path.join(root, outputRoot, timestampForPath());
  ensureDir(outputDir);
  const toolInventory = buildToolInventory();

  const auditRaw = runCommand("npm audit raw json", npmCommand, ["audit", "--workspaces", "--json"]);
  const auditPolicy = runCommand("npm audit policy gate", npmCommand, ["run", "verify:audit-policy"]);
  if (auditRaw.exitCode !== 0 && auditPolicy.exitCode === 0) {
    auditRaw.status = "policy_accepted";
    auditRaw.reason = "npm audit reported only vulnerabilities accepted by verify:audit-policy";
  }
  const checks = [auditRaw, auditPolicy];

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

  const mappedChecks = checks.map((item) => {
    const logFile = item.status === "skipped" ? null : writeCommandLog(outputDir, item);
    const check = {
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
    check.disposition = securityDisposition(check, requireScanners);
    return check;
  });

  const dispositionSummary = summarizeDispositions(mappedChecks);
  const scannerCloseout = buildScannerCloseout(mappedChecks);
  const strictAcceptanceBlocked = mappedChecks.some((item) => item.disposition.blocksStrictAcceptance);

  const manifest = {
    generatedAt: new Date().toISOString(),
    operator: process.env.SECURITY_EVIDENCE_OPERATOR || process.env.USERNAME || process.env.USER || "unknown",
    hostname: os.hostname(),
    platform: `${process.platform} ${process.arch}`,
    targetUrl,
    git: buildGitState(),
    options: {
      includeContainerImages,
      includeZap,
      requireScanners,
    },
    toolInventory,
    scannerCloseout,
    dispositionSummary,
    strictAcceptanceBlocked,
    checks: mappedChecks,
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "manifest.md"), buildMarkdown(manifest));

  const requiredFailures = manifest.checks.filter(
    (item) =>
      item.disposition?.code === "BLOCKING" ||
      item.disposition?.code === "DELIVERY_FIX" ||
      requiredScannerFailure(item, requireScanners),
  );

  console.log(`security evidence written to ${path.relative(root, outputDir)}`);
  if (requiredFailures.length > 0) {
    console.error("security evidence captured blocking or delivery-fix findings");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMarkdown,
  buildScannerCloseout,
  requiredScannerFailure,
  scannerCloseoutDefinitions,
  securityDisposition,
  skipped,
  summarizeDispositions,
};
