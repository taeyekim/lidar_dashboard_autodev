const {
  WRONGWAY_EVENT_TYPES,
  createMetricAccumulator,
  applyWrongwayEvent,
  applyControlCommand,
  mergeMetricAccumulator,
  finalizeMetricStat,
  percent,
} = require("../src/domains/statistics/statisticsMetrics");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`);
}

assertEqual(
  JSON.stringify(WRONGWAY_EVENT_TYPES),
  JSON.stringify(["wrong-way-level-1", "wrong-way-level-2"]),
  "wrong-way event type filter must include stage 1 and stage 2 only",
);

const stat = createMetricAccumulator();
["track-normal-1", "track-wrong-1", "track-duplicate"].forEach((id) => stat.vehicleTrackIds.add(id));
stat.vehicleTrackIds.add("track-duplicate");

applyWrongwayEvent(stat, { id: "evt-1", eventType: "wrong-way-level-1", trackId: "track-wrong-1" });
applyWrongwayEvent(stat, {
  id: "evt-2",
  eventType: "wrong-way-level-2",
  vehicleTrackId: "track-missing-from-track-table",
});
applyWrongwayEvent(stat, {
  id: "evt-2-duplicate",
  eventType: "wrong-way-level-2",
  vehicleTrackId: "track-missing-from-track-table",
});

applyControlCommand(stat, { status: "DRY_RUN" });
applyControlCommand(stat, {
  status: "ACKNOWLEDGED",
  sentAt: "2026-07-03T10:00:00.000Z",
  acknowledgedAt: "2026-07-03T10:00:00.100Z",
});
applyControlCommand(stat, {
  status: "ACKNOWLEDGED",
  sentAt: "2026-07-03T10:00:00.000Z",
  acknowledgedAt: "2026-07-03T10:00:00.300Z",
});
applyControlCommand(stat, { status: "FAILED" });
applyControlCommand(stat, {
  status: "FAILED",
  sentAt: "2026-07-03T10:00:01.000Z",
  acknowledgedAt: "2026-07-03T10:00:00.000Z",
});

const result = finalizeMetricStat(stat);
assertEqual(result.vehiclesTotal, 3, "unique vehicle count must deduplicate track ids");
assertEqual(result.wrongwayVehicles, 2, "wrong-way vehicle count must deduplicate event vehicle keys");
assertEqual(result.normalVehicles, 1, "normal vehicle count must subtract unique wrong-way vehicles");
assertEqual(result.wrongwayEvents, 3, "wrong-way event count must keep every event occurrence");
assertEqual(result.wrongwayRate, 66.67, "wrong-way rate must be rounded to two decimals");
assertEqual(result.stage1Events, 1, "stage 1 event count must match level-1 events");
assertEqual(result.stage2Events, 2, "stage 2 event count must match level-2 events");
assertEqual(result.controlCommands, 5, "control command count must include all command attempts");
assertEqual(result.dryRunCommands, 1, "dry-run commands must be separated from live commands");
assertEqual(result.liveCommands, 4, "live command count must exclude dry-run commands");
assertEqual(result.acknowledgedCommands, 2, "acknowledged command count must include ACKNOWLEDGED only");
assertEqual(result.failedCommands, 2, "failed command count must include FAILED only");
assertEqual(result.commandSuccessRate, 50, "command success rate must be based on completed live commands");
assertEqual(result.averageResponseMs, 200, "average response time must ignore invalid negative samples");

const other = createMetricAccumulator();
other.vehicleTrackIds.add("track-other");
other.wrongwayVehicleKeys.add("track-other");
other.stage1Events = 1;
other.responseDurationTotalMs = 50;
other.responseDurationSamples = 1;

const merged = createMetricAccumulator();
mergeMetricAccumulator(merged, stat);
mergeMetricAccumulator(merged, other);

const mergedResult = finalizeMetricStat(merged);
assertEqual(mergedResult.vehiclesTotal, 4, "merged vehicle count must combine unique track ids");
assertEqual(mergedResult.wrongwayVehicles, 3, "merged wrong-way count must combine unique vehicle keys");
assertEqual(mergedResult.averageResponseMs, 150, "merged average response time must combine sums and samples");

const empty = finalizeMetricStat(createMetricAccumulator());
assertEqual(empty.wrongwayRate, 0, "empty wrong-way rate must be zero");
assertEqual(empty.commandSuccessRate, null, "empty command success rate must be null");
assertEqual(empty.averageResponseMs, null, "empty average response time must be null");
assertEqual(percent(1, 3), 33.33, "percent helper must round to two decimals");

console.log("statistics metric vectors ok");
