const net = require("net");

const CONTROL_BOARD_FRAME_LENGTH = 10;

function bufferToHex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function sendRawPacket(packetBuffer, config) {
  return new Promise((resolve, reject) => {
    if (!config.host || !config.port) {
      reject(new Error("CONTROL_BOARD_HOST and CONTROL_BOARD_PORT are required when dry-run is disabled."));
      return;
    }

    const socket = new net.Socket();
    let settled = false;
    let responseBuffer = Buffer.alloc(0);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    }

    socket.setTimeout(config.responseTimeoutMs);

    socket.once("error", (error) => finish(error));
    socket.once("timeout", () => finish(new Error("Timed out waiting for control board response.")));
    socket.on("data", (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);
      if (responseBuffer.length < CONTROL_BOARD_FRAME_LENGTH) return;

      const frame = responseBuffer.subarray(0, CONTROL_BOARD_FRAME_LENGTH);
      const trailingBytes = responseBuffer.subarray(CONTROL_BOARD_FRAME_LENGTH);
      finish(null, {
        responseBuffer: frame,
        responseHex: bufferToHex(frame),
        trailingByteCount: trailingBytes.length,
        trailingHex: trailingBytes.length > 0 ? bufferToHex(trailingBytes) : null,
      });
    });

    socket.connect({ host: config.host, port: config.port, timeout: config.connectTimeoutMs }, () => {
      socket.write(packetBuffer);
    });
  });
}

module.exports = {
  CONTROL_BOARD_FRAME_LENGTH,
  sendRawPacket,
};
