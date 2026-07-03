const authService = require("./auth.service");
const crypto = require("crypto");
const { getAuthCookieToken, getCsrfCookieToken } = require("./auth.cookie");
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

function sendForbidden(res, message = "CSRF token required.") {
  return res.status(403).json({ ok: false, error: message });
}

function isMutationRequest(req) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase());
}

function sameToken(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidCsrfToken(req) {
  return sameToken(req.get("x-csrf-token"), getCsrfCookieToken(req));
}

async function requireAuth(req, res, next) {
  try {
    const cookieToken = getAuthCookieToken(req);
    const bearerToken = getBearerToken(req);
    const token = cookieToken || bearerToken;
    if (!token) return sendUnauthorized(res);
    if (cookieToken && isMutationRequest(req) && !hasValidCsrfToken(req)) return sendForbidden(res);

    const payload = verifyUserToken(token);
    req.auth = payload;
    req.authMode = cookieToken ? "cookie" : "bearer";
    req.user = await authService.getUserById(payload.sub);
    return next();
  } catch {
    return sendUnauthorized(res, "Invalid or expired token.");
  }
}

module.exports = {
  hasValidCsrfToken,
  requireAuth,
};
