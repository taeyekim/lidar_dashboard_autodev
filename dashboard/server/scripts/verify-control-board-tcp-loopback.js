const net = require("net");
const { sendRawPacket } = require("../src/domains/control-board/adapters/tcpControlBoard.adapter");
const {
  buildControlBoardCommandPacket,
  parseControlBoardPacket,
} = require("../src/domains/external-ingest/protocol/controlBoardProtocol");

const EXPECTED_COMMAND_HEX = "02 A1 10 01 01 02 00 9B 03 0D";
const RESPONSE_HEX = "02 A1 20 01 01 02 00 CD 03 0D";

function hexToBuffer(hex) {
  return Buffer.from(hex.split(/\s+/).map((token) => Number.parseInt(token, 16)));
}

function bufferToHex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withLoopbackServer(handler) {
  const server = net.createServer((socket) => {
    socket.once("data", (data) => {
      const receivedHex = bufferToHex(data);
      if (receivedHex !== EXPECTED_COMMAND_HEX) {
        socket.destroy(new Error(`unexpected packet ${receivedHex}`));
        return;
      }
      socket.write(hexToBuffer(RESPONSE_HEX));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    return await handler(address.port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  await withLoopbackServer(async (port) => {
    const packet = buildControlBoardCommandPacket("STAGE_1_ON");
    const response = await sendRawPacket(packet.buffer, {
      host: "127.0.0.1",
      port,
      connectTimeoutMs: 1000,
      responseTimeoutMs: 1000,
    });

    assert(response.responseHex === RESPONSE_HEX, `unexpected response ${response.responseHex}`);

    const parsed = parseControlBoardPacket(Array.from(response.responseBuffer));
    assert(parsed.isValid, `response should be valid: ${parsed.errors?.join("; ")}`);
    assert(parsed.crcStatus === "VALID", "response CRC should be valid");
    assert(parsed.command === "STAGE_1_ON", `response parsed as ${parsed.command}`);
  });

  console.log("control board TCP loopback ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
