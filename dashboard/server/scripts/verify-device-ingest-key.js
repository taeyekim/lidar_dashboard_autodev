const { requireDeviceIngestKey } = require("../src/middleware/security");

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
