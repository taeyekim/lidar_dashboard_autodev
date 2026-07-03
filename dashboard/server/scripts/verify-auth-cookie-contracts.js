const fs = require("fs");
const path = require("path");
const {
  buildAuthCookie,
  buildClearAuthCookie,
  buildClearCsrfCookie,
  buildCsrfCookie,
  createCsrfToken,
  parseCookies,
} = require("../src/domains/auth/auth.cookie");
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
const frontendConfig = readProjectFile("dashboard/dashboard-web/src/shared/api/config.js");
const authContext = readProjectFile("dashboard/dashboard-web/src/context/AuthContext.jsx");
const authApi = readProjectFile("dashboard/dashboard-web/src/features/auth/authApi.js");
const envExample = readProjectFile(".env.example");

[
  "credentials: true",
  "buildAuthCookie",
  "buildClearAuthCookie",
  "buildCsrfCookie",
  "buildClearCsrfCookie",
  "hasValidCsrfToken(req)",
  "getCsrfCookieToken(req)",
  "authMode: \"httpOnlyCookie\"",
  'router.post("/auth/logout", controller.logout)',
  "buildClearAuthCookie()",
  "buildClearCsrfCookie()",
  'credentials: "include"',
  '"X-CSRF-Token"',
].forEach((token) => {
  const haystack = `${app}\n${controller}\n${middleware}\n${service}\n${routes}\n${http}\n${frontendConfig}`;
  assertIncludes(haystack, token, "auth cookie implementation");
});

[
  "AUTH_COOKIE_NAME",
  "AUTH_CSRF_COOKIE_NAME",
  "VITE_AUTH_CSRF_COOKIE_NAME",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "AUTH_COOKIE_MAX_AGE_MS",
].forEach((token) => {
  assertIncludes(envExample, token, ".env.example");
});

assert(!authContext.includes("getAuthToken"), "AuthContext must not bootstrap from localStorage token");
assert(!authContext.includes("setAuthToken"), "AuthContext must not persist JWT token in localStorage");
assert(authContext.includes("logoutOperator"), "AuthContext must call the logout API before local logout cleanup");
assert(authApi.includes('postJson("/api/auth/logout", {})'), "frontend auth API must call POST /api/auth/logout");
assert(!http.includes("Authorization: `Bearer"), "frontend http client must not attach Bearer tokens");
assert(!http.includes("localStorage"), "frontend http client must not read or write auth tokens in localStorage");

const cookie = buildAuthCookie("jwt-token");
assert(cookie.includes("HttpOnly"), "auth cookie must be HttpOnly");
assert(cookie.includes("SameSite=Lax"), "auth cookie must default to SameSite=Lax");
assert(cookie.includes("Path=/"), "auth cookie must use root path");
assert(cookie.startsWith("lidar_dashboard_access="), "auth cookie must use the default name");

const clearCookie = buildClearAuthCookie();
assert(clearCookie.includes("Max-Age=0"), "clear auth cookie must expire immediately");

const csrfToken = createCsrfToken();
assert(csrfToken.length >= 32, "CSRF token must have enough entropy");
const csrfCookie = buildCsrfCookie(csrfToken);
assert(csrfCookie.startsWith("lidar_dashboard_csrf="), "CSRF cookie must use the default name");
assert(!csrfCookie.includes("HttpOnly"), "CSRF cookie must be readable by the frontend");
assert(csrfCookie.includes("SameSite=Lax"), "CSRF cookie must default to SameSite=Lax");

const clearCsrfCookie = buildClearCsrfCookie();
assert(clearCsrfCookie.includes("Max-Age=0"), "clear CSRF cookie must expire immediately");

const parsed = parseCookies(`lidar_dashboard_access=jwt-token; lidar_dashboard_csrf=${csrfToken}; other=value`);
assert(parsed.lidar_dashboard_access === "jwt-token", "parseCookies must read auth cookie value");
assert(parsed.lidar_dashboard_csrf === csrfToken, "parseCookies must read CSRF cookie value");

const authLogin = swaggerSpec.components?.schemas?.AuthLoginResponse;
assert(authLogin?.properties?.authMode, "Swagger AuthLoginResponse must expose authMode");
assert(!authLogin?.properties?.token, "Swagger AuthLoginResponse must not expose token");
assert(swaggerSpec.components?.securitySchemes?.cookieAuth?.in === "cookie", "Swagger must define cookieAuth");
assert(
  swaggerSpec.components?.securitySchemes?.csrfHeaderAuth?.name === "X-CSRF-Token",
  "Swagger must define CSRF header security",
);
assert(swaggerSpec.paths?.["/api/auth/logout"]?.post, "Swagger must document POST /api/auth/logout");
assert(
  swaggerSpec.paths?.["/api/auth/logout"]?.post?.responses?.[200]?.headers?.["Set-Cookie"],
  "Swagger logout response must document cookie clearing Set-Cookie headers",
);
assert(
  swaggerSpec.paths?.["/api/auth/logout"]?.post?.responses?.[200]?.content?.["application/json"]?.schema?.$ref ===
    "#/components/schemas/OkResponse",
  "Swagger logout response must use OkResponse",
);

console.log("auth cookie contracts ok");
