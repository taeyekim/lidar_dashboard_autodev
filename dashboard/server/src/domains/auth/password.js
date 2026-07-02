const crypto = require("crypto");

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;
const HASH_PREFIX = "pbkdf2_sha256";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(String(password), salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString("hex");
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;

  const [prefix, iterationsText, salt, expectedHash] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !salt || !expectedHash) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const actualHash = crypto
    .pbkdf2Sync(String(password), salt, iterations, Buffer.from(expectedHash, "hex").length, HASH_ALGORITHM)
    .toString("hex");

  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
