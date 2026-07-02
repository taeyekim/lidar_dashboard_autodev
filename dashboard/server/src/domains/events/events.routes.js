const express = require("express");
const controller = require("./events.controller");

const router = express.Router();

router.get("/events/recent", controller.getRecentEvents);
router.get("/events/summary", controller.getSummary);
router.get("/events/:id/logs", controller.getEventLogs);
router.get("/events/:id", controller.getEventById);
router.get("/events", controller.listEvents);
router.patch("/events/:id/status", controller.updateEventStatus);
router.patch("/events/:id/memo", controller.updateEventMemo);

module.exports = router;
