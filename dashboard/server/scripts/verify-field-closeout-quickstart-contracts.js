const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  buildMarkdown,
  buildPhaseQueue,
  flattenPrerequisites,
} = require("./generate-field-closeout-quickstart");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const generator = readProjectFile("dashboard/server/scripts/generate-field-closeout-quickstart.js");

[
  [packageJson, "field:closeout-quickstart", "root package scripts"],
  [packageJson, "verify:field-closeout-quickstart", "root package scripts"],
  [serverPackageJson, "verify-field-closeout-quickstart-contracts.js", "server verify chain"],
  [generator, "artifacts/field-closeout-quickstart", "quickstart generator"],
  [generator, "Env Keys To Fill", "quickstart generator"],
  [generator, "ENV_KEY_GUIDE", "quickstart generator"],
  [generator, "long random JWT signing secret", "quickstart generator"],
  [generator, "integrated control-board IPv4", "quickstart generator"],
  [generator, "never paste into evidence", "quickstart generator"],
  [generator, "Phase Queue", "quickstart generator"],
  [generator, "Owner Queue", "quickstart generator"],
  [generator, "Command Queue", "quickstart generator"],
  [generator, "CONTROL_BOARD_DRY_RUN=true", "quickstart generator"],
  [generator, "Do not dispatch external CI", "quickstart generator"],
].forEach(([content, token, label]) => {
  assert(content.includes(token), `${label} is missing ${token}`);
});

const actionItems = [
  {
    owner: "Auth/Security",
    priority: "P0",
    phase: "Field Preflight",
    command: "npm.cmd run field:preflight",
    closeWhen: "preflight has no review items",
    prerequisites: {
      env: ["JWT_SECRET", "CORS_ORIGINS", "JWT_SECRET"],
      evidence: [],
      runtime: ["Nginx is running"],
      closeout: ["Refresh field preflight"],
    },
  },
  {
    owner: "Control-board TCP",
    priority: "P0",
    phase: "Field Rehearsal",
    command: "scripts/control-board-field-rehearsal.ps1",
    closeWhen: "ACK evidence is captured",
    prerequisites: {
      env: ["CONTROL_BOARD_HOST", "CONTROL_BOARD_PORT"],
      evidence: ["artifacts/manual/field-risk-acceptance.md"],
      runtime: ["Integrated control board is reachable"],
      closeout: ["Capture ACK evidence"],
    },
  },
];

const prerequisites = flattenPrerequisites(actionItems);
assert(prerequisites.env.includes("JWT_SECRET"), "quickstart should collect env keys");
assert(prerequisites.env.filter((key) => key === "JWT_SECRET").length === 1, "quickstart should de-duplicate env keys");
assert(prerequisites.evidence.includes("artifacts/manual/field-risk-acceptance.md"), "quickstart should collect evidence paths");

const phaseQueue = buildPhaseQueue(actionItems);
assert(phaseQueue[0].phase === "Field Preflight", "phase queue should use field closeout order");
assert(phaseQueue[1].phase === "Field Rehearsal", "phase queue should keep rehearsal after preflight");

const manifest = buildManifest({
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer",
  siteName: "field-site",
  baseUrl: "http://field.local:8080",
  git: { branch: "dev", commit: "fixture", clean: true, upstream: "origin/dev", upstreamCommit: "fixture", pushed: true },
  finalStatus: {
    path: "artifacts/final-status/fixture/manifest.json",
    data: { baseUrl: "http://field.local:8080", remainingGates: [{ actionType: "REVIEW_REQUIRED" }] },
  },
  classification: {
    path: "artifacts/final-gate-classification/fixture/manifest.json",
    data: { summary: { fieldRequiredCount: 2, bucketGateCounts: { security_tooling: 1 } } },
  },
  actionBoard: {
    path: "artifacts/field-action-board/fixture/manifest.json",
    data: {
      baseUrl: "http://field.local:8080",
      actionItems,
      ownerGroups: [{ owner: "Auth/Security", total: 1, byPriority: { P0: 1 }, commands: ["npm.cmd run field:preflight"] }],
    },
  },
  fieldEnvCloseout: {
    path: "artifacts/field-env-closeout/fixture/manifest.json",
    data: {
      envFile: {
        appendMissingEnvBlockLines: ["JWT_SECRET=<field-secret-redacted>", "CONTROL_BOARD_DRY_RUN=true"],
      },
    },
  },
});

assert(manifest.status === "OPEN", "quickstart should be OPEN when action items exist");
assert(manifest.openActionCount === 2, "quickstart should count open actions");
assert(manifest.securityRequiredCount === 1, "quickstart should copy security bucket count");
assert(manifest.envGuide.some((item) => item.key === "JWT_SECRET" && item.secret === true), "quickstart should mark JWT_SECRET as secret");
assert(manifest.envGuide.some((item) => item.key === "CONTROL_BOARD_HOST" && item.owner === "Control-board TCP"), "quickstart should explain control board host ownership");
assert(manifest.phaseQueue.length === 2, "quickstart should build phase queue");
assert(manifest.ownerQueue.length === 1, "quickstart should build owner queue");
assert(manifest.sourceFieldEnvCloseout.includes("field-env-closeout"), "quickstart should link field env closeout evidence");
assert(manifest.envPatchBlockLines.includes("JWT_SECRET=replace_in_field"), "quickstart should sanitize secret patch values");
assert(manifest.envPatchBlockLines.includes("CONTROL_BOARD_DRY_RUN=true"), "quickstart should include safe control-board defaults");

const markdown = buildMarkdown(manifest);
[
  "Field Closeout Quickstart",
  "Env Keys To Fill",
  "Safe .env Patch Block",
  "replace_in_field",
  "JWT_SECRET",
  "Value Shape",
  "Verify With",
  "long random JWT signing secret",
  "CONTROL_BOARD_HOST",
  "Evidence Files To Prepare",
  "Phase Queue",
  "Owner Queue",
  "Command Queue",
  "Do not dispatch external CI",
].forEach((token) => assert(markdown.includes(token), `quickstart markdown should include ${token}`));

console.log("field closeout quickstart contracts ok");
