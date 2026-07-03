const { logger } = require("../../utils/logger");
const authService = require("./auth.service");
const { buildAuthCookie, buildClearAuthCookie } = require("./auth.cookie");

function sendError(res, error, fallbackMessage) {
  logger.warn("auth api failed", {
    status: error.status || 500,
    message: error.message,
  });

  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : fallbackMessage,
  });
}

async function login(req, res) {
  try {
    const result = await authService.login(req.body || {});
    res.setHeader("Set-Cookie", buildAuthCookie(result.token));
    const { token, ...response } = result;
    res.json(response);
  } catch (error) {
    sendError(res, error, "Failed to login.");
  }
}

async function me(req, res) {
  res.json({
    ok: true,
    user: req.user,
  });
}

async function logout(req, res) {
  res.setHeader("Set-Cookie", buildClearAuthCookie());
  res.json({ ok: true });
}

module.exports = {
  login,
  me,
  logout,
};
