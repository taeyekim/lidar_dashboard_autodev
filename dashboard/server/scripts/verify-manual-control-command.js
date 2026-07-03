const fs = require("fs");
const path = require("path");
const swaggerSpec = require("../src/swagger");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const routes = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.routes.js");
const controller = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.controller.js");
const service = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.service.js");
const latency = readProjectFile("dashboard/server/src/domains/control-board/controlBoardLatency.js");
const schema = readProjectFile("dashboard/server/prisma/schema.prisma");
const api = readProjectFile("dashboard/dashboard-web/src/features/controlBoard/controlBoardApi.js");
const dashboard = readProjectFile("dashboard/dashboard-web/src/pages/Dashboard/DashboardPage.jsx");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const acceptanceChecklist = readProjectFile("docs/ops/acceptance-checklist.md");
const evidenceMatrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");

assertIncludes(routes, 'router.post("/control-board/commands/test", requireAuth, controller.sendTestCommand)', "control board routes");
assertIncludes(controller, "requestedByUserId: req.user?.id || null", "control board controller");
assertIncludes(controller, 'trigger: "MANUAL_TEST"', "control board controller");

[
  "requestedByUserId: options.requestedByUserId || null",
  'trigger: options.trigger || "MANUAL"',
  "COMMAND_CREATED",
  "DRY_RUN_SKIPPED_SEND",
  "TCP_SEND_STARTED",
  "TCP_SEND_ATTEMPT_FAILED",
  "TCP_RESPONSE_ACKNOWLEDGED",
  "TCP_SEND_FAILED",
  "controlBoardLatency",
  "responseDurationMs",
  "summarizeResponseLatency",
  "averageResponseMs",
  "responseSampleCount",
  "broadcastRealtime(\"control-command.created\"",
  "broadcastRealtime(\"control-command.updated\"",
].forEach((token) => assertIncludes(service, token, "control board service"));

[
  "function responseDurationMs",
  "function summarizeResponseLatency",
  "averageResponseMs",
  "responseSampleCount",
].forEach((token) => assertIncludes(latency, token, "control board latency helper"));

[
  [packageJson, "verify:control-board-latency", "root package scripts"],
  [packageJson, "verify-control-board-latency.js", "root package scripts"],
  [serverPackageJson, "verify-control-board-latency.js", "server package verify chain"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

[
  "requestedByUserId  String?",
  "requestedBy        User?",
  "ControlCommandLog",
  "@@index([commandType])",
  "@@index([requestedAt])",
].forEach((token) => assertIncludes(schema, token, "Prisma schema"));

[
  'postJson("/api/control-board/commands/test", { commandType })',
  "sendControlBoardTestCommand",
  "response.command || response",
].forEach((token) => assertIncludes(api, token, "control board frontend API"));

[
  "requestControlBoardCommand",
  "confirmPendingCommand",
  "sendControlBoardCommand(command.commandType, command.label)",
  'requestControlBoardCommand("STAGE_1_ON")',
  'requestControlBoardCommand("STAGE_2_ON")',
  'requestControlBoardCommand("STAGE_2_RETURN")',
  "pendingCommand",
  "controlBoardBusy",
].forEach((token) => assertIncludes(dashboard, token, "dashboard manual command UI"));

const operation = swaggerSpec.paths?.["/api/control-board/commands/test"]?.post;
assert(operation, "POST /api/control-board/commands/test is missing from Swagger");
const security = operation.security || [];
assert(
  security.some((item) => Array.isArray(item.cookieAuth) && Array.isArray(item.csrfHeaderAuth)),
  "manual control command Swagger operation must require cookieAuth plus csrfHeaderAuth",
);
assert(
  security.some((item) => Array.isArray(item.bearerAuth)),
  "manual control command Swagger operation must keep bearerAuth compatibility",
);

const requestEnum =
  swaggerSpec.components?.schemas?.ControlBoardCommandTestRequest?.properties?.commandType?.enum || [];
["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET"].forEach((commandType) => {
  assert(requestEnum.includes(commandType), `manual control command request enum is missing ${commandType}`);
});

const responseSchema = operation.responses?.["200"]?.content?.["application/json"]?.schema;
assert(
  JSON.stringify(responseSchema).includes("ControlBoardCommandTestResponse"),
  "manual control command Swagger response must use ControlBoardCommandTestResponse",
);

assertIncludes(acceptanceChecklist, "Manual control command records `requestedByUserId`", "acceptance checklist");
assertIncludes(evidenceMatrix, "requestedByUserId", "delivery evidence matrix manual command audit coverage");
assertIncludes(evidenceMatrix, "MANUAL_TEST", "delivery evidence matrix manual command trigger coverage");

console.log("manual control command contracts ok");
