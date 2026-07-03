const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./system.controller");

const router = express.Router();

router.get("/status", requireAuth, controller.getSystemStatus);

module.exports = router;
