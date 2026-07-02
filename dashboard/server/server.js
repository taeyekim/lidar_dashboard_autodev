const http = require("http");

const { app } = require("./src/app");
const { config } = require("./src/config");
const { initWebSocket } = require("./src/realtime/websocket");
const { setRealtimeBroadcaster } = require("./src/realtime/bus");
const { setBroadcaster } = require("./src/domains/mock-lidar/mockLidar.service");
const { startLidarSimulator } = require("./src/simulator/lidarSimulator");
const { logger } = require("./src/utils/logger");

const server = http.createServer(app);
const { broadcast } = initWebSocket(server);

setBroadcaster(broadcast);
setRealtimeBroadcaster(broadcast);
startLidarSimulator();

server.listen(config.port, "0.0.0.0", () => {
  logger.info("server started", {
    port: config.port,
    restUrl: `${config.dashboardBaseUrl}/api/state`,
    wsUrl: config.dashboardBaseUrl.replace(/^http/, "ws"),
    detectorBaseUrl: config.detectorBaseUrl,
  });
});
