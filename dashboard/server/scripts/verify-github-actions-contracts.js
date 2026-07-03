const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const workflowPath = path.join(__dirname, "..", "..", "..", ".github", "workflows", "ci.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function assertIncludes(token) {
  assert(workflow.includes(token), `.github/workflows/ci.yml is missing ${token}`);
}

assertIncludes("push:");
assertIncludes("branches:");
assertIncludes("- dev");
assert(!workflow.includes("pull_request:"), "CI workflow must not use pull_request in dev direct-push mode");
assert(!workflow.includes('"codex/**"'), "CI workflow must not trigger on codex feature branches");
assert(!workflow.includes('"feature/**"'), "CI workflow must not trigger on feature branches");
assertIncludes("postgres:16-alpine");
assertIncludes("DATABASE_URL: postgresql://lidar_dashboard_ci:lidar_dashboard_ci@localhost:5432/lidar_dashboard_ci?schema=public");
assertIncludes("CONTROL_BOARD_DRY_RUN: \"true\"");
assertIncludes("npm run smoke");
assertIncludes("npm run server:test");
assertIncludes("npm run ci:db");
assertIncludes("npm --prefix dashboard/dashboard-web run lint");
assertIncludes("npm run ci");
assertIncludes("npm run verify:audit-policy");
assertIncludes("docker compose config --quiet");

console.log("github actions contracts ok");
