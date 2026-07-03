const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./mockLidar.controller");

const router = express.Router();

router.get("/state", requireAuth, controller.getState);
router.get("/control/status", requireAuth, controller.getControlStatus);
router.get("/logs", requireAuth, controller.getLogs);

router.post("/gate/open", requireAuth, controller.openGate);
router.post("/gate/close", requireAuth, controller.closeGate);
router.post("/vms", requireAuth, controller.setVms);
router.post("/vehicle/pass", requireAuth, controller.passVehicle);

module.exports = router;
