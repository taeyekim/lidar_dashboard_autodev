const { logger } = require("../../utils/logger");
const sitesService = require("./sites.service");

function sendError(res, error, fallbackMessage) {
  logger.error("sites api failed", {
    status: error.status || 500,
    message: error.message,
  });
  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : fallbackMessage,
  });
}

async function listSites(req, res) {
  try {
    res.json(await sitesService.listSites());
  } catch (error) {
    sendError(res, error, "Failed to list sites.");
  }
}

async function listZones(req, res) {
  try {
    res.json(await sitesService.listZones(req.query));
  } catch (error) {
    sendError(res, error, "Failed to list zones.");
  }
}

async function listDevices(req, res) {
  try {
    res.json(await sitesService.listDevices(req.query));
  } catch (error) {
    sendError(res, error, "Failed to list devices.");
  }
}

async function getDeviceStatusSummary(req, res) {
  try {
    res.json(await sitesService.getDeviceStatusSummary());
  } catch (error) {
    sendError(res, error, "Failed to summarize device status.");
  }
}

module.exports = {
  listSites,
  listZones,
  listDevices,
  getDeviceStatusSummary,
};
