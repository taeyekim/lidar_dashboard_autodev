const express = require("express");
const { requireDeviceIngestKey } = require("../../middleware/security");
const controller = require("./wrongway.controller");

const router = express.Router();

router.post("/wrongway", requireDeviceIngestKey, controller.receiveWrongWay);
router.get("/wrongway/history", controller.getWrongWayHistory);

module.exports = router;
