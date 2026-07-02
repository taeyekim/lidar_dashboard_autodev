const authService = require("./auth.service");
const { verifyUserToken } = require("./token");

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function sendUnauthorized(res, message = "Authentication required.") {
  return res.status(401).json({ ok: false, error: message });
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return sendUnauthorized(res);

    const payload = verifyUserToken(token);
    req.auth = payload;
    req.user = await authService.getUserById(payload.sub);
    return next();
  } catch {
    return sendUnauthorized(res, "Invalid or expired token.");
  }
}

module.exports = {
  requireAuth,
};
