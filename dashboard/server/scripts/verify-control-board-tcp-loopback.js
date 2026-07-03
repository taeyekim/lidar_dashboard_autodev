const net = require("net");
const {
  CONTROL_BOARD_FRAME_LENGTH,
  sendRawPacket,
} = require("../src/domains/control-board/adapters/tcpControlBoard.adapter");
const {
  buildControlBoardCommandPacket,
  parseControlBoardPacket,
} = require("../src/domains/external-ingest/protocol/controlBoardProtocol");

const EXPECTED_COMMAND_HEX = "02 A1 10 01 01 02 00 9B 03 0D";
const RESPONSE_HEX = "02 A1 20 01 01 02 00 CD 03 0D";
const adapterSource = require("fs").readFileSync(
  require("path").join(__dirname, "..", "src", "domains", "control-board", "adapters", "tcpControlBoard.adapter.js"),
  "utf8",
);

function hexToBuffer(hex) {
  return Buffer.from(hex.split(/\s+/).map((token) => Number.parseInt(token, 16)));
}

function bufferToHex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withLoopbackServer(responseWriter, handler) {
  const server = net.createServer((socket) => {
    socket.once("data", (data) => {
      const receivedHex = bufferToHex(data);
      if (receivedHex !== EXPECTED_COMMAND_HEX) {
        socket.destroy(new Error(`unexpected packet ${receivedHex}`));
        return;
      }
      responseWriter(socket);
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
  assert(CONTROL_BOARD_FRAME_LENGTH === 10, "control board response frame length must be 10 bytes");

  await withLoopbackServer((socket) => {
    socket.write(hexToBuffer(RESPONSE_HEX));
  }, async (port) => {
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

  await withLoopbackServer((socket) => {
    const response = hexToBuffer(RESPONSE_HEX);
    socket.write(response.subarray(0, 4));
    setTimeout(() => socket.write(response.subarray(4)), 10);
  }, async (port) => {
    const packet = buildControlBoardCommandPacket("STAGE_1_ON");
    const response = await sendRawPacket(packet.buffer, {
      host: "127.0.0.1",
      port,
      connectTimeoutMs: 1000,
      responseTimeoutMs: 1000,
    });

    assert(response.responseHex === RESPONSE_HEX, `split TCP response was not reassembled: ${response.responseHex}`);
    assert(response.trailingByteCount === 0, "split TCP response should not report trailing bytes");
  });

  await withLoopbackServer((socket) => {
    socket.write(Buffer.concat([hexToBuffer(RESPONSE_HEX), Buffer.from([0xAA, 0xBB])]));
  }, async (port) => {
    const packet = buildControlBoardCommandPacket("STAGE_1_ON");
    const response = await sendRawPacket(packet.buffer, {
      host: "127.0.0.1",
      port,
      connectTimeoutMs: 1000,
      responseTimeoutMs: 1000,
    });

    assert(response.responseHex === RESPONSE_HEX, `coalesced TCP response frame was incorrect: ${response.responseHex}`);
    assert(response.trailingByteCount === 2, "coalesced TCP response should report trailing bytes");
    assert(response.trailingHex === "AA BB", `unexpected trailing bytes ${response.trailingHex}`);
  });

  await withLoopbackServer(() => {
    // Keep the socket open without sending a response frame so responseTimeoutMs is exercised.
  }, async (port) => {
    const packet = buildControlBoardCommandPacket("STAGE_1_ON");
    let timeoutError = null;
    try {
      await sendRawPacket(packet.buffer, {
        host: "127.0.0.1",
        port,
        connectTimeoutMs: 1000,
        responseTimeoutMs: 30,
      });
    } catch (error) {
      timeoutError = error;
    }

    assert(timeoutError, "missing control board response must time out");
    assert(
      timeoutError.message.includes("Timed out waiting for control board response after 30ms"),
      `unexpected response timeout message: ${timeoutError.message}`,
    );
  });

  assert(adapterSource.includes("Timed out connecting to control board after"), "adapter must distinguish connect timeout errors");
  assert(adapterSource.includes("connectTimeoutMs"), "adapter must use connectTimeoutMs explicitly");
  assert(adapterSource.includes("responseTimeoutMs"), "adapter must use responseTimeoutMs explicitly");

  console.log("control board TCP loopback ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
