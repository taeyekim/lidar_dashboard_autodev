const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const controller = require("./events.controller");

const router = express.Router();

router.get("/events/recent", requireAuth, controller.getRecentEvents);
router.get("/events/summary", requireAuth, controller.getSummary);
router.get("/events/:id/logs", requireAuth, controller.getEventLogs);
router.get("/events/:id", requireAuth, controller.getEventById);
router.get("/events", requireAuth, controller.listEvents);
router.patch("/events/:id/status", requireAuth, controller.updateEventStatus);
router.patch("/events/:id/memo", requireAuth, controller.updateEventMemo);

module.exports = router;
