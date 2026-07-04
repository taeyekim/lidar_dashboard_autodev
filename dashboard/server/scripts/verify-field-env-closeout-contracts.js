const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  buildMarkdown,
  actionCommandForItem,
  buildEnvTemplateLines,
  envPlaceholderForItem,
} = require("./generate-field-env-closeout");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const generator = readProjectFile("dashboard/server/scripts/generate-field-env-closeout.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");

[
  [generator, "artifacts/field-env-closeout", "field env closeout generator"],
  [generator, "readinessEvidence", "field env closeout generator"],
  [generator, "requiredFieldValueCount", "field env closeout generator"],
  [generator, "blockingCount", "field env closeout generator"],
  [generator, "closeoutItems", "field env closeout generator"],
  [generator, "ownerEnvTemplates", "field env closeout generator"],
  [generator, "Redacted Env Skeleton", "field env closeout generator"],
  [generator, "<field-secret-redacted>", "field env closeout generator"],
  [generator, "Do not paste real secret values into evidence", "field env closeout generator"],
  [generator, "strictPreflightCommand", "field env closeout generator"],
  [generator, "DEVICE_INGEST_API_KEY", "field env closeout generator"],
  [generator, "NGINX_CONTENT_SECURITY_POLICY", "field env closeout generator"],
  [generator, "Do not paste the value into evidence", "field env closeout generator"],
  [packageJson, "field:env-closeout", "root package scripts"],
  [packageJson, "verify:field-env-closeout", "root package scripts"],
  [packageJson, "verify-field-env-closeout-contracts.js", "root smoke chain"],
  [serverPackageJson, "verify-field-env-closeout-contracts.js", "server verify chain"],
  [runbook, "field:env-closeout", "delivery runbook"],
  [runbook, "artifacts/field-env-closeout", "delivery runbook"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

const readiness = {
  path: "artifacts/field-readiness/fixture/manifest.json",
  data: {
    status: "REVIEW",
    baseUrl: "https://delivery.example.local",
    siteName: "field-site-a",
    env: {
      controlBoardSafetyStatus: "DRY_RUN_SAFE",
      requiredFieldValues: [
        {
          name: "JWT_SECRET",
          state: "placeholder",
          redacted: true,
          completionGate: "Blocks authentication/security acceptance while missing or placeholder.",
          nextAction: "Generate and store a field-only JWT_SECRET in .env.",
        },
        {
          name: "CORS_ORIGINS",
          state: "trusted-only",
          redacted: false,
          completionGate: "Blocks browser/API exposure review when missing, wildcard, or open.",
          nextAction: "Set CORS_ORIGINS to explicit delivery UI origins only.",
        },
        {
          name: "NGINX_SWAGGER_ALLOW",
          state: "open-or-missing",
          redacted: false,
          completionGate: "Blocks Swagger exposure acceptance when open, missing, or placeholder.",
          nextAction: "Set NGINX_SWAGGER_ALLOW to the approved operator/internal CIDR.",
        },
      ],
      envActionGroups: [
        {
          owner: "Auth/Security",
          items: [{ name: "JWT_SECRET" }, { name: "CORS_ORIGINS" }],
        },
        {
          owner: "Nginx Delivery",
          items: [{ name: "NGINX_SWAGGER_ALLOW" }],
        },
      ],
    },
  },
};

const manifest = buildManifest({
  readiness,
  generatedAt: "2026-01-01T00:00:00.000Z",
  generatedBy: "reviewer-a",
  siteName: "delivery-site",
});

assert(manifest.status === "OPEN", "fixture should expose open env closeout status");
assert(manifest.readinessEvidence === readiness.path, "manifest should link readiness evidence");
assert(manifest.requiredFieldValueCount === 3, "manifest should count required field values");
assert(manifest.blockingCount === 1, "manifest should count blocking placeholder field values");
assert(manifest.reviewCount === 1, "manifest should count review field values");
assert(manifest.closeoutItemCount === 2, "manifest should expose blocking plus review items");
assert(manifest.closeoutItems.some((item) => item.name === "JWT_SECRET" && item.redacted === true), "manifest should preserve redaction metadata");
assert(manifest.closeoutItems.some((item) => item.owner === "Nginx Delivery"), "manifest should map env items to owner groups");
assert(manifest.envTemplateLines.includes("JWT_SECRET=<field-secret-redacted>"), "manifest should include redacted secret env skeleton line");
assert(manifest.envTemplateLines.includes("NGINX_SWAGGER_ALLOW=<field-value>"), "manifest should include non-secret env skeleton line");
assert(
  manifest.ownerEnvTemplates.some((group) => group.owner === "Auth/Security" && group.envTemplateLines.includes("JWT_SECRET=<field-secret-redacted>")),
  "manifest should split env skeleton lines by owner",
);
assert(manifest.strictPreflightCommand.includes("-RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict"), "manifest should expose strict preflight command");
assert(actionCommandForItem({ name: "JWT_SECRET" }, "https://delivery.example.local").includes("Do not paste the value into evidence"), "JWT action should protect secret values");
assert(envPlaceholderForItem({ name: "CONTROL_BOARD_PORT", redacted: false }) === "<number>", "numeric env values should use number placeholder");
assert(envPlaceholderForItem({ name: "CONTROL_BOARD_DRY_RUN", redacted: false }) === "<true-or-false>", "boolean env values should use boolean placeholder");
assert(buildEnvTemplateLines([{ name: "DEVICE_INGEST_API_KEY", redacted: true }]).includes("DEVICE_INGEST_API_KEY=<field-secret-redacted>"), "template helper should redact secrets");

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Environment Closeout"), "markdown should include title");
assert(markdown.includes("Strict Preflight Command"), "markdown should include strict command section");
assert(markdown.includes("Redacted Env Skeleton"), "markdown should include redacted env skeleton section");
assert(markdown.includes("JWT_SECRET=<field-secret-redacted>"), "markdown should include redacted secret placeholder");
assert(!markdown.includes("JWT_SECRET=fixture-secret"), "markdown should not include concrete secret values");
assert(markdown.includes("NGINX_SWAGGER_ALLOW"), "markdown should include open env key");
assert(markdown.includes("Auth/Security"), "markdown should include owner grouping");

const closed = buildManifest({
  readiness: {
    path: "artifacts/field-readiness/closed/manifest.json",
    data: {
      status: "PASS",
      env: {
        requiredFieldValues: [
          { name: "JWT_SECRET", state: "configured", redacted: true },
          { name: "CORS_ORIGINS", state: "trusted-only", redacted: false },
          { name: "NGINX_SWAGGER_ALLOW", state: "restricted", redacted: false },
        ],
        envActionGroups: [],
      },
    },
  },
});
assert(closed.status === "READY_TO_CLOSE", "closed fixture should be ready");
assert(buildManifest({ readiness: null }).status === "MISSING_READINESS", "missing readiness should be explicit");

console.log("field env closeout contracts ok");
