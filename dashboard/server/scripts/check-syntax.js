const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const scriptsRoot = __dirname;
const serverRoot = path.resolve(__dirname, "..");
const targets = [path.join(serverRoot, "server.js"), path.join(serverRoot, "prisma", "seed.js")];

function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectJsFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      targets.push(fullPath);
    }
  }
}

collectJsFiles(path.join(serverRoot, "src"));
collectJsFiles(scriptsRoot);

let hasError = false;

for (const file of targets) {
  const relativePath = path.relative(process.cwd(), file);
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`[syntax check failed] ${relativePath}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}
