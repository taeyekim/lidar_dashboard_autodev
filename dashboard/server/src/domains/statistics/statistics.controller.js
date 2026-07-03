const { logger } = require("../../utils/logger");
const statisticsService = require("./statistics.service");

function sendError(res, error, fallbackMessage) {
  logger.error("statistics api failed", {
    status: error.status || 500,
    message: error.message,
  });
  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : fallbackMessage,
  });
}

async function getTrafficStatistics(req, res) {
  try {
    res.json(await statisticsService.getTrafficStatistics(req.query));
  } catch (error) {
    sendError(res, error, "Failed to summarize traffic statistics.");
  }
}

module.exports = {
  getTrafficStatistics,
};
