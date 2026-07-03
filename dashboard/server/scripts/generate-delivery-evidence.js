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

function toOutputRootArg(dir) {
  return path.relative(root, dir).replace(/\\/g, "/");
}

function readLatestJsonManifest(outputRoot) {
  const absoluteRoot = path.join(root, outputRoot);
  if (!fs.existsSync(absoluteRoot)) return null;

  const manifests = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(absoluteRoot, entry.name, "manifest.json"))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .sort()
    .reverse();

  if (manifests.length === 0) return null;
  const manifestContent = fs.readFileSync(manifests[0], "utf8").replace(/^\uFEFF/, "");
  return {
    path: path.relative(root, manifests[0]).replace(/\\/g, "/"),
    data: JSON.parse(manifestContent),
  };
}

function summarizeCompanionEvidence(type, outputRoot) {
  const manifest = readLatestJsonManifest(outputRoot);
  if (!manifest) {
    return {
      type,
      outputRoot,
      manifestPath: null,
      reviewCount: 1,
      skippedCount: 0,
      reviewItems: [`${type}: manifest not found`],
      skippedItems: [],
    };
  }

  const items = manifest.data.commands || manifest.data.checks || [];
  const reviewItems = items
    .filter((item) => item.status !== "skipped" && item.status !== "policy_accepted" && item.exitCode !== 0)
    .map((item) => `${type}: ${item.label}`);
  const skippedItems = items
    .filter((item) => item.status === "skipped")
    .map((item) => `${type}: ${item.label}`);

  return {
    type,
    outputRoot,
    manifestPath: manifest.path,
    reviewCount: reviewItems.length,
    skippedCount: skippedItems.length,
    reviewItems,
    skippedItems,
  };
}

function summarizeFieldRehearsal(type, outputRoot) {
  const manifest = readLatestJsonManifest(outputRoot);
  if (!manifest) {
    return {
      type,
      outputRoot,
      manifestPath: null,
      reviewCount: 1,
      passCount: 0,
      reviewItems: [`${type}: field rehearsal manifest not found`],
    };
  }

  const results = Array.isArray(manifest.data.results) ? manifest.data.results : [];
  const reviewItems = results
    .filter((item) => item.status !== "PASS")
    .map((item) => `${type}: ${item.name || "unnamed check"}`);

  return {
    type,
    outputRoot,
    manifestPath: manifest.path,
    reviewCount: reviewItems.length,
    passCount: results.filter((item) => item.status === "PASS").length,
    reviewItems,
  };
}

function summarizeFieldAcceptance(type, outputRoot) {
  const manifest = readLatestJsonManifest(outputRoot);
  if (!manifest) {
    return {
      type,
      outputRoot,
      manifestPath: null,
      reviewCount: 1,
      skippedCount: 0,
      passCount: 0,
      reviewItems: [`${type}: field acceptance manifest not found`],
      skippedItems: [],
    };
  }

  const steps = Array.isArray(manifest.data.steps) ? manifest.data.steps : [];
  const reviewItems = steps
    .filter((item) => item.status === "REVIEW")
    .map((item) => `${type}: ${item.name || "unnamed step"}`);
  const skippedItems = steps
    .filter((item) => item.status === "SKIPPED")
    .map((item) => `${type}: ${item.name || "unnamed step"}`);

  return {
    type,
    outputRoot,
    manifestPath: manifest.path,
    status: manifest.data.status || null,
    reviewCount: reviewItems.length,
    skippedCount: skippedItems.length,
    passCount: steps.filter((item) => item.status === "PASS").length,
    reviewItems,
    skippedItems,
  };
}

function summarizeFieldPreflight(type, outputRoot) {
  const manifest = readLatestJsonManifest(outputRoot);
  if (!manifest) {
    return {
      type,
      outputRoot,
      manifestPath: null,
      reviewCount: 1,
      skippedCount: 0,
      passCount: 0,
      reviewItems: [`${type}: field preflight manifest not found`],
      skippedItems: [],
    };
  }

  const checks = Array.isArray(manifest.data.checks) ? manifest.data.checks : [];
  const reviewItems = checks
    .filter((item) => item.status === "REVIEW")
    .map((item) => `${type}: ${item.name || "unnamed check"}`);
  const skippedItems = checks
    .filter((item) => item.status === "SKIPPED")
    .map((item) => `${type}: ${item.name || "unnamed check"}`);

  return {
    type,
    outputRoot,
    manifestPath: manifest.path,
    status: manifest.data.status || null,
    reviewCount: reviewItems.length,
    skippedCount: skippedItems.length,
    passCount: checks.filter((item) => item.status === "PASS").length,
    reviewItems,
    skippedItems,
  };
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

      if (normalizedToken === "npm run delivery:evidence") {
        return {
          area: row.area,
          evidence: token,
          coverage: "SELF",
          coveredBy: "this delivery evidence manifest",
        };
      }

      if (["npm run runtime:evidence", "npm run security:evidence"].includes(normalizedToken)) {
        const directCompanionIndex = normalizedExecutedCommands.findIndex((command) => command.includes(normalizedToken));
        const companionCommand = directCompanionIndex >= 0 ? executedCommands[directCompanionIndex] : null;
        return {
          area: row.area,
          evidence: token,
          coverage: companionCommand ? "COMPANION_EVIDENCE" : "DOCUMENTED",
          coveredBy: companionCommand || "run as companion evidence before handover",
        };
      }

      if (normalizedToken.includes("artifacts/delivery/<timestamp>/runtime/")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "COMPANION_EVIDENCE",
          coveredBy: "manifest.companionEvidence.runtime.outputRoot",
        };
      }

      if (normalizedToken.includes("artifacts/delivery/<timestamp>/security/")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "COMPANION_EVIDENCE",
          coveredBy: "manifest.companionEvidence.security.outputRoot",
        };
      }

      if (normalizedToken.includes("artifacts/field-acceptance/<timestamp>/")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "FIELD_ACCEPTANCE_EVIDENCE",
          coveredBy: "manifest.fieldAcceptanceEvidence.outputRoot",
        };
      }

      if (normalizedToken.includes("artifacts/field-preflight/<timestamp>/")) {
        return {
          area: row.area,
          evidence: token,
          coverage: "FIELD_PREFLIGHT_EVIDENCE",
          coveredBy: "manifest.fieldPreflightEvidence.outputRoot",
        };
      }

      if (normalizedToken === "scripts/security-scan.ps1") {
        return {
          area: row.area,
          evidence: token,
          coverage: "OPTIONAL_SECURITY_FIELD",
          coveredBy: "run when Windows security scan rehearsal is required",
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

function buildHandoverSummary(
  matrixRows,
  commands,
  automatedEvidenceCoverage,
  companionSummaries = [],
  fieldRehearsalSummaries = [],
  fieldAcceptanceSummaries = [],
  fieldPreflightSummaries = [],
) {
  const failedCommands = commands.filter((item) => item.exitCode !== 0);
  const companionReviewItems = companionSummaries.flatMap((item) => item.reviewItems || []);
  const companionSkippedItems = companionSummaries.flatMap((item) => item.skippedItems || []);
  const fieldRehearsalReviewItems = fieldRehearsalSummaries.flatMap((item) => item.reviewItems || []);
  const fieldAcceptanceReviewItems = fieldAcceptanceSummaries.flatMap((item) => item.reviewItems || []);
  const fieldAcceptanceSkippedItems = fieldAcceptanceSummaries.flatMap((item) => item.skippedItems || []);
  const fieldPreflightReviewItems = fieldPreflightSummaries.flatMap((item) => item.reviewItems || []);
  const fieldPreflightSkippedItems = fieldPreflightSummaries.flatMap((item) => item.skippedItems || []);
  const coverageCounts = automatedEvidenceCoverage.reduce((accumulator, item) => {
    accumulator[item.coverage] = (accumulator[item.coverage] || 0) + 1;
    return accumulator;
  }, {});
  const fieldRequiredRows = matrixRows.filter((row) => {
    const value = String(row.fieldEvidenceStillRequired || "").trim();
    return value && !["none", "n/a", "-"].includes(value.toLowerCase());
  });

  return {
    status:
      failedCommands.length === 0 &&
      companionReviewItems.length === 0 &&
      companionSkippedItems.length === 0 &&
      fieldRehearsalReviewItems.length === 0 &&
      fieldAcceptanceReviewItems.length === 0 &&
      fieldPreflightReviewItems.length === 0
        ? "AUTOMATED_CHECKS_PASS"
        : "AUTOMATED_CHECKS_REVIEW",
    failedCommandCount: failedCommands.length,
    failedCommands: failedCommands.map((item) => item.label),
    companionReviewCount: companionReviewItems.length,
    companionReviewItems,
    companionSkippedCount: companionSkippedItems.length,
    companionSkippedItems,
    fieldRehearsalReviewCount: fieldRehearsalReviewItems.length,
    fieldRehearsalReviewItems,
    fieldAcceptanceReviewCount: fieldAcceptanceReviewItems.length,
    fieldAcceptanceReviewItems,
    fieldAcceptanceSkippedCount: fieldAcceptanceSkippedItems.length,
    fieldAcceptanceSkippedItems,
    fieldPreflightReviewCount: fieldPreflightReviewItems.length,
    fieldPreflightReviewItems,
    fieldPreflightSkippedCount: fieldPreflightSkippedItems.length,
    fieldPreflightSkippedItems,
    requirementAreaCount: matrixRows.length,
    automatedEvidenceItemCount: automatedEvidenceCoverage.length,
    coverageCounts,
    fieldVerificationRequiredCount: fieldRequiredRows.length,
    fieldVerificationRequiredAreas: fieldRequiredRows.map((row) => row.area),
    notes: [
      "Automated evidence proves local contract/build/security gates only.",
      "Field verification remains required for hardware IP/port, live TCP control-board test, lidar PC payload, and delivery-network runtime smoke.",
      "Companion runtime/security evidence is summarized here so REVIEW/SKIPPED items are not hidden inside nested manifests.",
      "Field rehearsal evidence is summarized here so missing or failing field manifests remain visible in the handover.",
      "Field acceptance orchestrator evidence is summarized here so the ordered on-site acceptance pass is visible in the delivery package.",
      "Field preflight evidence is summarized here so risky environment settings are visible before runtime/hardware checks.",
    ],
  };
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
    "## Handover Summary",
    "",
    `- Status: ${manifest.handoverSummary.status}`,
    `- Failed automated commands: ${manifest.handoverSummary.failedCommandCount}`,
    `- Companion review items: ${manifest.handoverSummary.companionReviewCount}`,
    `- Companion skipped items: ${manifest.handoverSummary.companionSkippedCount}`,
    `- Field rehearsal review items: ${manifest.handoverSummary.fieldRehearsalReviewCount}`,
    `- Field acceptance review items: ${manifest.handoverSummary.fieldAcceptanceReviewCount}`,
    `- Field acceptance skipped items: ${manifest.handoverSummary.fieldAcceptanceSkippedCount}`,
    `- Field preflight review items: ${manifest.handoverSummary.fieldPreflightReviewCount}`,
    `- Field preflight skipped items: ${manifest.handoverSummary.fieldPreflightSkippedCount}`,
    `- Requirement areas: ${manifest.handoverSummary.requirementAreaCount}`,
    `- Automated evidence items: ${manifest.handoverSummary.automatedEvidenceItemCount}`,
    `- Field verification required areas: ${manifest.handoverSummary.fieldVerificationRequiredCount}`,
    "",
    "| Coverage | Count |",
    "| --- | --- |",
    ...Object.entries(manifest.handoverSummary.coverageCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([coverage, count]) => `| ${coverage} | ${count} |`),
    "",
    "Field verification areas:",
    "",
    ...manifest.handoverSummary.fieldVerificationRequiredAreas.map((area) => `- ${area}`),
    "",
    "Notes:",
    "",
    ...manifest.handoverSummary.notes.map((note) => `- ${note}`),
    "",
    "Companion review items:",
    "",
    ...(manifest.handoverSummary.companionReviewItems.length > 0
      ? manifest.handoverSummary.companionReviewItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Companion skipped items:",
    "",
    ...(manifest.handoverSummary.companionSkippedItems.length > 0
      ? manifest.handoverSummary.companionSkippedItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Field rehearsal review items:",
    "",
    ...(manifest.handoverSummary.fieldRehearsalReviewItems.length > 0
      ? manifest.handoverSummary.fieldRehearsalReviewItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Field acceptance review items:",
    "",
    ...(manifest.handoverSummary.fieldAcceptanceReviewItems.length > 0
      ? manifest.handoverSummary.fieldAcceptanceReviewItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Field acceptance skipped items:",
    "",
    ...(manifest.handoverSummary.fieldAcceptanceSkippedItems.length > 0
      ? manifest.handoverSummary.fieldAcceptanceSkippedItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Field preflight review items:",
    "",
    ...(manifest.handoverSummary.fieldPreflightReviewItems.length > 0
      ? manifest.handoverSummary.fieldPreflightReviewItems.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Field preflight skipped items:",
    "",
    ...(manifest.handoverSummary.fieldPreflightSkippedItems.length > 0
      ? manifest.handoverSummary.fieldPreflightSkippedItems.map((item) => `- ${item}`)
      : ["- none"]),
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
    "## Companion Evidence",
    "",
    "| Type | Output Root | Manifest | Review | Skipped |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.companionEvidence.summaries.map(
      (item) =>
        `| ${item.type} | \`${item.outputRoot}\` | ${item.manifestPath ? `\`${item.manifestPath}\`` : "missing"} | ${item.reviewCount} | ${item.skippedCount} |`,
    ),
  );

  lines.push(
    "",
    "## Field Rehearsal Evidence",
    "",
    "| Type | Output Root | Manifest | PASS | Review |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.fieldRehearsalEvidence.summaries.map(
      (item) =>
        `| ${item.type} | \`${item.outputRoot}\` | ${item.manifestPath ? `\`${item.manifestPath}\`` : "missing"} | ${item.passCount} | ${item.reviewCount} |`,
    ),
  );

  lines.push(
    "",
    "## Field Acceptance Evidence",
    "",
    "| Type | Output Root | Manifest | PASS | Review | Skipped |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.fieldAcceptanceEvidence.summaries.map(
      (item) =>
        `| ${item.type} | \`${item.outputRoot}\` | ${item.manifestPath ? `\`${item.manifestPath}\`` : "missing"} | ${item.passCount} | ${item.reviewCount} | ${item.skippedCount} |`,
    ),
  );

  lines.push(
    "",
    "## Field Preflight Evidence",
    "",
    "| Type | Output Root | Manifest | PASS | Review | Skipped |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.fieldPreflightEvidence.summaries.map(
      (item) =>
        `| ${item.type} | \`${item.outputRoot}\` | ${item.manifestPath ? `\`${item.manifestPath}\`` : "missing"} | ${item.passCount} | ${item.reviewCount} | ${item.skippedCount} |`,
    ),
  );

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
  const companionEvidence = {
    runtime: {
      outputRoot: toOutputRootArg(path.join(outputDir, "runtime")),
    },
    security: {
      outputRoot: toOutputRootArg(path.join(outputDir, "security")),
    },
  };
  const fieldRehearsalEvidence = {
    database: { outputRoot: "artifacts/field-db-rehearsal" },
    lidar: { outputRoot: "artifacts/field-lidar-rehearsal" },
    controlBoard: { outputRoot: "artifacts/field-control-board-rehearsal" },
  };
  const fieldAcceptanceEvidence = {
    outputRoot: "artifacts/field-acceptance",
  };
  const fieldPreflightEvidence = {
    outputRoot: "artifacts/field-preflight",
  };

  const commands = [
    ["smoke", npmCommand, ["run", "smoke"]],
    ["server test", npmCommand, ["run", "server:test"]],
    ["frontend lint", npmCommand, ["--prefix", "dashboard/dashboard-web", "run", "lint"]],
    ["ci", npmCommand, ["run", "ci"]],
    ["audit policy", npmCommand, ["run", "verify:audit-policy"]],
    ["docker compose config", "docker", ["compose", "config", "--quiet"]],
    ["runtime evidence", npmCommand, ["run", "runtime:evidence", "--", `--output-root=${companionEvidence.runtime.outputRoot}`]],
    ["security evidence", npmCommand, ["run", "security:evidence", "--", `--output-root=${companionEvidence.security.outputRoot}`]],
  ].map(([label, command, args]) => runCommand(label, command, args));

  companionEvidence.summaries = [
    summarizeCompanionEvidence("Runtime", companionEvidence.runtime.outputRoot),
    summarizeCompanionEvidence("Security", companionEvidence.security.outputRoot),
  ];
  fieldRehearsalEvidence.summaries = [
    summarizeFieldRehearsal("DB And Prisma", fieldRehearsalEvidence.database.outputRoot),
    summarizeFieldRehearsal("Lidar Ingest", fieldRehearsalEvidence.lidar.outputRoot),
    summarizeFieldRehearsal("Control Board TCP", fieldRehearsalEvidence.controlBoard.outputRoot),
  ];
  fieldAcceptanceEvidence.summaries = [
    summarizeFieldAcceptance("Field Acceptance", fieldAcceptanceEvidence.outputRoot),
  ];
  fieldPreflightEvidence.summaries = [
    summarizeFieldPreflight("Field Preflight", fieldPreflightEvidence.outputRoot),
  ];

  const evidenceMatrix = readDeliveryEvidenceMatrix();
  const matrixRows = parseEvidenceMatrix(evidenceMatrix);
  const requirementAreas = matrixRows.map((row) => row.area);
  const automatedEvidenceCoverage = buildAutomatedEvidenceCoverage(matrixRows, commands);
  const handoverSummary = buildHandoverSummary(
    matrixRows,
    commands,
    automatedEvidenceCoverage,
    companionEvidence.summaries,
    fieldRehearsalEvidence.summaries,
    fieldAcceptanceEvidence.summaries,
    fieldPreflightEvidence.summaries,
  );

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
    companionEvidence,
    fieldRehearsalEvidence,
    fieldAcceptanceEvidence,
    fieldPreflightEvidence,
    automatedEvidenceCoverage,
    handoverSummary,
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

if (require.main === module) {
  main();
}

module.exports = {
  buildAutomatedEvidenceCoverage,
  buildHandoverSummary,
  extractBacktickTokens,
  parseEvidenceMatrix,
  readLatestJsonManifest,
  summarizeCompanionEvidence,
  summarizeFieldAcceptance,
  summarizeFieldPreflight,
  statusLabel,
  timestampForPath,
  unique,
};
