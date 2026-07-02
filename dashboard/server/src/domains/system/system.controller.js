const { logger } = require("../../utils/logger");
const systemService = require("./system.service");

async function getSystemStatus(req, res) {
  try {
    res.json(await systemService.getSystemStatus());
  } catch (error) {
    logger.error("system status api failed", { error });
    res.status(500).json({ ok: false, error: "Failed to get system status." });
  }
}

module.exports = { getSystemStatus };
