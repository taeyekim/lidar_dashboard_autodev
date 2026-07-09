const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  buildMarkdown,
  buildPhaseQueue,
  flattenPrerequisites,
  summarizeFieldAnswerSheet,
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
const catalog = readProjectFile("dashboard/server/scripts/field-env-catalog.js");

[
  [packageJson, "field:closeout-quickstart", "root package scripts"],
  [packageJson, "verify:field-closeout-quickstart", "root package scripts"],
  [serverPackageJson, "verify-field-closeout-quickstart-contracts.js", "server verify chain"],
  [generator, "artifacts/field-closeout-quickstart", "quickstart generator"],
  [generator, "Env Keys To Fill", "quickstart generator"],
  [generator, "field-env-catalog", "quickstart generator"],
  [generator, "fieldEnvMeta", "quickstart generator"],
  [generator, "isSecretFieldEnvKey", "quickstart generator"],
  [generator, "fieldRequirementsBacklog", "quickstart generator"],
  [generator, "sourceFieldRequirementsBacklog", "quickstart generator"],
  [generator, "requirementsBacklogSummary", "quickstart generator"],
  [generator, "Requirements Backlog Summary", "quickstart generator"],
  [generator, "Field Answer Sheet Linkage", "quickstart generator"],
  [generator, "summarizeFieldAnswerSheet", "quickstart generator"],
  [generator, "Risk acceptance rows", "quickstart generator"],
  [generator, "Command To Rerun", "quickstart generator"],
  [generator, "Field Closeout Packet", "quickstart generator"],
  [generator, "Required Field Inputs", "quickstart generator"],
  [generator, "Live TCP ACK Checklist", "quickstart generator"],
  [generator, "Live TCP Stop Conditions", "quickstart generator"],
  [generator, "Safe State Evidence Checklist", "quickstart generator"],
  [generator, "Strict Closeout Command Sequence", "quickstart generator"],
  [generator, "Evidence To Attach", "quickstart generator"],
  [generator, "fieldCloseoutPacket", "quickstart generator"],
  [generator, "CONTROL_BOARD_LIVE_APPROVED=true", "quickstart generator"],
  [generator, "CRC mismatch", "quickstart generator"],
  [generator, "safe/default state", "quickstart generator"],
  [generator, "scripts/control-board-field-rehearsal.ps1", "quickstart generator"],
  [catalog, "long random JWT signing secret", "field env catalog"],
  [catalog, "integrated control-board IPv4", "field env catalog"],
  [catalog, "never paste into evidence", "field env catalog"],
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
      env: ["JWT_SECRET", "CORS_ORIGINS", "FIELD_BASE_URL", "JWT_SECRET"],
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

const answerSheetLinkage = summarizeFieldAnswerSheet({
  data: {
    fieldAnswerSheet: [
      {
        id: "REQ-001",
        owner: "Control-board TCP",
        priority: "P0",
        answerStatus: "TODO",
        question: "Confirm control-board host and TCP port.",
        envKeysToFill: ["CONTROL_BOARD_HOST", "CONTROL_BOARD_PORT"],
        evidenceToAttach: ["artifacts/field-control-board-rehearsal/<timestamp>/manifest.json"],
        runtimeToRun: ["Integrated control board reachable"],
        commandToRerun: "scripts/control-board-field-rehearsal.ps1 -AllowLiveTcp",
        riskAcceptanceNeeded: true,
        targetRecheckDate: "",
        closeWhen: "Live ACK evidence is captured.",
      },
    ],
  },
});
assert(answerSheetLinkage.answerCount === 1, "answer sheet linkage should count rows");
assert(answerSheetLinkage.todoCount === 1, "answer sheet linkage should count TODO rows");
assert(answerSheetLinkage.riskAcceptanceCount === 1, "answer sheet linkage should count risk acceptance rows");
assert(answerSheetLinkage.rows[0].commandToRerun.includes("AllowLiveTcp"), "answer sheet linkage should keep rerun command");

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
      openItemCount: 2,
      blockingItemCount: 1,
      reviewItemCount: 1,
      envFile: {
        appendMissingEnvBlockLines: ["JWT_SECRET=<field-secret-redacted>", "CONTROL_BOARD_DRY_RUN=true"],
      },
    },
  },
  fieldRequirementsBacklog: {
    path: "artifacts/field-requirements-backlog/fixture/manifest.json",
    data: {
      status: "OPEN",
      remainingGateCount: 2,
      itemCount: 3,
      openItemCount: 3,
      ownerCount: 2,
      priorityCounts: { P0: 1, P1: 2 },
      actionTypeCounts: { FIELD_ACTION_REQUIRED: 2, REVIEW_REQUIRED: 1 },
      fieldAnswerSheet: [
        {
          id: "REQ-001",
          owner: "Control-board TCP",
          priority: "P0",
          answerStatus: "TODO",
          question: "Confirm control-board host and TCP port.",
          envKeysToFill: ["CONTROL_BOARD_HOST", "CONTROL_BOARD_PORT"],
          evidenceToAttach: ["artifacts/field-control-board-rehearsal/<timestamp>/manifest.json"],
          runtimeToRun: ["Integrated control board reachable"],
          commandToRerun: "scripts/control-board-field-rehearsal.ps1 -AllowLiveTcp",
          riskAcceptanceNeeded: true,
          targetRecheckDate: "",
          closeWhen: "Live ACK evidence is captured.",
        },
      ],
    },
  },
});

assert(manifest.status === "OPEN", "quickstart should be OPEN when action items exist");
assert(manifest.openActionCount === 2, "quickstart should count open actions");
assert(manifest.securityRequiredCount === 1, "quickstart should copy security bucket count");
assert(manifest.envGuide.some((item) => item.key === "JWT_SECRET" && item.secret === true), "quickstart should mark JWT_SECRET as secret");
assert(manifest.envGuide.some((item) => item.key === "CONTROL_BOARD_HOST" && item.owner === "Control-board TCP"), "quickstart should explain control board host ownership");
assert(
  manifest.envGuide.some((item) => item.key === "FIELD_BASE_URL" && item.valueShape.includes("delivery Nginx/operator entrypoint")),
  "quickstart should explain FIELD_BASE_URL ownership and value shape",
);
assert(manifest.phaseQueue.length === 2, "quickstart should build phase queue");
assert(manifest.ownerQueue.length === 1, "quickstart should build owner queue");
assert(manifest.sourceFieldEnvCloseout.includes("field-env-closeout"), "quickstart should link field env closeout evidence");
assert(
  manifest.sourceFieldRequirementsBacklog.includes("field-requirements-backlog"),
  "quickstart should link field requirements backlog evidence",
);
assert(manifest.requirementsBacklogSummary.itemCount === 3, "quickstart should summarize backlog item count");
assert(manifest.requirementsBacklogSummary.ownerCount === 2, "quickstart should summarize backlog owner count");
assert(manifest.requirementsBacklogSummary.priorityCounts.P0 === 1, "quickstart should preserve backlog priority counts");
assert(manifest.fieldAnswerSheetLinkage.answerCount === 1, "quickstart should summarize answer sheet rows");
assert(manifest.fieldAnswerSheetLinkage.todoCount === 1, "quickstart should summarize answer sheet TODO rows");
assert(manifest.fieldAnswerSheetLinkage.riskAcceptanceCount === 1, "quickstart should summarize answer sheet risk rows");
assert(manifest.fieldAnswerSheetLinkage.rows[0].envKeysToFill.includes("CONTROL_BOARD_HOST"), "quickstart should link answer sheet env keys");
assert(manifest.envPatchBlockLines.includes("JWT_SECRET=replace_in_field"), "quickstart should sanitize secret patch values");
assert(manifest.envPatchBlockLines.includes("CONTROL_BOARD_DRY_RUN=true"), "quickstart should include safe control-board defaults");
assert(manifest.fieldCloseoutPacket.summary.openEnvItemCount === 2, "quickstart packet should summarize open env items");
assert(
  manifest.fieldCloseoutPacket.envGroups.some(
    (group) => group.id === "control-board-live-tcp" && group.items.some((item) => item.key === "CONTROL_BOARD_HOST"),
  ),
  "quickstart packet should group live TCP env keys",
);
assert(
  manifest.fieldCloseoutPacket.liveTcpChecklist.some((item) => item.includes("CONTROL_BOARD_LIVE_APPROVED=true")),
  "quickstart packet should include live approval checklist",
);
assert(
  manifest.fieldCloseoutPacket.liveTcpStopConditions.some((item) => item.includes("CRC mismatch")),
  "quickstart packet should include live TCP stop conditions",
);
assert(
  manifest.fieldCloseoutPacket.safeStateEvidenceChecklist.some((item) => item.includes("safe/default state")),
  "quickstart packet should include safe state evidence checklist",
);
assert(
  manifest.fieldCloseoutPacket.strictCommandSequence.some((command) => command.includes("control-board-field-rehearsal.ps1")),
  "quickstart packet should include live TCP rehearsal command",
);
assert(
  manifest.fieldCloseoutPacket.evidenceToAttach.some((item) => item.includes("field-control-board-rehearsal")),
  "quickstart packet should list control-board rehearsal evidence",
);

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
  "FIELD_BASE_URL",
  "delivery Nginx/operator entrypoint",
  "Source field requirements backlog",
  "Requirements Backlog Summary",
  "Item count: 3",
  "Field Answer Sheet Linkage",
  "Answer rows: 1",
  "Risk acceptance rows: 1",
  "Command To Rerun",
  "REQ-001",
  "Field Closeout Packet",
  "Required Field Inputs",
  "Auth/security delivery values",
  "Control-board live TCP values",
  "Live TCP ACK Checklist",
  "Live TCP Stop Conditions",
  "Safe State Evidence Checklist",
  "Strict Closeout Command Sequence",
  "Evidence To Attach",
  "Deferred Field Requirements",
  "CONTROL_BOARD_LIVE_APPROVED=true",
  "CRC mismatch",
  "safe/default state",
  "control-board-field-rehearsal.ps1",
  "CONTROL_BOARD_HOST",
  "Evidence Files To Prepare",
  "Phase Queue",
  "Owner Queue",
  "Command Queue",
  "Do not dispatch external CI",
].forEach((token) => assert(markdown.includes(token), `quickstart markdown should include ${token}`));

console.log("field closeout quickstart contracts ok");
