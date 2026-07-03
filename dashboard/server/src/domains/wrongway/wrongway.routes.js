const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireDeviceIngestKey } = require("../../middleware/security");
const controller = require("./wrongway.controller");

const router = express.Router();

router.post("/wrongway", requireDeviceIngestKey, controller.receiveWrongWay);
router.get("/wrongway/history", requireAuth, controller.getWrongWayHistory);

module.exports = router;
