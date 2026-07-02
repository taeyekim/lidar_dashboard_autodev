const { hashPassword, verifyPassword } = require("../src/domains/auth/password");
const { signUserToken, verifyUserToken } = require("../src/domains/auth/token");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const hash = hashPassword("operator-secret");
assert(verifyPassword("operator-secret", hash), "password hash should verify");
assert(!verifyPassword("wrong-secret", hash), "wrong password should not verify");

const token = signUserToken({
  id: "user-smoke",
  userId: "operator",
  role: "SUPER_ADMIN",
  name: "Operator",
});
const payload = verifyUserToken(token);
assert(payload.sub === "user-smoke", "token subject mismatch");
assert(payload.userId === "operator", "token userId mismatch");
assert(payload.role === "SUPER_ADMIN", "token role mismatch");

console.log("auth crypto vectors ok");
