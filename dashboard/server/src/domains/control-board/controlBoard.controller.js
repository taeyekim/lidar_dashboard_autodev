const { logger } = require("../../utils/logger");
const controlBoardService = require("./controlBoard.service");

function sendError(res, error, fallbackMessage) {
  logger.error("control board api failed", {
    status: error.status || 500,
    message: error.message,
  });
  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : fallbackMessage,
  });
}

async function getStatus(req, res) {
  try {
    res.json(await controlBoardService.getStatus());
  } catch (error) {
    sendError(res, error, "Failed to get control board status.");
  }
}

async function listCommands(req, res) {
  try {
    res.json(await controlBoardService.listCommands(req.query));
  } catch (error) {
    sendError(res, error, "Failed to list control board commands.");
  }
}

async function sendTestCommand(req, res) {
  try {
    const command = await controlBoardService.sendCommand(req.body?.commandType || "STAGE_1_ON", {
      requestedByUserId: req.user?.id || null,
      trigger: "MANUAL_TEST",
    });
    res.json({ ok: true, command });
  } catch (error) {
    sendError(res, error, "Failed to send control board test command.");
  }
}

module.exports = {
  getStatus,
  listCommands,
  sendTestCommand,
};
