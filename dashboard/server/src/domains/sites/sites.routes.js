const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./sites.controller");

const router = express.Router();

router.get("/sites", requireAuth, controller.listSites);
router.get("/zones", requireAuth, controller.listZones);
router.get("/devices/status", requireAuth, controller.getDeviceStatusSummary);
router.get("/devices", requireAuth, controller.listDevices);

module.exports = router;
