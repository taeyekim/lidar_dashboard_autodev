const { logger } = require("../../utils/logger");
const mockLidarService = require("../mock-lidar/mockLidar.service");
const wrongwayService = require("./wrongway.service");

async function receiveWrongWay(req, res) {
  try {
    const result = await wrongwayService.ingestWrongwayPayload(req.body || {}, {
      source: "WRONGWAY_API",
    });
    res.json(result);
  } catch (error) {
    logger.error("wrongway payload ingest failed", {
      status: error.status || 500,
      message: error.message,
    });
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to ingest wrongway payload.",
    });
  }
}

function getWrongWayHistory(req, res) {
  res.json(mockLidarService.getWrongWayHistory());
}

module.exports = {
  receiveWrongWay,
  getWrongWayHistory,
};
