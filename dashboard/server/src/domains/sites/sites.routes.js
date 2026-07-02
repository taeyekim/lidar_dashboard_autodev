const express = require("express");
const controller = require("./sites.controller");

const router = express.Router();

router.get("/sites", controller.listSites);
router.get("/zones", controller.listZones);
router.get("/devices/status", controller.getDeviceStatusSummary);
router.get("/devices", controller.listDevices);

module.exports = router;
