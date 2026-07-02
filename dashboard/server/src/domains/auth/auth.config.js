function getAuthConfig() {
  return {
    jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  };
}

module.exports = {
  getAuthConfig,
};
