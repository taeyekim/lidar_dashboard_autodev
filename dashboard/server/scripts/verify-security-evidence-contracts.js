const {
  buildMarkdown,
  buildScannerCloseout,
  requiredScannerFailure,
  scannerCloseoutDefinitions,
  securityDisposition,
  skipped,
  summarizeDispositions,
} = require("./generate-security-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withDisposition(item, requireScanners = false) {
  return {
    ...item,
    disposition: securityDisposition(item, requireScanners),
  };
}

assert(scannerCloseoutDefinitions.length === 4, "scanner closeout should cover gitleaks, Trivy fs, Trivy images, and ZAP");
assert(scannerCloseoutDefinitions.every((item) => item.requiredSwitch && item.closeoutWhenSkipped), "scanner closeout rows need switch and closeout guidance");
assert(scannerCloseoutDefinitions.every((item) => item.installHint.includes("--use-docker-scanners")), "scanner closeout rows should mention Docker scanner fallback");

const skippedGitleaks = skipped("gitleaks secret scan", "gitleaks command is not installed on this PC");
assert(requiredScannerFailure(skippedGitleaks, false) === false, "skipped scanner should not block unless scanners are required");
assert(requiredScannerFailure(skippedGitleaks, true) === true, "skipped scanner should block when scanners are required");
assert(requiredScannerFailure(skipped("trivy backend image scan", "backend image missing"), true) === true, "skipped backend image scan should block when scanners are required");
assert(requiredScannerFailure(skipped("trivy frontend image scan", "frontend image missing"), true) === true, "skipped frontend image scan should block when scanners are required");

const unverifiedGitleaks = withDisposition(skippedGitleaks, false);
assert(unverifiedGitleaks.disposition.code === "UNVERIFIED", "optional skipped scanner should be UNVERIFIED");
assert(unverifiedGitleaks.disposition.blocksStrictAcceptance === false, "optional skipped scanner should not block strict acceptance by itself");

const blockingGitleaks = withDisposition(skippedGitleaks, true);
assert(blockingGitleaks.disposition.code === "BLOCKING", "required skipped scanner should be BLOCKING");
assert(blockingGitleaks.disposition.blocksStrictAcceptance === true, "required skipped scanner should block strict acceptance");

const passedGitleaks = withDisposition({
  label: "gitleaks secret scan",
  status: "executed",
  exitCode: 0,
  error: null,
});
assert(passedGitleaks.disposition.code === "PASS", "successful scanner should PASS");

const acceptedGitleaks = withDisposition({
  label: "gitleaks secret scan",
  status: "policy_accepted",
  reason: "Reviewer accepted unavailable scanner risk.",
  exitCode: 1,
  error: null,
});
assert(acceptedGitleaks.disposition.code === "RISK_ACCEPTED", "policy accepted scanner should be RISK_ACCEPTED");

const closeoutUnverified = buildScannerCloseout([unverifiedGitleaks]).find((item) => item.scanner === "gitleaks");
assert(closeoutUnverified.closeoutStatus === "UNVERIFIED", "optional skipped gitleaks closeout should be UNVERIFIED");
assert(closeoutUnverified.closeoutWhenSkipped.includes("field-risk-acceptance.md"), "unverified scanner closeout should point to risk acceptance evidence");

const closeoutBlocking = buildScannerCloseout([blockingGitleaks]).find((item) => item.scanner === "gitleaks");
assert(closeoutBlocking.closeoutStatus === "BLOCKING", "required skipped gitleaks closeout should be BLOCKING");
assert(closeoutBlocking.blocksStrictAcceptance === true, "blocking scanner closeout should expose strict block");

const closeoutReady = buildScannerCloseout([passedGitleaks]).find((item) => item.scanner === "gitleaks");
assert(closeoutReady.closeoutStatus === "EVIDENCE_READY", "passed scanner closeout should be EVIDENCE_READY");

const closeoutAccepted = buildScannerCloseout([acceptedGitleaks]).find((item) => item.scanner === "gitleaks");
assert(closeoutAccepted.closeoutStatus === "RISK_ACCEPTED", "accepted scanner closeout should be RISK_ACCEPTED");

const summary = summarizeDispositions([passedGitleaks, blockingGitleaks, acceptedGitleaks, unverifiedGitleaks]);
assert(summary.pass === 1, "summary should count pass dispositions");
assert(summary.blocking === 1, "summary should count blocking dispositions");
assert(summary.riskAccepted === 1, "summary should count risk accepted dispositions");
assert(summary.unverified === 1, "summary should count unverified dispositions");

const dockerImageExport = withDisposition({
  label: "trivy backend image scan image export",
  status: "executed",
  command: "docker save -o trivy-backend-image.tar lidar_dashboard_autodev-backend",
  exitCode: 0,
  error: null,
});
const dockerImageScan = withDisposition({
  label: "trivy backend image scan",
  status: "executed",
  command: "docker run --rm aquasec/trivy:latest image --input /out/trivy-backend-image.tar",
  exitCode: 0,
  error: null,
});
const dockerFrontendImageScan = withDisposition({
  label: "trivy frontend image scan",
  status: "executed",
  command: "docker run --rm aquasec/trivy:latest image --input /out/trivy-frontend-image.tar",
  exitCode: 0,
  error: null,
});

const markdown = buildMarkdown({
  generatedAt: "2026-01-01T00:00:00.000Z",
  operator: "security-reviewer",
  hostname: "delivery-host",
  platform: "win32 x64",
  targetUrl: "http://field.local:8080",
  git: {
    branch: "dev",
    commit: "fixture",
    clean: true,
    upstream: "origin/dev",
    upstreamCommit: "fixture",
    pushed: true,
  },
  options: { includeContainerImages: true, includeZap: true, requireScanners: true, useDockerScanners: true },
  strictAcceptanceBlocked: true,
  dispositionSummary: summary,
  toolInventory: [],
  scannerCloseout: [closeoutBlocking, closeoutReady, closeoutAccepted],
  checks: [passedGitleaks, blockingGitleaks, acceptedGitleaks, unverifiedGitleaks, dockerImageExport, dockerImageScan, dockerFrontendImageScan],
});

[
  "docker save",
  "--input",
  "trivy backend image scan",
  "trivy frontend image scan",
  "Scanner Closeout Matrix",
  "Acceptance Classification",
  "Git pushed to origin/dev",
  "Working tree clean",
  "Use Docker scanner fallback",
  "--use-docker-scanners",
  "BLOCKING",
  "RISK_ACCEPTED",
  "UNVERIFIED",
  "통과",
  "차단",
  "위험 수용",
  "미검증",
  "--require-scanners",
].forEach((token) => assert(markdown.includes(token), `security markdown should include ${token}`));

console.log("security evidence contracts ok");
