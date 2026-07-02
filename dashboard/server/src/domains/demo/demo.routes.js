const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./demo.controller");

const router = express.Router();

router.post("/demo/start", requireAuth, controller.startDemo);
router.post("/demo/reset", requireAuth, controller.resetDemo);

module.exports = router;
