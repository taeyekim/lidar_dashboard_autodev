const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.join(__dirname, "..", "..", "..");
const docsRoot = path.join(root, "docs");

const mojibakeTokens = [
  "\uFFFD",
  "嚥",
  "疫",
  "揶",
  "筌",
  "袁",
  "怨",
  "?듦낵",
  "?⑺뭹",
  "?꾪뿕",
  "誘멸",
  "李⑤",
];

function walkMarkdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [filePath] : [];
  });
}

const markdownFiles = walkMarkdownFiles(docsRoot);
assert(markdownFiles.length > 0, "docs markdown files must be present");

markdownFiles.forEach((filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  mojibakeTokens.forEach((token) => {
    assert(!content.includes(token), `${path.relative(root, filePath)} contains mojibake token: ${token}`);
  });
});

const acceptanceChecklist = fs.readFileSync(path.join(docsRoot, "ops", "acceptance-checklist.md"), "utf8");
["월출산휴게소", "통과", "차단", "납품 전 수정", "위험 수용", "미검증"].forEach((token) => {
  assert(acceptanceChecklist.includes(token), `acceptance checklist must preserve readable text: ${token}`);
});

console.log("docs text quality contracts ok");
