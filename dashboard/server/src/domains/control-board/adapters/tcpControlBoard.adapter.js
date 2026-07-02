const net = require("net");

function sendRawPacket(packetBuffer, config) {
  return new Promise((resolve, reject) => {
    if (!config.host || !config.port) {
      reject(new Error("CONTROL_BOARD_HOST and CONTROL_BOARD_PORT are required when dry-run is disabled."));
      return;
    }

    const socket = new net.Socket();
    let settled = false;

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
    socket.once("data", (data) => {
      finish(null, {
        responseBuffer: data,
        responseHex: Array.from(data).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" "),
      });
    });

    socket.connect({ host: config.host, port: config.port, timeout: config.connectTimeoutMs }, () => {
      socket.write(packetBuffer);
    });
  });
}

module.exports = {
  sendRawPacket,
};
