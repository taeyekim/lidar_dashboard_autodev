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

function readDeliveryEvidenceMatrix() {
  const matrixPath = path.join(root, "docs", "ops", "delivery-evidence-matrix.md");
  return fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, "utf8") : "";
}

function parseEvidenceMatrix(content) {
  const rows = [];
  content.split(/\r?\n/).forEach((line) => {
    if (!line.startsWith("| ")) return;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 4 || cells[0] === "Requirement Area" || cells[0] === "---") return;
    rows.push({
      area: cells[0],
      requirement: cells[1],
      automatedEvidence: cells[2],
      fieldEvidenceStillRequired: cells[3],
    });
  });
  return rows;
}

function extractBacktickTokens(value) {
  const tokens = [];
  for (const match of String(value || "").matchAll(/`([^`]+)`/g)) {
    tokens.push(match[1]);
  }
  return tokens;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildAutomatedEvidenceCoverage(rows, commands) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = packageJson.scripts || {};
  const executedCommands = commands.map((item) => item.command);
  const normalizedExecutedCommands = executedCommands.map((command) => command.replace(/^npm\.cmd\b/, "npm"));
  const smokeScript = scripts.smoke || "";
  const deliveryVerifyScript = scripts["delivery:verify"] || "";
  const ciScript = scripts.ci || "";

  return rows.flatMap((row) =>
    unique(extractBacktickTokens(row.automatedEvidence)).map((token) => {
      const normalizedToken = token.replace(/^npm\.cmd /, "npm run ");
      const directCommandIndex = normalizedExecutedCommands.findIndex((command) => command.includes(normalizedToken));
      const directCommand = directCommandIndex >= 0 ? executedCommands[directCommandIndex] : null;
      if (directCommand) {
        return {
          area: row.area,
          evidence: token,
          coverage: "DIRECT",
          coveredBy: directCommand,
        };
      }

      if (normalizedToken.startsWith("npm run verify:") && smokeScript.includes(normalizedToken)) {
        return {
          area: row.area,
          evidence: token,
          coverage: "SMOKE",
          coveredBy: "npm run smoke",
        };
      }

      if (normalizedToken === "npm run build:web" && ciScript.includes("npm run build:web")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "CI",
          coveredBy: "npm run ci",
        };
      }

      if (normalizedToken === "npm run delivery:verify" || deliveryVerifyScript.includes(normalizedToken)) {
        return {
          area: row.area,
          evidence: token,
          coverage: "DELIVERY_VERIFY",
          coveredBy: "npm run delivery:verify",
        };
      }

      if (normalizedToken.startsWith("GET ") || normalizedToken.startsWith("/api/") || normalizedToken.endsWith(".ps1")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "RUNTIME_OR_FIELD",
          coveredBy: "scripts/runtime-smoke.ps1 or field acceptance evidence",
        };
      }

      if (["npm run ci:db", "npm run db:status"].includes(normalizedToken)) {
        return {
          area: row.area,
          evidence: token,
          coverage: "DB_REQUIRED",
          coveredBy: "run when delivery PostgreSQL is available",
        };
      }

      return {
        area: row.area,
        evidence: token,
        coverage: "DOCUMENTED",
        coveredBy: "documented in delivery evidence matrix",
      };
    }),
  );
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
    "## Delivery Evidence Matrix",
    "",
    "- Source: `docs/ops/delivery-evidence-matrix.md`",
    "- Requirement areas covered:",
  );
  manifest.evidenceMatrix.requirementAreas.forEach((area) => {
    lines.push(`  - ${area}`);
  });

  lines.push(
    "",
    "## Field Verification Still Required",
    "",
    "| Requirement Area | Field Evidence |",
    "| --- | --- |",
  );
  manifest.evidenceMatrix.rows.forEach((row) => {
    lines.push(`| ${row.area} | ${row.fieldEvidenceStillRequired} |`);
  });

  lines.push(
    "",
    "## Automated Evidence Coverage",
    "",
    "| Requirement Area | Evidence | Coverage | Covered By |",
    "| --- | --- | --- | --- |",
  );
  manifest.automatedEvidenceCoverage.forEach((item) => {
    lines.push(`| ${item.area} | \`${item.evidence}\` | ${item.coverage} | ${item.coveredBy} |`);
  });

  lines.push(
    "",
    "Additional field gates:",
    "",
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
    ["server test", npmCommand, ["run", "server:test"]],
    ["frontend lint", npmCommand, ["--prefix", "dashboard/dashboard-web", "run", "lint"]],
    ["ci", npmCommand, ["run", "ci"]],
    ["audit policy", npmCommand, ["run", "verify:audit-policy"]],
    ["docker compose config", "docker", ["compose", "config", "--quiet"]],
  ].map(([label, command, args]) => runCommand(label, command, args));

  const evidenceMatrix = readDeliveryEvidenceMatrix();
  const matrixRows = parseEvidenceMatrix(evidenceMatrix);
  const requirementAreas = matrixRows.map((row) => row.area);

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
    evidenceMatrix: {
      source: "docs/ops/delivery-evidence-matrix.md",
      requirementAreas,
      rows: matrixRows,
    },
    automatedEvidenceCoverage: buildAutomatedEvidenceCoverage(matrixRows, commands),
    fieldVerificationStillRequired: matrixRows.map((row) => ({
      area: row.area,
      evidence: row.fieldEvidenceStillRequired,
    })),
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
