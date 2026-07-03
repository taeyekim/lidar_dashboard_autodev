const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.join(__dirname, "..", "..", "..");
const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
const nginxTemplate = fs.readFileSync(
  path.join(root, "deploy", "nginx", "templates", "default.conf.template"),
  "utf8",
);
const frontendConfig = fs.readFileSync(
  path.join(root, "dashboard", "dashboard-web", "src", "shared", "api", "config.js"),
  "utf8",
);
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const runtimeSmoke = fs.readFileSync(path.join(root, "scripts", "runtime-smoke.ps1"), "utf8");

assert(
  compose.includes("VITE_WS_BASE_URL: ws://${PUBLIC_HOST:-localhost}:${NGINX_PORT:-8080}/ws"),
  "docker-compose.yml must expose the browser WebSocket URL through /ws",
);
assert(nginxTemplate.includes("location /ws"), "Nginx template must route /ws to the backend");
assert(
  nginxTemplate.includes("limit_req_zone $binary_remote_addr zone=wrongway_ingest") &&
    nginxTemplate.includes("limit_req_status 429") &&
    nginxTemplate.includes("location = /api/wrongway") &&
    nginxTemplate.includes("limit_req zone=wrongway_ingest"),
  "Nginx template must rate-limit the public /api/wrongway ingest endpoint with HTTP 429",
);
assert(
  nginxTemplate.includes("allow ${NGINX_SWAGGER_ALLOW}") && nginxTemplate.includes("deny all"),
  "Nginx template must expose a Swagger allowlist control",
);
assert(
  nginxTemplate.includes("location = /api-docs") &&
    nginxTemplate.includes("location /api-docs/") &&
    nginxTemplate.includes("location = /api-docs.json"),
  "Nginx template must route exact Swagger UI and JSON paths through the backend allowlist",
);
assert(
  nginxTemplate.includes('add_header Content-Security-Policy "${NGINX_CONTENT_SECURITY_POLICY}" always') &&
    nginxTemplate.includes('add_header X-Permitted-Cross-Domain-Policies "none" always'),
  "Nginx template must emit delivery security headers for CSP and cross-domain policy",
);
assert(
  nginxTemplate.includes("proxy_set_header Upgrade $http_upgrade") &&
    nginxTemplate.includes("proxy_set_header Connection $connection_upgrade"),
  "Nginx template must preserve WebSocket upgrade headers",
);
assert(
  nginxTemplate.includes("location /assets/") &&
    nginxTemplate.includes('add_header Cache-Control "public, max-age=2592000, immutable" always') &&
    nginxTemplate.includes("expires 30d"),
  "Nginx template must cache hashed frontend assets with an immutable policy",
);
assert(
  nginxTemplate.includes('add_header Cache-Control "no-store" always'),
  "Nginx template must keep the SPA entrypoint uncached",
);
assert(
  runtimeSmoke.includes("SPA cache header smoke") &&
    runtimeSmoke.includes("frontend asset cache header smoke") &&
    runtimeSmoke.includes("Swagger UI path smoke") &&
    runtimeSmoke.includes("max-age=2592000") &&
    runtimeSmoke.includes("immutable"),
  "Runtime smoke must verify Swagger UI routing, SPA no-store, and immutable frontend asset cache headers",
);
assert(
  frontendConfig.includes("`ws://${API_HOST}:${API_PORT}/ws`"),
  "frontend default WS_BASE must use /ws",
);
assert(
  envExample.includes("VITE_WS_BASE_URL=ws://localhost:5000/ws"),
  ".env.example must document the direct backend WebSocket URL with /ws",
);
assert(
  envExample.includes("NGINX_WRONGWAY_RATE_LIMIT=30r/s") &&
    envExample.includes("NGINX_WRONGWAY_BURST=60") &&
    envExample.includes("NGINX_SWAGGER_ALLOW=all") &&
    envExample.includes("NGINX_CONTENT_SECURITY_POLICY="),
  ".env.example must document Nginx wrongway rate limit, Swagger allowlist, and CSP knobs",
);

console.log("delivery proxy contracts ok");
