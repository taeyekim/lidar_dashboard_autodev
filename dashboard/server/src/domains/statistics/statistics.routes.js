const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./statistics.controller");

const router = express.Router();

router.get("/statistics/traffic", requireAuth, controller.getTrafficStatistics);

module.exports = router;
