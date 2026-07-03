const http = require("http");

process.env.LOG_LEVEL = "error";

const authService = require("../src/domains/auth/auth.service");
const { buildAuthCookie, buildCsrfCookie, createCsrfToken } = require("../src/domains/auth/auth.cookie");
const { signUserToken } = require("../src/domains/auth/token");
const { app } = require("../src/app");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

authService.login = async () => {
  const error = new Error("Invalid user ID or password.");
  error.status = 401;
  throw error;
};

authService.getUserById = async (id) => ({
  id,
  userId: "operator",
  name: "Operator",
  role: "operator",
  isActive: true,
});

function request(server, options = {}) {
  const address = server.address();
  const body = options.body === undefined ? null : options.rawBody ? String(options.body) : JSON.stringify(options.body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        method: options.method || "GET",
        path: options.path,
        headers: {
          ...(body !== null && !options.skipContentType ? { "Content-Type": options.contentType || "application/json" } : {}),
          ...(body !== null ? { "Content-Length": Buffer.byteLength(body) } : {}),
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
            json,
            text,
          });
        });
      },
    );

    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

async function main() {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });

  try {
    const health = await request(server, { path: "/api/health" });
    assert(health.status === 200, "/api/health must return 200");
    assert(health.headers["x-content-type-options"] === "nosniff", "Express must emit X-Content-Type-Options: nosniff");
    assert(health.headers["x-frame-options"] === "SAMEORIGIN", "Express must emit X-Frame-Options: SAMEORIGIN");
    assert(
      health.headers["referrer-policy"] === "strict-origin-when-cross-origin",
      "Express must emit Referrer-Policy: strict-origin-when-cross-origin",
    );
    assert(
      health.headers["permissions-policy"] === "camera=(), microphone=(), geolocation=()",
      "Express must emit restrictive Permissions-Policy",
    );

    const nonJsonMutation = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      rawBody: true,
      body: "userId=operator&password=password",
      contentType: "application/x-www-form-urlencoded",
    });
    assert(nonJsonMutation.status === 415, "non-JSON API mutations must return 415");
    assert(nonJsonMutation.json?.ok === false, "non-JSON API mutation error must use the API error envelope");

    let rateLimited = null;
    for (let index = 0; index < 21; index += 1) {
      rateLimited = await request(server, {
        method: "POST",
        path: "/api/auth/login",
        body: { userId: `operator-${index}`, password: "wrong-password" },
      });
    }
    assert(rateLimited.status === 429, "login endpoint must return 429 after the configured rate-limit threshold");
    assert(rateLimited.headers["retry-after"], "rate-limited responses must include Retry-After");
    assert(rateLimited.json?.ok === false, "rate-limited responses must use the API error envelope");

    const token = signUserToken({ id: "runtime-user-1", userId: "operator", role: "operator", name: "Operator" });
    const csrfToken = createCsrfToken();
    const cookie = `${buildAuthCookie(token).split(";")[0]}; ${buildCsrfCookie(csrfToken).split(";")[0]}`;

    const logoutWithoutCsrf = await request(server, {
      method: "POST",
      path: "/api/auth/logout",
      body: {},
      headers: { Cookie: cookie },
    });
    assert(logoutWithoutCsrf.status === 403, "cookie-authenticated logout without CSRF must return 403");
    assert(logoutWithoutCsrf.json?.ok === false, "logout CSRF rejection must use the API error envelope");

    const logoutWithCsrf = await request(server, {
      method: "POST",
      path: "/api/auth/logout",
      body: {},
      headers: {
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
      },
    });
    assert(logoutWithCsrf.status === 200, "cookie-authenticated logout with CSRF must return 200");
    assert(logoutWithCsrf.json?.ok === true, "logout success must use the API success envelope");
    assert(
      String(logoutWithCsrf.headers["set-cookie"] || "").includes("Max-Age=0"),
      "logout success must clear auth and CSRF cookies",
    );

    const unauthenticatedIngestStatus = await request(server, { path: "/api/ingest/status" });
    assert(unauthenticatedIngestStatus.status === 401, "ingest status diagnostic endpoint must require operator auth");

    const unauthenticatedRecentIngest = await request(server, { path: "/api/ingest/events/recent" });
    assert(unauthenticatedRecentIngest.status === 401, "recent ingest diagnostic endpoint must require operator auth");

    const authenticatedIngestStatus = await request(server, {
      path: "/api/ingest/status",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(authenticatedIngestStatus.status === 200, "authenticated operator must be able to read ingest status diagnostics");
    assert(authenticatedIngestStatus.json?.ok === true, "ingest status diagnostics must use the API success envelope");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main()
  .then(() => {
    console.log("security runtime contracts ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
