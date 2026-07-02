const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./controlBoard.controller");

const router = express.Router();

router.get("/control-board/status", controller.getStatus);
router.get("/control-board/commands", controller.listCommands);
router.post("/control-board/commands/test", requireAuth, controller.sendTestCommand);

module.exports = router;
