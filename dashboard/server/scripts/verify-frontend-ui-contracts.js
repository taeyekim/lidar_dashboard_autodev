const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

const card = readProjectFile("dashboard/dashboard-web/src/shared/components/Card.jsx");

[
  "rounded border border-gray-200 bg-white p-4 shadow-sm",
  "border-b border-gray-200",
  "text-sm font-bold text-gray-800",
].forEach((token) => {
  assert(card.includes(token), `Card component must include production UI token: ${token}`);
});

["border-dashed", "border-2", "font-mono text-gray-500", "�"].forEach((token) => {
  assert(!card.includes(token), `Card component must not include mock/debug UI token: ${token}`);
});

console.log("frontend UI contracts ok");
