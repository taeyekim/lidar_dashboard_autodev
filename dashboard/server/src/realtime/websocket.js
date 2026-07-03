const { WebSocketServer } = require("ws");
const mockLidarService = require("../domains/mock-lidar/mockLidar.service");

function initWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.isAlive === false) {
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, ts: Date.now(), payload });

    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.send(JSON.stringify({
      type: "state",
      ts: Date.now(),
      payload: mockLidarService.getState(),
    }));

    ws.send(JSON.stringify({
      type: "logs",
      ts: Date.now(),
      payload: mockLidarService.getLogs(10),
    }));
  });

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return { broadcast };
}

module.exports = { initWebSocket };
