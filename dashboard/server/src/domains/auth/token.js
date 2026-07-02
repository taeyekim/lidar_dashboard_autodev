const jwt = require("jsonwebtoken");
const { getAuthConfig } = require("./auth.config");

function signUserToken(user) {
  const config = getAuthConfig();
  return jwt.sign(
    {
      sub: user.id,
      userId: user.userId,
      role: user.role,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

function verifyUserToken(token) {
  const config = getAuthConfig();
  return jwt.verify(token, config.jwtSecret);
}

module.exports = {
  signUserToken,
  verifyUserToken,
};
