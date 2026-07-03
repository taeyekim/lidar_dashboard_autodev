const fs = require("fs");
const path = require("path");
const { buildAuthCookie, buildClearAuthCookie, parseCookies } = require("../src/domains/auth/auth.cookie");
const swaggerSpec = require("../src/swagger");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const app = readProjectFile("dashboard/server/src/app.js");
const controller = readProjectFile("dashboard/server/src/domains/auth/auth.controller.js");
const middleware = readProjectFile("dashboard/server/src/domains/auth/auth.middleware.js");
const service = readProjectFile("dashboard/server/src/domains/auth/auth.service.js");
const routes = readProjectFile("dashboard/server/src/domains/auth/auth.routes.js");
const http = readProjectFile("dashboard/dashboard-web/src/shared/api/http.js");
const authContext = readProjectFile("dashboard/dashboard-web/src/context/AuthContext.jsx");
const envExample = readProjectFile(".env.example");

[
  "credentials: true",
  "buildAuthCookie",
  "buildClearAuthCookie",
  "getAuthCookieToken(req) || getBearerToken(req)",
  "authMode: \"httpOnlyCookie\"",
  'router.post("/auth/logout", controller.logout)',
  'credentials: "include"',
].forEach((token) => {
  const haystack = `${app}\n${controller}\n${middleware}\n${service}\n${routes}\n${http}`;
  assertIncludes(haystack, token, "auth cookie implementation");
});

["AUTH_COOKIE_NAME", "AUTH_COOKIE_SECURE", "AUTH_COOKIE_SAMESITE", "AUTH_COOKIE_MAX_AGE_MS"].forEach((token) => {
  assertIncludes(envExample, token, ".env.example");
});

assert(!authContext.includes("getAuthToken"), "AuthContext must not bootstrap from localStorage token");
assert(!authContext.includes("setAuthToken"), "AuthContext must not persist JWT token in localStorage");
assert(!http.includes("Authorization: `Bearer"), "frontend http client must not attach Bearer tokens");
assert(!http.includes("localStorage"), "frontend http client must not read or write auth tokens in localStorage");

const cookie = buildAuthCookie("jwt-token");
assert(cookie.includes("HttpOnly"), "auth cookie must be HttpOnly");
assert(cookie.includes("SameSite=Lax"), "auth cookie must default to SameSite=Lax");
assert(cookie.includes("Path=/"), "auth cookie must use root path");
assert(cookie.startsWith("lidar_dashboard_access="), "auth cookie must use the default name");

const clearCookie = buildClearAuthCookie();
assert(clearCookie.includes("Max-Age=0"), "clear auth cookie must expire immediately");

const parsed = parseCookies("lidar_dashboard_access=jwt-token; other=value");
assert(parsed.lidar_dashboard_access === "jwt-token", "parseCookies must read auth cookie value");

const authLogin = swaggerSpec.components?.schemas?.AuthLoginResponse;
assert(authLogin?.properties?.authMode, "Swagger AuthLoginResponse must expose authMode");
assert(!authLogin?.properties?.token, "Swagger AuthLoginResponse must not expose token");
assert(swaggerSpec.components?.securitySchemes?.cookieAuth?.in === "cookie", "Swagger must define cookieAuth");

console.log("auth cookie contracts ok");
