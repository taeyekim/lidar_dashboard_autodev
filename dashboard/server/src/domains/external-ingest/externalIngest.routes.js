const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireDeviceIngestKey } = require("../../middleware/security");
const controller = require("./externalIngest.controller");

// Mounted under /api. These routes cover device ingest and operator diagnostics.
const router = express.Router();

// Device ingest endpoints are optionally protected by X-Device-Key when configured.
router.post("/ingest/lidar", requireDeviceIngestKey, controller.receiveLidar);
router.post("/ingest/lidar/mock", requireDeviceIngestKey, controller.receiveLidarMock);
router.post("/ingest/control-board", requireDeviceIngestKey, controller.receiveControlBoard);
router.post("/ingest/control-board/mock", requireDeviceIngestKey, controller.receiveControlBoardMock);
router.post("/ingest/control-board/tcp/test", requireDeviceIngestKey, controller.testControlBoardTcp);
router.post("/ingest/control-board/serial/test", requireDeviceIngestKey, controller.testControlBoardSerial);
router.get("/ingest/status", requireAuth, controller.getIngestStatus);
router.get("/ingest/events/recent", requireAuth, controller.getRecentEvents);

module.exports = router;
