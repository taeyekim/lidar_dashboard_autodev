const net = require("net");
const {
  calculateCrc8Smbus,
  parseControlBoardPacket,
} = require("../src/domains/external-ingest/protocol/controlBoardProtocol");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 19085;
const FRAME_LENGTH = 10;
const TYPE_RESPONSE_LOG = 0x20;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function bufferToHex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function buildAckFrame(commandFrame) {
  if (!Buffer.isBuffer(commandFrame) || commandFrame.length !== FRAME_LENGTH) {
    throw new Error(`Expected one 10-byte command frame.`);
  }

  const response = Buffer.from(commandFrame);
  response[2] = TYPE_RESPONSE_LOG;
  response[7] = calculateCrc8Smbus(Array.from(response.subarray(1, 7)));
  return response;
}

function createSimulator({ host = DEFAULT_HOST, port = DEFAULT_PORT, logger = console } = {}) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= FRAME_LENGTH) {
        const frame = buffer.subarray(0, FRAME_LENGTH);
        buffer = buffer.subarray(FRAME_LENGTH);
        const parsed = parseControlBoardPacket(Array.from(frame));
        if (!parsed.isValid) {
          logger.warn?.("invalid control-board command frame", {
            receivedHex: bufferToHex(frame),
            errors: parsed.errors,
          });
          socket.destroy();
          return;
        }

        const ack = buildAckFrame(frame);
        logger.info?.("control-board simulator ACK", {
          command: parsed.command,
          receivedHex: bufferToHex(frame),
          responseHex: bufferToHex(ack),
        });
        socket.write(ack);
      }
    });
  });

  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(port), host, resolve);
      });
      const address = server.address();
      logger.info?.(`control-board TCP simulator listening on ${address.address}:${address.port}`);
      return address;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function main() {
  const simulator = createSimulator({
    host: argValue("host", process.env.CONTROL_BOARD_SIMULATOR_HOST || DEFAULT_HOST),
    port: Number(argValue("port", process.env.CONTROL_BOARD_SIMULATOR_PORT || DEFAULT_PORT)),
  });
  await simulator.listen();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildAckFrame,
  createSimulator,
};
