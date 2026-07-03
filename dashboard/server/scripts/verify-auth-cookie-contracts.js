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
const { getAuthConfig } = require("../src/domains/auth/auth.config");
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

function assertAscii(content, label) {
  assert(/^[\x00-\x7F]*$/.test(content), `${label} must not contain mojibake or non-ASCII copy`);
}

const app = readProjectFile("dashboard/server/src/app.js");
const controller = readProjectFile("dashboard/server/src/domains/auth/auth.controller.js");
const middleware = readProjectFile("dashboard/server/src/domains/auth/auth.middleware.js");
const service = readProjectFile("dashboard/server/src/domains/auth/auth.service.js");
const routes = readProjectFile("dashboard/server/src/domains/auth/auth.routes.js");
const databaseRoutes = readProjectFile("dashboard/server/src/domains/database/database.routes.js");
const systemRoutes = readProjectFile("dashboard/server/src/domains/system/system.routes.js");
const sitesRoutes = readProjectFile("dashboard/server/src/domains/sites/sites.routes.js");
const eventsRoutes = readProjectFile("dashboard/server/src/domains/events/events.routes.js");
const statisticsRoutes = readProjectFile("dashboard/server/src/domains/statistics/statistics.routes.js");
const controlBoardRoutes = readProjectFile("dashboard/server/src/domains/control-board/controlBoard.routes.js");
const wrongwayRoutes = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.routes.js");
const mockLidarRoutes = readProjectFile("dashboard/server/src/domains/mock-lidar/mockLidar.routes.js");
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
  'router.post("/auth/logout", requireAuth, controller.logout)',
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
assertAscii(http, "frontend http client");
assertAscii(frontendConfig, "frontend API config");

[
  [databaseRoutes, 'router.get("/database/health", requireAuth', "database health route"],
  [systemRoutes, 'router.get("/status", requireAuth', "system status route"],
  [sitesRoutes, 'router.get("/sites", requireAuth', "sites route"],
  [sitesRoutes, 'router.get("/zones", requireAuth', "zones route"],
  [sitesRoutes, 'router.get("/devices/status", requireAuth', "device status route"],
  [sitesRoutes, 'router.get("/devices", requireAuth', "devices route"],
  [eventsRoutes, 'router.get("/events/recent", requireAuth', "recent events route"],
  [eventsRoutes, 'router.get("/events/summary", requireAuth', "event summary route"],
  [eventsRoutes, 'router.get("/events/:id/logs", requireAuth', "event logs route"],
  [eventsRoutes, 'router.get("/events/:id", requireAuth', "event detail route"],
  [eventsRoutes, 'router.get("/events", requireAuth', "events route"],
  [statisticsRoutes, 'router.get("/statistics/traffic", requireAuth', "statistics route"],
  [controlBoardRoutes, 'router.get("/control-board/status", requireAuth', "control-board status route"],
  [controlBoardRoutes, 'router.get("/control-board/commands", requireAuth', "control-board command list route"],
  [wrongwayRoutes, 'router.get("/wrongway/history", requireAuth', "wrongway history route"],
  [mockLidarRoutes, 'router.get("/state", requireAuth', "mock dashboard state route"],
  [mockLidarRoutes, 'router.get("/control/status", requireAuth', "mock control status route"],
  [mockLidarRoutes, 'router.get("/logs", requireAuth', "mock dashboard logs route"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

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

const originalSameSite = process.env.AUTH_COOKIE_SAMESITE;
const originalSecure = process.env.AUTH_COOKIE_SECURE;
process.env.AUTH_COOKIE_SAMESITE = "none";
process.env.AUTH_COOKIE_SECURE = "false";
try {
  const noneConfig = getAuthConfig();
  assert(noneConfig.cookieSameSite === "none", "AUTH_COOKIE_SAMESITE=none must be preserved");
  assert(noneConfig.cookieSecure === true, "SameSite=None must force Secure cookies");
  const noneCookie = buildAuthCookie("jwt-token");
  assert(noneCookie.includes("SameSite=None"), "SameSite=None auth cookie must serialize correctly");
  assert(noneCookie.includes("Secure"), "SameSite=None auth cookie must include Secure");
} finally {
  if (originalSameSite === undefined) delete process.env.AUTH_COOKIE_SAMESITE;
  else process.env.AUTH_COOKIE_SAMESITE = originalSameSite;
  if (originalSecure === undefined) delete process.env.AUTH_COOKIE_SECURE;
  else process.env.AUTH_COOKIE_SECURE = originalSecure;
}

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
  swaggerSpec.paths?.["/api/auth/logout"]?.post?.security?.some(
    (item) => Array.isArray(item.cookieAuth) && Array.isArray(item.csrfHeaderAuth),
  ),
  "Swagger logout operation must require cookieAuth plus csrfHeaderAuth",
);
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
