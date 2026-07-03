const http = require("http");
const authService = require("../src/domains/auth/auth.service");
const { signUserToken } = require("../src/domains/auth/token");
const { app } = require("../src/app");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const testUser = {
  id: "runtime-auth-user",
  userId: "operator",
  name: "Runtime Operator",
  role: "ADMIN",
  isActive: true,
  lastLoginAt: "2026-07-03T00:00:00.000Z",
};

authService.login = async ({ userId, password }) => {
  if (userId !== "operator" || password !== "password") {
    const error = new Error("Invalid user ID or password.");
    error.status = 401;
    throw error;
  }

  return {
    ok: true,
    token: signUserToken(testUser),
    authMode: "httpOnlyCookie",
    user: testUser,
  };
};

authService.getUserById = async (id) => {
  if (id !== testUser.id) {
    const error = new Error("User is inactive or no longer exists.");
    error.status = 401;
    throw error;
  }
  return testUser;
};

function request(server, options = {}) {
  const address = server.address();
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        method: options.method || "GET",
        path: options.path,
        headers: {
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieHeader(setCookieHeaders = []) {
  return setCookieHeaders.map((cookie) => cookie.split(";")[0]).join("; ");
}

function getCookieValue(setCookieHeaders = [], name) {
  const prefix = `${name}=`;
  const cookie = setCookieHeaders.find((item) => item.startsWith(prefix));
  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(prefix.length).split(";")[0]);
}

async function main() {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });

  try {
    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { userId: "operator", password: "password" },
    });

    assert(login.status === 200, "login must return 200");
    assert(login.json?.ok === true, "login response must be successful");
    assert(login.json?.authMode === "httpOnlyCookie", "login response must advertise HttpOnly cookie auth mode");
    assert(!Object.prototype.hasOwnProperty.call(login.json || {}, "token"), "login response body must not expose JWT token");

    const setCookie = login.headers["set-cookie"] || [];
    assert(setCookie.length === 2, "login must set auth and CSRF cookies");
    const authCookie = setCookie.find((cookie) => cookie.startsWith("lidar_dashboard_access="));
    const csrfCookie = setCookie.find((cookie) => cookie.startsWith("lidar_dashboard_csrf="));
    assert(authCookie, "login must set lidar_dashboard_access cookie");
    assert(csrfCookie, "login must set lidar_dashboard_csrf cookie");
    assert(authCookie.includes("HttpOnly"), "auth cookie must be HttpOnly");
    assert(!csrfCookie.includes("HttpOnly"), "CSRF cookie must be readable by the frontend");
    assert(authCookie.includes("SameSite=Lax"), "auth cookie must default to SameSite=Lax");
    assert(csrfCookie.includes("SameSite=Lax"), "CSRF cookie must default to SameSite=Lax");

    const cookies = cookieHeader(setCookie);
    const csrfToken = getCookieValue(setCookie, "lidar_dashboard_csrf");
    const bearerToken = getCookieValue(setCookie, "lidar_dashboard_access");

    const meWithCookie = await request(server, {
      path: "/api/auth/me",
      headers: { Cookie: cookies },
    });
    assert(meWithCookie.status === 200, "cookie-authenticated /api/auth/me must return 200");
    assert(meWithCookie.json?.user?.userId === "operator", "cookie-authenticated /api/auth/me must return operator");

    const meWithBearer = await request(server, {
      path: "/api/auth/me",
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    assert(meWithBearer.status === 200, "Bearer-compatible /api/auth/me must return 200");

    const protectedReadPaths = [
      "/api/database/health",
      "/api/status",
      "/api/events/recent",
      "/api/events/summary",
      "/api/statistics/traffic?range=daily",
      "/api/control-board/status",
      "/api/control-board/commands",
      "/api/sites",
      "/api/zones",
      "/api/devices/status",
      "/api/wrongway/history",
      "/api/state",
      "/api/control/status",
      "/api/logs",
    ];
    for (const path of protectedReadPaths) {
      const unauthenticatedRead = await request(server, { path });
      assert(unauthenticatedRead.status === 401, `${path} must require operator authentication`);
    }

    const missingCsrf = await request(server, {
      method: "POST",
      path: "/api/control-board/commands/test",
      headers: { Cookie: cookies },
      body: { commandType: "STAGE_1_ON" },
    });
    assert(missingCsrf.status === 403, "cookie-authenticated mutation without CSRF must return 403");

    const invalidCsrf = await request(server, {
      method: "POST",
      path: "/api/control-board/commands/test",
      headers: { Cookie: cookies, "X-CSRF-Token": "wrong-token" },
      body: { commandType: "STAGE_1_ON" },
    });
    assert(invalidCsrf.status === 403, "cookie-authenticated mutation with invalid CSRF must return 403");

    assert(csrfToken && csrfToken.length >= 32, "login CSRF cookie must contain a high-entropy token");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main()
  .then(() => {
    console.log("auth runtime contracts ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
