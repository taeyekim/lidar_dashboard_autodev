const { logger } = require("../../utils/logger");
const eventsService = require("./events.service");

function sendError(res, error, fallbackMessage) {
  logger.error("events api failed", {
    status: error.status || 500,
    message: error.message,
  });
  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : fallbackMessage,
  });
}

async function listEvents(req, res) {
  try {
    res.json(await eventsService.listEvents(req.query));
  } catch (error) {
    sendError(res, error, "Failed to list events.");
  }
}

async function getRecentEvents(req, res) {
  try {
    res.json(await eventsService.getRecentEvents(req.query));
  } catch (error) {
    sendError(res, error, "Failed to list recent events.");
  }
}

async function getSummary(req, res) {
  try {
    res.json(await eventsService.getSummary());
  } catch (error) {
    sendError(res, error, "Failed to summarize events.");
  }
}

async function getEventById(req, res) {
  try {
    const event = await eventsService.getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ ok: false, error: "Event not found." });
      return;
    }
    res.json({ ok: true, event });
  } catch (error) {
    sendError(res, error, "Failed to get event.");
  }
}

async function updateEventStatus(req, res) {
  try {
    const event = await eventsService.updateEventStatus(
      req.params.id,
      req.body?.status,
      req.body?.message,
    );
    if (!event) {
      res.status(404).json({ ok: false, error: "Event not found." });
      return;
    }
    res.json({ ok: true, event });
  } catch (error) {
    sendError(res, error, "Failed to update event status.");
  }
}

async function updateEventMemo(req, res) {
  try {
    const log = await eventsService.updateEventMemo(req.params.id, req.body?.memo);
    if (!log) {
      res.status(404).json({ ok: false, error: "Event not found." });
      return;
    }
    res.json({ ok: true, log });
  } catch (error) {
    sendError(res, error, "Failed to update event memo.");
  }
}

async function getEventLogs(req, res) {
  try {
    const logs = await eventsService.getEventLogs(req.params.id, req.query);
    if (!logs) {
      res.status(404).json({ ok: false, error: "Event not found." });
      return;
    }
    res.json(logs);
  } catch (error) {
    sendError(res, error, "Failed to list event logs.");
  }
}

module.exports = {
  listEvents,
  getRecentEvents,
  getSummary,
  getEventById,
  updateEventStatus,
  updateEventMemo,
  getEventLogs,
};
