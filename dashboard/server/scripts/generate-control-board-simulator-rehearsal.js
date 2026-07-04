const fs = require("fs");
const path = require("path");
const { buildControlBoardCommandPacket, parseControlBoardPacket, validateControlBoardCommandResponse } = require("../src/domains/external-ingest/protocol/controlBoardProtocol");
const { sendRawPacket } = require("../src/domains/control-board/adapters/tcpControlBoard.adapter");
const { createSimulator } = require("./control-board-tcp-simulator");

const COMMANDS = ["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET"];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function runGit(args) {
  const { spawnSync } = require("child_process");
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function gitState() {
  const commit = runGit(["rev-parse", "HEAD"]);
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstreamCommit = upstream ? runGit(["rev-parse", "@{u}"]) : "";
  return {
    branch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit,
    clean: runGit(["status", "--short"]) === "",
    upstream: upstream || null,
    upstreamCommit: upstreamCommit || null,
    pushed: Boolean(commit && upstreamCommit && commit === upstreamCommit),
  };
}

function hex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join("");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, manifest) {
  const lines = [
    "# Control Board Simulator Rehearsal",
    "",
    `- Generated at: ${manifest.generatedAt}`,
    `- Evidence type: ${manifest.evidenceType}`,
    `- Simulator host: ${manifest.simulator.host}`,
    `- Simulator port: ${manifest.simulator.port}`,
    `- Git commit: ${manifest.git.commit}`,
    `- Git branch: ${manifest.git.branch}`,
    `- Working tree clean: ${manifest.git.clean}`,
    "",
    "## Results",
    "",
    "| Status | Command | Packet hex | ACK hex | Response ms |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.results.map((item) => `| ${item.status} | ${item.commandType} | ${item.packetHex} | ${item.responseHex} | ${item.responseMs} |`),
    "",
    "## Scope",
    "",
    "- This evidence proves local TCP frame generation, simulator ACK parsing, response validation, and response timing capture.",
    "- This does not replace the final integrated control-board LIVE TCP ACK rehearsal against approved field hardware.",
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function runCommand(commandType, address) {
  const packet = buildControlBoardCommandPacket(commandType);
  const response = await sendRawPacket(packet.buffer, {
    host: address.address,
    port: address.port,
    connectTimeoutMs: 1000,
    responseTimeoutMs: 1000,
  });
  const parsed = parseControlBoardPacket(Array.from(response.responseBuffer));
  const validation = validateControlBoardCommandResponse(commandType, parsed);

  return {
    commandType,
    status: validation.ok ? "PASS" : "FAIL",
    packetHex: hex(packet.buffer),
    responseHex: hex(response.responseBuffer),
    responseMs: response.responseMs,
    trailingByteCount: response.trailingByteCount,
    parsed,
    validation,
  };
}

async function main() {
  const outputRoot = argValue("output-root", "artifacts/control-board-simulator-rehearsal");
  const runId = argValue("run-id", timestamp());
  const outputDir = path.join(outputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const simulator = createSimulator({
    host: argValue("host", "127.0.0.1"),
    port: Number(argValue("port", "0")),
    logger: { info() {}, warn() {} },
  });

  const address = await simulator.listen();
  try {
    const results = [];
    for (const commandType of COMMANDS) {
      results.push(await runCommand(commandType, address));
    }

    const failed = results.filter((item) => item.status !== "PASS");
    const manifest = {
      generatedAt: new Date().toISOString(),
      evidenceType: "CONTROL_BOARD_SIMULATOR_REHEARSAL_PASS",
      status: failed.length === 0 ? "PASS" : "FAIL",
      outputDir,
      git: gitState(),
      simulator: {
        host: address.address,
        port: address.port,
        frameLengthBytes: 10,
        responseType: "RESPONSE_LOG",
      },
      commandCount: COMMANDS.length,
      failedCommandCount: failed.length,
      results,
      finalHardwareGate: {
        stillRequired: true,
        reason: "Local simulator ACK evidence does not prove integrated control-board hardware behavior.",
        closeWhen: "Run scripts/control-board-field-rehearsal.ps1 with -AllowLiveTcp against approved field hardware and capture ACKNOWLEDGED command evidence.",
      },
    };

    writeJson(path.join(outputDir, "manifest.json"), manifest);
    writeMarkdown(path.join(outputDir, "manifest.md"), manifest);

    if (failed.length > 0) {
      throw new Error(`Control-board simulator rehearsal failed for ${failed.length} command(s).`);
    }

    console.log("control board simulator rehearsal ok");
    console.log(`evidence written to ${outputDir}`);
  } finally {
    await simulator.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
