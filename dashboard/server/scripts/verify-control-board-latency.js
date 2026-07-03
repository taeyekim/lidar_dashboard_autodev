const {
  responseDurationMs,
  summarizeResponseLatency,
} = require("../src/domains/control-board/controlBoardLatency");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const base = "2026-07-03T10:00:00.000Z";

assert(
  responseDurationMs({
    sentAt: new Date(base),
    acknowledgedAt: new Date("2026-07-03T10:00:00.250Z"),
  }) === 250,
  "Date objects must produce acknowledgement latency in milliseconds",
);

assert(
  responseDurationMs({
    sentAt: base,
    acknowledgedAt: "2026-07-03T10:00:00.333Z",
  }) === 333,
  "ISO date strings must produce acknowledgement latency in milliseconds",
);

assert(responseDurationMs({ sentAt: base }) === null, "missing acknowledgedAt must not produce latency");
assert(responseDurationMs(null) === null, "missing command must not produce latency");
assert(
  responseDurationMs({
    sentAt: "2026-07-03T10:00:01.000Z",
    acknowledgedAt: base,
  }) === null,
  "negative acknowledgement latency must be ignored",
);

const summary = summarizeResponseLatency([
  { sentAt: base, acknowledgedAt: "2026-07-03T10:00:00.100Z" },
  { sentAt: base, acknowledgedAt: "2026-07-03T10:00:00.200Z" },
  { sentAt: base, acknowledgedAt: "2026-07-03T10:00:00.201Z" },
  { sentAt: base },
  { sentAt: "2026-07-03T10:00:01.000Z", acknowledgedAt: base },
]);

assert(summary.responseSampleCount === 3, "latency summary must count only valid samples");
assert(summary.averageResponseMs === 167, "latency summary must round the valid sample average");

const emptySummary = summarizeResponseLatency([]);
assert(emptySummary.responseSampleCount === 0, "empty latency summary must expose zero sample count");
assert(emptySummary.averageResponseMs === null, "empty latency summary must expose null average");

console.log("control board latency vectors ok");
