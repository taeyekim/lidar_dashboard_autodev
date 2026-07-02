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

assert(
  compose.includes("VITE_WS_BASE_URL: ws://${PUBLIC_HOST:-localhost}:${NGINX_PORT:-8080}/ws"),
  "docker-compose.yml must expose the browser WebSocket URL through /ws",
);
assert(nginxTemplate.includes("location /ws"), "Nginx template must route /ws to the backend");
assert(
  nginxTemplate.includes("proxy_set_header Upgrade $http_upgrade") &&
    nginxTemplate.includes("proxy_set_header Connection $connection_upgrade"),
  "Nginx template must preserve WebSocket upgrade headers",
);
assert(
  frontendConfig.includes("`ws://${API_HOST}:${API_PORT}/ws`"),
  "frontend default WS_BASE must use /ws",
);

console.log("delivery proxy contracts ok");
