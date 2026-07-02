const express = require("express");
const controller = require("./auth.controller");
const { requireAuth } = require("./auth.middleware");

const router = express.Router();

router.post("/auth/login", controller.login);
router.get("/auth/me", requireAuth, controller.me);
router.post("/auth/logout", requireAuth, controller.logout);

module.exports = router;
