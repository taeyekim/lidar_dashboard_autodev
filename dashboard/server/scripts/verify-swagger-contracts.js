const swaggerSpec = require("../src/swagger");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPath(method, path) {
  assert(swaggerSpec.paths?.[path]?.[method], `${method.toUpperCase()} ${path} is missing from Swagger`);
  return swaggerSpec.paths[path][method];
}

function assertSchema(name) {
  assert(swaggerSpec.components?.schemas?.[name], `Schema ${name} is missing from Swagger`);
}

function assertBearer(operation, label) {
  const security = operation.security || [];
  assert(
    security.some((item) => Array.isArray(item.bearerAuth)),
    `${label} must declare bearerAuth security`,
  );
}

[
  ["/api/status", "get", "SystemStatusResponse"],
  ["/api/sites", "get", "SiteListResponse"],
  ["/api/zones", "get", "ZoneListResponse"],
  ["/api/devices", "get", "DeviceListResponse"],
  ["/api/devices/status", "get", "DeviceStatusSummaryResponse"],
].forEach(([path, method, schema]) => {
  assertPath(method, path);
  assertSchema(schema);
});

[
  ["/api/gate/open", "post"],
  ["/api/gate/close", "post"],
  ["/api/vms", "post"],
  ["/api/control-board/commands/test", "post"],
  ["/api/events/{id}/status", "patch"],
  ["/api/events/{id}/memo", "patch"],
  ["/api/demo/start", "post"],
  ["/api/demo/reset", "post"],
].forEach(([path, method]) => {
  assertBearer(assertPath(method, path), `${method.toUpperCase()} ${path}`);
});

console.log("swagger contracts ok");
