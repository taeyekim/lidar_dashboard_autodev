const { spawnSync } = require("child_process");

const KNOWN_ACCEPTED_VULNERABILITIES = new Set([
  "@hono/node-server",
  "@prisma/dev",
  "prisma",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["audit", "--workspaces", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  throw new Error(`Failed to run npm audit: ${result.error.message}`);
}

const raw = result.stdout || result.stderr || "{}";
let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  throw new Error(`Failed to parse npm audit JSON: ${error.message}`);
}

if (!result.stdout && !result.stderr) {
  throw new Error("npm audit produced no output");
}

const vulnerabilities = report.vulnerabilities || {};
const names = Object.keys(vulnerabilities);
const unexpected = names.filter((name) => !KNOWN_ACCEPTED_VULNERABILITIES.has(name));

assert(unexpected.length === 0, `Unexpected npm audit vulnerabilities: ${unexpected.join(", ")}`);

names.forEach((name) => {
  const item = vulnerabilities[name];
  assert(item.severity === "moderate", `${name} severity changed to ${item.severity}`);
  assert(
    item.fixAvailable?.name === "prisma" && item.fixAvailable?.isSemVerMajor === true,
    `${name} no longer matches the documented Prisma breaking-fix exception`,
  );
});

const counts = report.metadata?.vulnerabilities || {};
assert((counts.high || 0) === 0, "High severity vulnerabilities are not accepted");
assert((counts.critical || 0) === 0, "Critical severity vulnerabilities are not accepted");
assert((counts.total || 0) === names.length, "Audit metadata count does not match vulnerability list");

if (names.length > 0) {
  console.log(`audit policy ok: accepted known development-tooling findings (${names.join(", ")})`);
} else {
  console.log("audit policy ok: no vulnerabilities reported");
}
