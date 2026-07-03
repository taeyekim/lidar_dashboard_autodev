const fs = require("fs");
const path = require("path");
const { broadcastRealtime, setRealtimeBroadcaster } = require("../src/realtime/bus");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const received = [];
setRealtimeBroadcaster((type, payload) => received.push({ type, payload }));
broadcastRealtime("traffic-event.created", { id: "evt-test" });

assert(received.length === 1, "realtime bus did not publish one message");
assert(received[0].type === "traffic-event.created", "realtime bus did not preserve message type");
assert(received[0].payload.id === "evt-test", "realtime bus did not preserve payload");

const filesToCheck = [
  ["src/domains/wrongway/wrongway.service.js", ["traffic-event.created", "vehicle-track.updated"]],
  ["src/domains/events/events.service.js", ["traffic-event.updated"]],
  ["src/domains/control-board/controlBoard.service.js", ["control-command.created", "control-command.updated"]],
  ["src/domains/external-ingest/externalIngest.service.js", ["device-status.updated"]],
  ["src/realtime/websocket.js", ["client.ping()", 'ws.on("pong"', "clearInterval(heartbeat)"]],
];

filesToCheck.forEach(([relativePath, tokens]) => {
  const content = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  tokens.forEach((token) => {
    assert(content.includes(token), `${relativePath} is missing ${token}`);
  });
});

const mockLidarService = fs.readFileSync(
  path.join(__dirname, "..", "src", "domains", "mock-lidar", "mockLidar.service.js"),
  "utf8",
);
[
  "vehiclesPassed: 0",
  "unidentified: 0",
  "Dashboard event pipeline ready",
  "state.vehiclesPassed = 0",
  "state.unidentified = 0",
  "wrongWayHistory = []",
].forEach((token) => {
  assert(mockLidarService.includes(token), `mock lidar state must keep non-sample reset token: ${token}`);
});
[
  "vehiclesPassed: 12842",
  "unidentified: 24",
  "Mock pipeline ready",
].forEach((token) => {
  assert(!mockLidarService.includes(token), `mock lidar state must not expose sample token: ${token}`);
});

const frontendFilesToCheck = [
  ["dashboard/dashboard-web/src/shared/realtime/useRealtimeSocket.js", [
    "RECONNECT_DELAYS_MS",
    "setTimeout(connect, delay)",
    'enabled && url ? status : "DISABLED"',
    'setStatus("RECONNECTING")',
    "JSON.parse(event.data)",
  ]],
  ["dashboard/dashboard-web/src/pages/Dashboard/DashboardPage.jsx", ["useRealtimeSocket", "handleRealtimeMessage"]],
  ["dashboard/dashboard-web/src/pages/Devices/DevicesPage.jsx", ["useRealtimeSocket", "device-status.updated"]],
  ["dashboard/dashboard-web/src/pages/EventLog/EventLogPage.jsx", ["useRealtimeSocket", "traffic-event.created"]],
];

frontendFilesToCheck.forEach(([relativePath, tokens]) => {
  const content = fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
  tokens.forEach((token) => {
    assert(content.includes(token), `${relativePath} is missing ${token}`);
  });
});

console.log("realtime contracts ok");
