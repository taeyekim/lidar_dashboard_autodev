const express = require("express");
const controller = require("./controlBoard.controller");

const router = express.Router();

router.get("/control-board/status", controller.getStatus);
router.get("/control-board/commands", controller.listCommands);
router.post("/control-board/commands/test", controller.sendTestCommand);

module.exports = router;
