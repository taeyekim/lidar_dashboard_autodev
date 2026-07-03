const { getAuthConfig } = require("./auth.config");

function encodeCookieValue(value) {
  return encodeURIComponent(String(value));
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeCookieValue(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = String(options.sameSite);
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1).toLowerCase()}`);
  }

  return parts.join("; ");
}

function authCookieOptions() {
  const config = getAuthConfig();
  const maxAgeMs = Number.isFinite(config.cookieMaxAgeMs) && config.cookieMaxAgeMs > 0
    ? config.cookieMaxAgeMs
    : 8 * 60 * 60 * 1000;

  return {
    name: config.cookieName,
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAgeSeconds: Math.floor(maxAgeMs / 1000),
  };
}

function buildAuthCookie(token) {
  const options = authCookieOptions();
  return serializeCookie(options.name, token, {
    maxAge: options.maxAgeSeconds,
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  });
}

function buildClearAuthCookie() {
  const options = authCookieOptions();
  return serializeCookie(options.name, "", {
    maxAge: 0,
    expires: new Date(0),
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  });
}

function parseCookies(header = "") {
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex < 0) return cookies;
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function getAuthCookieToken(req) {
  const { name } = authCookieOptions();
  return parseCookies(req.headers?.cookie || "")[name] || null;
}

module.exports = {
  authCookieOptions,
  buildAuthCookie,
  buildClearAuthCookie,
  getAuthCookieToken,
  parseCookies,
};
