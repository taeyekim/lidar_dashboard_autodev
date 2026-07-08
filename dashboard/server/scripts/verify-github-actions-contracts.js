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

function assertOrder(first, second) {
  const firstIndex = workflow.indexOf(first);
  const secondIndex = workflow.indexOf(second);
  assert(firstIndex >= 0, `.github/workflows/ci.yml is missing ${first}`);
  assert(secondIndex >= 0, `.github/workflows/ci.yml is missing ${second}`);
  assert(firstIndex < secondIndex, `.github/workflows/ci.yml must place ${first} before ${second}`);
}

assertIncludes("push:");
assertIncludes("workflow_dispatch:");
assertIncludes("branches:");
assertIncludes("- dev");
assert(!workflow.includes("pull_request:"), "CI workflow must not use pull_request in dev direct-push mode");
assert(!workflow.includes('"codex/**"'), "CI workflow must not trigger on codex feature branches");
assert(!workflow.includes('"feature/**"'), "CI workflow must not trigger on feature branches");
assertIncludes("postgres:16-alpine");
assertIncludes("DATABASE_URL: postgresql://lidar_dashboard_ci:lidar_dashboard_ci@localhost:5432/lidar_dashboard_ci?schema=public");
assertIncludes("JWT_SECRET: ci-only-jwt-secret-change-in-field");
assertIncludes("SEED_ADMIN_USER_ID: admin");
assertIncludes("SEED_ADMIN_PASSWORD: ci-only-randomized-admin-password");
assert(!workflow.includes("SEED_ADMIN_PASSWORD: admin1234!"), "CI workflow must not use the example seed admin password");
assertIncludes("POSTGRES_DB: lidar_dashboard_ci");
assertIncludes("POSTGRES_USER: lidar_dashboard_ci");
assertIncludes("POSTGRES_PASSWORD: lidar_dashboard_ci");
assertIncludes("POSTGRES_PORT: \"5432\"");
assertIncludes("CONTROL_BOARD_DRY_RUN: \"true\"");
assertIncludes("Generate Prisma client");
assertIncludes("npm run db:generate");
assertIncludes("npm run smoke");
assertOrder("npm run db:generate", "npm run smoke");
assertIncludes("npm run server:test");
assertIncludes("npm run ci:db");
assertIncludes("npm --prefix dashboard/dashboard-web run lint");
assertIncludes("npm run ci");
assertIncludes("npm run verify:audit-policy");
assertIncludes("docker compose config --quiet");

console.log("github actions contracts ok");
