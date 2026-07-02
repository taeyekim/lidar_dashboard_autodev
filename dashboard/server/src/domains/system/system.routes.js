const express = require("express");
const controller = require("./system.controller");

const router = express.Router();

router.get("/status", controller.getSystemStatus);

module.exports = router;
