function getAuthConfig() {
  const cookieSameSite = String(process.env.AUTH_COOKIE_SAMESITE || "lax").toLowerCase();

  return {
    jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    cookieName: process.env.AUTH_COOKIE_NAME || "lidar_dashboard_access",
    csrfCookieName: process.env.AUTH_CSRF_COOKIE_NAME || "lidar_dashboard_csrf",
    cookieSecure: String(process.env.AUTH_COOKIE_SECURE || "false").toLowerCase() === "true",
    cookieSameSite: ["lax", "strict", "none"].includes(cookieSameSite) ? cookieSameSite : "lax",
    cookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 8 * 60 * 60 * 1000),
  };
}

module.exports = {
  getAuthConfig,
};
