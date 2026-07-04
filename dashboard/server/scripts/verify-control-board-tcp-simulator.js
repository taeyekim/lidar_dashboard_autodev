const {
  buildAckFrame,
  createSimulator,
} = require("./control-board-tcp-simulator");
const {
  buildControlBoardCommandPacket,
  parseControlBoardPacket,
  validateControlBoardCommandResponse,
} = require("../src/domains/external-ingest/protocol/controlBoardProtocol");
const { sendRawPacket } = require("../src/domains/control-board/adapters/tcpControlBoard.adapter");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyAckFrame(commandType) {
  const packet = buildControlBoardCommandPacket(commandType);
  const ack = buildAckFrame(packet.buffer);
  const parsed = parseControlBoardPacket(Array.from(ack));
  const validation = validateControlBoardCommandResponse(commandType, parsed);

  assert(parsed.isValid, `${commandType} simulator ACK must parse as valid`);
  assert(parsed.parsed.type === "RESPONSE_LOG", `${commandType} simulator ACK must be RESPONSE_LOG`);
  assert(parsed.command === commandType, `${commandType} simulator ACK command mismatch`);
  assert(validation.ok, `${commandType} simulator ACK failed command-response validation`);
}

async function verifyTcpRoundTrip(commandType) {
  const simulator = createSimulator({
    host: "127.0.0.1",
    port: 0,
    logger: { info() {}, warn() {} },
  });
  const address = await simulator.listen();
  try {
    const packet = buildControlBoardCommandPacket(commandType);
    const response = await sendRawPacket(packet.buffer, {
      host: "127.0.0.1",
      port: address.port,
      connectTimeoutMs: 1000,
      responseTimeoutMs: 1000,
    });
    const parsed = parseControlBoardPacket(Array.from(response.responseBuffer));
    const validation = validateControlBoardCommandResponse(commandType, parsed);

    assert(validation.ok, `${commandType} simulator TCP round-trip failed validation`);
    assert(response.trailingByteCount === 0, `${commandType} simulator TCP round-trip must not add trailing bytes`);
  } finally {
    await simulator.close();
  }
}

async function main() {
  for (const commandType of ["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET"]) {
    await verifyAckFrame(commandType);
    await verifyTcpRoundTrip(commandType);
  }
  console.log("control board TCP simulator ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
