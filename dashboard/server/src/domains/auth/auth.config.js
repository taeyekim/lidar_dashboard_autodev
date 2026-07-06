const { ENV_DEFAULTS, ENV_KEYS, envBoolean, envInteger, envString } = require("../../config/env");

function getAuthConfig() {
  const cookieSameSite = envString(ENV_KEYS.AUTH_COOKIE_SAMESITE, ENV_DEFAULTS.AUTH_COOKIE_SAMESITE).toLowerCase();
  const normalizedSameSite = ["lax", "strict", "none"].includes(cookieSameSite) ? cookieSameSite : "lax";
  const explicitSecure = envBoolean(ENV_KEYS.AUTH_COOKIE_SECURE, ENV_DEFAULTS.AUTH_COOKIE_SECURE);

  return {
    jwtSecret: envString(ENV_KEYS.JWT_SECRET, ENV_DEFAULTS.JWT_SECRET),
    jwtExpiresIn: envString(ENV_KEYS.JWT_EXPIRES_IN, ENV_DEFAULTS.JWT_EXPIRES_IN),
    cookieName: envString(ENV_KEYS.AUTH_COOKIE_NAME, ENV_DEFAULTS.AUTH_COOKIE_NAME),
    csrfCookieName: envString(ENV_KEYS.AUTH_CSRF_COOKIE_NAME, ENV_DEFAULTS.AUTH_CSRF_COOKIE_NAME),
    cookieSecure: explicitSecure || normalizedSameSite === "none",
    cookieSameSite: normalizedSameSite,
    cookieMaxAgeMs: envInteger(ENV_KEYS.AUTH_COOKIE_MAX_AGE_MS, ENV_DEFAULTS.AUTH_COOKIE_MAX_AGE_MS, { min: 1 }),
  };
}

module.exports = {
  getAuthConfig,
};
