const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} must include ${needle}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-control-board-simulator-rehearsal.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");
const matrix = readProjectFile("docs/ops/delivery-evidence-matrix.md");
const checklist = readProjectFile("docs/ops/acceptance-checklist.md");

[
  "CONTROL_BOARD_SIMULATOR_REHEARSAL_PASS",
  "createSimulator",
  "sendRawPacket",
  "validateControlBoardCommandResponse",
  "STAGE_1_ON",
  "STAGE_2_ON",
  "STAGE_2_RETURN",
  "SYSTEM_RESET",
  "finalHardwareGate",
  "Local simulator ACK evidence does not prove integrated control-board hardware behavior.",
].forEach((token) => assertIncludes(generator, token, "control-board simulator rehearsal generator"));

[
  "control-board:simulator-rehearsal",
  "verify:control-board-simulator-rehearsal",
].forEach((token) => assertIncludes(packageJson, token, "root package scripts"));

assertIncludes(serverPackageJson, "verify-control-board-simulator-rehearsal-contracts.js", "server verify chain");
assertIncludes(runbook, "control-board:simulator-rehearsal", "delivery runbook");
assertIncludes(runbook, "does not replace the final integrated control-board", "delivery runbook");
assertIncludes(runbook, "LIVE TCP ACK evidence", "delivery runbook");
assertIncludes(matrix, "control-board:simulator-rehearsal", "delivery evidence matrix");
assertIncludes(checklist, "control-board:simulator-rehearsal", "acceptance checklist");

console.log("control-board simulator rehearsal contracts ok");
