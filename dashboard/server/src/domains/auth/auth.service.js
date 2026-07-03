const { prisma } = require("../../prisma/client");
const { signUserToken } = require("./token");
const { verifyPassword } = require("./password");

function createUnauthorized(message = "Invalid user ID or password.") {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    userId: user.userId,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt instanceof Date ? user.lastLoginAt.toISOString() : user.lastLoginAt,
  };
}

async function login({ userId, password }) {
  if (!userId || !password) {
    throw createUnauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { userId: String(userId) },
  });

  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    throw createUnauthorized();
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    ok: true,
    token: signUserToken(updatedUser),
    authMode: "httpOnlyCookie",
    user: serializeUser(updatedUser),
  };
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user || !user.isActive) {
    throw createUnauthorized("User is inactive or no longer exists.");
  }

  return serializeUser(user);
}

module.exports = {
  login,
  getUserById,
  serializeUser,
};
