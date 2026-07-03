const express = require("express");
const controller = require("./statistics.controller");

const router = express.Router();

router.get("/statistics/traffic", controller.getTrafficStatistics);

module.exports = router;
