const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.join(__dirname, "..", "..", "..");
const docsRoot = path.join(root, "docs");

const mojibakeTokens = [
  "\uFFFD",
  "\u56a5",
  "\u75ab",
  "\u63f6",
  "\u7b4c",
  "\u8881",
  "\u6028",
  "?\ub4e6\ub0b5",
  "?\u247a\ub6f9",
  "?\uafb8\udfd5",
  "\uc720\uba78",
  "\ucc3d\u2464",
];

const readableDocTokens = {
  "ops/acceptance-checklist.md": [
    "\uc6d4\ucd9c\uc0b0\ud734\uac8c\uc18c",
    "\ud1b5\uacfc",
    "\ucc28\ub2e8",
    "\ub0a9\ud488 \uc804 \uc218\uc815",
    "\uc704\ud5d8 \uc218\uc6a9",
    "\ubbf8\uac80\uc99d",
  ],
  "conventions/environment.md": [
    "\ud658\uacbd/\uc124\uc815 \ud30c\uc77c \uad00\ub9ac \uae30\uc900",
    "\uc2e4\uc81c `.env`, `config.json`\uc740 Git\uc5d0 \uc62c\ub9ac\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.",
    "\ub0b4\ubd80\ub9dd IP",
    "\ud604\uc7a5 \uac12",
    "CONTROL_BOARD_HOST",
    "NGINX_SWAGGER_ALLOW",
  ],
};

function walkMarkdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [filePath] : [];
  });
}

function projectPath(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

const markdownFiles = walkMarkdownFiles(docsRoot);
assert(markdownFiles.length > 0, "docs markdown files must be present");

markdownFiles.forEach((filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  mojibakeTokens.forEach((token) => {
    assert(!content.includes(token), `${projectPath(filePath)} contains mojibake token: ${token}`);
  });
});

Object.entries(readableDocTokens).forEach(([relativePath, tokens]) => {
  const content = fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
  tokens.forEach((token) => {
    assert(content.includes(token), `${relativePath} must preserve readable text: ${token}`);
  });
});

console.log("docs text quality contracts ok");
