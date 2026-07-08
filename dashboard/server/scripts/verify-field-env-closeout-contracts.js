const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  buildMarkdown,
  actionCommandForItem,
  buildOwnerCloseoutChecklists,
  buildEnvTemplateLines,
  buildSuggestedEnvLines,
  buildAppendMissingEnvLines,
  envPlaceholderForItem,
  suggestedValueForItem,
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
const catalog = readProjectFile("dashboard/server/scripts/field-env-catalog.js");
const packageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const runbook = readProjectFile("docs/ops/delivery-runbook.md");

[
  [generator, "artifacts/field-env-closeout", "field env closeout generator"],
  [generator, "field-env-catalog", "field env closeout generator"],
  [generator, "actionForFieldEnvKey", "field env closeout generator"],
  [generator, "suggestedValueForFieldEnvKey", "field env closeout generator"],
  [generator, "readinessEvidence", "field env closeout generator"],
  [generator, "requiredFieldValueCount", "field env closeout generator"],
  [generator, "blockingCount", "field env closeout generator"],
  [generator, "closeoutItems", "field env closeout generator"],
  [generator, "ownerEnvTemplates", "field env closeout generator"],
  [generator, "ownerCloseoutChecklists", "field env closeout generator"],
  [generator, "Owner Closeout Checklists", "field env closeout generator"],
  [generator, "Set reviewer/session metadata", "field env closeout generator"],
  [generator, "Rerun strict field preflight", "field env closeout generator"],
  [generator, "Redacted Env Skeleton", "field env closeout generator"],
  [generator, "Suggested Field Env Draft", "field env closeout generator"],
  [generator, "suggestedEnvLines", "field env closeout generator"],
  [generator, "Current Env Key Coverage", "field env closeout generator"],
  [generator, "Append Missing Env Block", "field env closeout generator"],
  [generator, "readEnvKeySet", "field env closeout generator"],
  [generator, "missingCurrentEnvKeys", "field env closeout generator"],
  [generator, "appendMissingEnvBlockLines", "field env closeout generator"],
  [generator, "<field-secret-redacted>", "field env closeout generator"],
  [generator, "Do not paste real secret values into evidence", "field env closeout generator"],
  [generator, "strictPreflightCommand", "field env closeout generator"],
  [catalog, "FIELD_ENV_CATALOG", "field env catalog"],
  [catalog, "Do not paste the value into evidence", "field env catalog"],
  [catalog, "DEVICE_INGEST_API_KEY", "field env catalog"],
  [catalog, "CONTROL_BOARD_HOST", "field env catalog"],
  [catalog, "NGINX_CONTENT_SECURITY_POLICY", "field env catalog"],
  [catalog, "NGINX_SWAGGER_ALLOW", "field env catalog"],
  [catalog, "127.0.0.1/32", "field env catalog"],
  [catalog, "suggestedValueForFieldEnvKey", "field env catalog"],
  [catalog, "placeholderForFieldEnvKey", "field env catalog"],
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
  envInventory: {
    present: true,
    path: ".env",
    keys: ["CORS_ORIGINS"],
  },
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
assert(manifest.suggestedEnvLines.includes("JWT_SECRET=<field-secret-redacted>"), "manifest should keep secrets redacted in suggested env lines");
assert(manifest.suggestedEnvLines.includes("NGINX_SWAGGER_ALLOW=127.0.0.1/32"), "manifest should suggest a restricted Swagger allowlist");
assert(manifest.envFile.present === true, "manifest should record .env presence without exposing values");
assert(manifest.envFile.keys.includes("CORS_ORIGINS"), "manifest should expose .env key inventory only");
assert(manifest.envFile.missingCurrentEnvKeys.includes("JWT_SECRET"), "manifest should identify missing open env keys");
assert(manifest.envFile.missingCurrentEnvKeys.includes("NGINX_SWAGGER_ALLOW"), "manifest should identify missing non-secret env keys");
assert(!manifest.envFile.missingCurrentEnvKeys.includes("CORS_ORIGINS"), "manifest should not ask for keys already present in .env");
assert(manifest.envFile.appendMissingEnvBlockLines.includes("JWT_SECRET=<field-secret-redacted>"), "manifest should build appendable redacted missing secret lines");
assert(manifest.envFile.appendMissingEnvBlockLines.includes("NGINX_SWAGGER_ALLOW=127.0.0.1/32"), "manifest should build appendable suggested non-secret lines");
assert(
  manifest.ownerEnvTemplates.some((group) => group.owner === "Auth/Security" && group.envTemplateLines.includes("JWT_SECRET=<field-secret-redacted>")),
  "manifest should split env skeleton lines by owner",
);
assert(
  manifest.ownerCloseoutChecklists.some(
    (group) =>
      group.owner === "Auth/Security" &&
      group.stepCount === 3 &&
      group.steps.some((step) => step.title === "Set JWT_SECRET" && step.command === "JWT_SECRET=<field-secret-redacted>"),
  ),
  "manifest should create owner closeout checklists with redacted placeholders",
);
assert(manifest.strictPreflightCommand.includes("-RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict"), "manifest should expose strict preflight command");
assert(actionCommandForItem({ name: "JWT_SECRET" }, "https://delivery.example.local").includes("Do not paste the value into evidence"), "JWT action should protect secret values");
assert(envPlaceholderForItem({ name: "CONTROL_BOARD_PORT", redacted: false }) === "<number>", "numeric env values should use number placeholder");
assert(envPlaceholderForItem({ name: "CONTROL_BOARD_DRY_RUN", redacted: false }) === "<true-or-false>", "boolean env values should use boolean placeholder");
assert(suggestedValueForItem({ name: "AUTH_COOKIE_SECURE", redacted: false }) === "true", "suggested env should prefer secure cookies");
assert(suggestedValueForItem({ name: "NGINX_SWAGGER_ALLOW", redacted: false }) === "127.0.0.1/32", "suggested env should restrict Swagger allowlist");
assert(buildEnvTemplateLines([{ name: "DEVICE_INGEST_API_KEY", redacted: true }]).includes("DEVICE_INGEST_API_KEY=<field-secret-redacted>"), "template helper should redact secrets");
assert(
  buildSuggestedEnvLines([{ name: "DEVICE_INGEST_API_KEY", redacted: true }]).includes("DEVICE_INGEST_API_KEY=<field-secret-redacted>"),
  "suggested env helper should redact secrets",
);
assert(
  buildAppendMissingEnvLines(
    [
      { name: "DEVICE_INGEST_API_KEY", redacted: true },
      { name: "CORS_ORIGINS", redacted: false },
    ],
    ["CORS_ORIGINS"],
  ).includes("DEVICE_INGEST_API_KEY=<field-secret-redacted>"),
  "append missing env helper should include missing redacted secrets",
);
assert(
  !buildAppendMissingEnvLines(
    [
      { name: "DEVICE_INGEST_API_KEY", redacted: true },
      { name: "CORS_ORIGINS", redacted: false },
    ],
    ["CORS_ORIGINS"],
  ).some((line) => line.startsWith("CORS_ORIGINS=")),
  "append missing env helper should skip keys already present",
);
assert(
  buildOwnerCloseoutChecklists([{ name: "DEVICE_INGEST_API_KEY", owner: "LiDAR Integration", redacted: true, closeoutCommand: "close it" }], "npm.cmd run field:preflight")[0].steps.some(
    (step) => step.command === "DEVICE_INGEST_API_KEY=<field-secret-redacted>",
  ),
  "owner checklist helper should redact secret placeholders",
);

const markdown = buildMarkdown(manifest);
assert(markdown.includes("Field Environment Closeout"), "markdown should include title");
assert(markdown.includes("Strict Preflight Command"), "markdown should include strict command section");
assert(markdown.includes("Redacted Env Skeleton"), "markdown should include redacted env skeleton section");
assert(markdown.includes("Suggested Field Env Draft"), "markdown should include suggested env draft section");
assert(markdown.includes("Current Env Key Coverage"), "markdown should include current env coverage section");
assert(markdown.includes("Append Missing Env Block"), "markdown should include append missing env section");
assert(markdown.includes("Owner Closeout Checklists"), "markdown should include owner closeout checklist section");
assert(markdown.includes("Set reviewer/session metadata"), "markdown should include reviewer metadata step");
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
