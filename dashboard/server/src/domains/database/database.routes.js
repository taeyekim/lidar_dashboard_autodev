const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { getDatabaseHealthController } = require("./database.controller");

const router = express.Router();

router.get("/database/health", requireAuth, getDatabaseHealthController);

module.exports = router;
