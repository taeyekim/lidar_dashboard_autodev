const DEFAULT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' http: https: ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

const FIELD_ENV_CATALOG = Object.freeze({
  AUTH_COOKIE_SAMESITE: {
    owner: "Auth/Security",
    valueShape: "strict/lax/none, delivery default usually strict or lax",
    secret: false,
    closes: "Auth cookie delivery settings",
    verify: "field:preflight",
    suggestedValue: "lax",
    action: "Set AUTH_COOKIE_SAMESITE to lax, strict, or none according to the delivery topology.",
  },
  AUTH_COOKIE_SECURE: {
    owner: "Auth/Security",
    valueShape: "true when HTTPS/TLS is used at delivery entrypoint",
    secret: false,
    closes: "Auth cookie delivery settings",
    verify: "field:preflight",
    suggestedValue: "true",
    action: "Set AUTH_COOKIE_SECURE=true for the HTTPS/TLS delivery route.",
  },
  CONTROL_BOARD_CONNECT_TIMEOUT_MS: {
    owner: "Control-board TCP",
    valueShape: "TCP connect timeout in milliseconds",
    secret: false,
    closes: "Control-board timing posture",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "1000",
  },
  CONTROL_BOARD_DRY_RUN: {
    owner: "Control-board TCP",
    valueShape: "true until hardware owner approves LIVE TCP",
    secret: false,
    closes: "Control-board safety posture",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "true",
    action: "Keep CONTROL_BOARD_DRY_RUN=true until live TCP is approved; set false only for approved live rehearsal.",
  },
  CONTROL_BOARD_HEARTBEAT_INTERVAL_MS: {
    owner: "Control-board TCP",
    valueShape: "TCP heartbeat interval in milliseconds",
    secret: false,
    closes: "Control-board timing posture",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "5000",
  },
  CONTROL_BOARD_HOST: {
    owner: "Control-board TCP",
    valueShape: "integrated control-board IPv4/host on field network",
    secret: false,
    closes: "LIVE TCP readiness",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "<approved-control-board-ip>",
    action: "Fill CONTROL_BOARD_HOST after the hardware owner confirms the integrated control-board field IP.",
  },
  CONTROL_BOARD_LIVE_APPROVED: {
    owner: "Control-board TCP + PM",
    valueShape: "false until approved, true only with recorded hardware approval",
    secret: false,
    closes: "LIVE TCP approval gate",
    verify: "field:readiness, field:acceptance",
    suggestedValue: "false",
    action: "Set CONTROL_BOARD_LIVE_APPROVED=true only after hardware owner approval is recorded.",
  },
  CONTROL_BOARD_PORT: {
    owner: "Control-board TCP",
    valueShape: "TCP port number assigned for raw 10-byte command frames",
    secret: false,
    closes: "LIVE TCP readiness",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "<approved-tcp-port>",
    action: "Fill CONTROL_BOARD_PORT after the hardware owner confirms the integrated control-board TCP port.",
  },
  CONTROL_BOARD_RESPONSE_TIMEOUT_MS: {
    owner: "Control-board TCP",
    valueShape: "TCP ACK response timeout in milliseconds",
    secret: false,
    closes: "Control-board timing posture",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "1000",
  },
  CONTROL_BOARD_RETRY_COUNT: {
    owner: "Control-board TCP",
    valueShape: "retry count for command ACK failures",
    secret: false,
    closes: "Control-board retry posture",
    verify: "field:readiness, control-board-field-rehearsal",
    suggestedValue: "1",
  },
  CORS_ORIGINS: {
    owner: "Auth/Security",
    valueShape: "comma-separated allowed dashboard origins",
    secret: false,
    closes: "CORS trusted origins",
    verify: "field:preflight",
    suggestedValue: "<approved-operator-ui-origin>",
    action: "Set CORS_ORIGINS to explicit approved operator UI origins only.",
  },
  DEVICE_INGEST_API_KEY: {
    owner: "LiDAR Ingest + Auth/Security",
    valueShape: "long random shared device ingest key, never paste into evidence",
    secret: true,
    closes: "Device ingest key",
    verify: "field:preflight, runtime:evidence",
    action: "Set DEVICE_INGEST_API_KEY and configure the LiDAR sender X-Device-Key header, or attach accepted trusted-LAN risk evidence.",
  },
  FIELD_BASE_URL: {
    owner: "Field Operations",
    valueShape: "delivery Nginx/operator entrypoint URL, e.g. http://<dashboard-pc-ip>:<nginx-port>",
    secret: false,
    closes: "Shared field command base URL",
    verify: "final:refresh, field:readiness, handover:package",
    suggestedValue: "http://localhost:8080",
  },
  FIELD_REVIEWER: {
    owner: "PM/QA",
    valueShape: "named reviewer or role signing field evidence",
    secret: false,
    closes: "Reviewer metadata",
    verify: "handover:index, field:closeout-quickstart",
    suggestedValue: "<field-reviewer>",
  },
  FIELD_SITE_NAME: {
    owner: "PM/QA",
    valueShape: "delivery site/system name",
    secret: false,
    closes: "Site metadata",
    verify: "handover:index, field:closeout-quickstart",
    suggestedValue: "<delivery-site>",
  },
  JWT_SECRET: {
    owner: "Auth/Security",
    valueShape: "long random JWT signing secret, never paste into evidence",
    secret: true,
    closes: "JWT secret placeholder",
    verify: "field:preflight",
    action: "Set JWT_SECRET to a field-only random value, then rerun strict field preflight. Do not paste the value into evidence.",
  },
  NGINX_CONTENT_SECURITY_POLICY: {
    owner: "Nginx Delivery + Auth/Security",
    valueShape: "approved CSP header string for delivery dashboard/API",
    secret: false,
    closes: "Nginx content security policy",
    verify: "field:preflight, security:evidence",
    suggestedValue: DEFAULT_CSP,
    action: "Set NGINX_CONTENT_SECURITY_POLICY after reviewing final camera, LiDAR, Swagger, and operator UI hosts.",
  },
  NGINX_SWAGGER_ALLOW: {
    owner: "Nginx Delivery",
    valueShape: "CIDR allowlist for Swagger access, not all",
    secret: false,
    closes: "Swagger allowlist",
    verify: "field:preflight",
    suggestedValue: "127.0.0.1/32",
    action: "Set NGINX_SWAGGER_ALLOW to the approved operator/internal CIDR.",
  },
  NGINX_WRONGWAY_BURST: {
    owner: "Nginx Delivery",
    valueShape: "numeric burst allowance for wrong-way ingest/API rate limit",
    secret: false,
    closes: "Nginx wrong-way rate limit",
    verify: "field:preflight",
    suggestedValue: "60",
    action: "Set NGINX_WRONGWAY_BURST after confirming the LiDAR sender burst profile.",
  },
  NGINX_WRONGWAY_RATE_LIMIT: {
    owner: "Nginx Delivery",
    valueShape: "Nginx rate expression such as 10r/s, field approved",
    secret: false,
    closes: "Nginx wrong-way rate limit",
    verify: "field:preflight",
    suggestedValue: "30r/s",
    action: "Set NGINX_WRONGWAY_RATE_LIMIT after confirming the LiDAR sender event rate.",
  },
  SEED_ADMIN_PASSWORD: {
    owner: "Auth/Security",
    valueShape: "field admin bootstrap password, rotate after setup",
    secret: true,
    closes: "Seed admin password placeholder",
    verify: "field:preflight",
    action: "Set SEED_ADMIN_PASSWORD to a non-example value before seeding the intended field DB, then rerun strict field preflight.",
  },
});

function fieldEnvMeta(key) {
  return FIELD_ENV_CATALOG[key] || {
    owner: "Field Operations",
    valueShape: "field-specific value",
    secret: false,
    closes: "field closeout item",
    verify: "field:preflight",
  };
}

function isSecretFieldEnvKey(key) {
  return fieldEnvMeta(key).secret === true;
}

function placeholderForFieldEnvKey(key) {
  const meta = fieldEnvMeta(key);
  if (meta.secret) return "<field-secret-redacted>";
  if (key === "CONTROL_BOARD_LIVE_APPROVED" || key === "CONTROL_BOARD_DRY_RUN" || key === "AUTH_COOKIE_SECURE") {
    return "<true-or-false>";
  }
  if (String(key || "").endsWith("_MS") || key === "CONTROL_BOARD_PORT" || key === "CONTROL_BOARD_RETRY_COUNT") {
    return "<number>";
  }
  return "<field-value>";
}

function suggestedValueForFieldEnvKey(key) {
  const meta = fieldEnvMeta(key);
  if (meta.secret) return "<field-secret-redacted>";
  return meta.suggestedValue || placeholderForFieldEnvKey(key);
}

function actionForFieldEnvKey(key, fallback = null) {
  return fieldEnvMeta(key).action || fallback || "Fill the field value and rerun strict field preflight.";
}

module.exports = {
  DEFAULT_CSP,
  FIELD_ENV_CATALOG,
  actionForFieldEnvKey,
  fieldEnvMeta,
  isSecretFieldEnvKey,
  placeholderForFieldEnvKey,
  suggestedValueForFieldEnvKey,
};
