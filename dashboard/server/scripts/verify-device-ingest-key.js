const { requireDeviceIngestKey } = require("../src/middleware/security");
const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function runMiddleware(headers = {}) {
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  const request = {
    get(name) {
      return headers[String(name).toLowerCase()];
    },
  };

  requireDeviceIngestKey(request, response, () => {
    nextCalled = true;
  });

  return { nextCalled, response };
}

const originalKey = process.env.DEVICE_INGEST_API_KEY;

try {
  const wrongwayRoutes = readProjectFile("dashboard/server/src/domains/wrongway/wrongway.routes.js");
  const externalIngestRoutes = readProjectFile("dashboard/server/src/domains/external-ingest/externalIngest.routes.js");
  const payloadSpec = readProjectFile("docs/specs/lidar-dashboard-payload.md");
  const projectContext = readProjectFile("docs/ai/project-context.md");

  [
    'router.post("/wrongway", requireDeviceIngestKey, controller.receiveWrongWay)',
    'router.post("/ingest/lidar", requireDeviceIngestKey, controller.receiveLidar)',
    'router.post("/ingest/control-board", requireDeviceIngestKey, controller.receiveControlBoard)',
    'router.post("/ingest/control-board/tcp/test", requireDeviceIngestKey, controller.testControlBoardTcp)',
  ].forEach((token) => {
    const haystack = `${wrongwayRoutes}\n${externalIngestRoutes}`;
    assert(haystack.includes(token), `device ingest route contract is missing ${token}`);
  });
  assert(payloadSpec.includes("X-Device-Key"), "LiDAR payload spec must document X-Device-Key");
  assert(payloadSpec.includes("DEVICE_INGEST_API_KEY"), "LiDAR payload spec must document DEVICE_INGEST_API_KEY");
  assert(projectContext.includes("DEVICE_INGEST_API_KEY"), "project context must document the current device ingest key policy");
  assert(!projectContext.includes("별도 장비 인증이나 IP 제한은 후속 과제로 둔다"), "project context must not describe device ingest auth as only a follow-up");

  process.env.DEVICE_INGEST_API_KEY = "";
  let result = runMiddleware();
  assert(result.nextCalled, "blank DEVICE_INGEST_API_KEY must allow ingest requests");

  process.env.DEVICE_INGEST_API_KEY = "field-key-1,field-key-2";
  result = runMiddleware();
  assert(!result.nextCalled, "missing X-Device-Key must be rejected when DEVICE_INGEST_API_KEY is set");
  assert(result.response.statusCode === 401, "missing X-Device-Key must return 401");

  result = runMiddleware({ "x-device-key": "wrong-key" });
  assert(!result.nextCalled, "wrong X-Device-Key must be rejected");
  assert(result.response.statusCode === 401, "wrong X-Device-Key must return 401");

  result = runMiddleware({ "x-device-key": "field-key-2" });
  assert(result.nextCalled, "matching X-Device-Key must allow ingest requests");

  console.log("device ingest key contracts ok");
} finally {
  if (originalKey === undefined) {
    delete process.env.DEVICE_INGEST_API_KEY;
  } else {
    process.env.DEVICE_INGEST_API_KEY = originalKey;
  }
}
