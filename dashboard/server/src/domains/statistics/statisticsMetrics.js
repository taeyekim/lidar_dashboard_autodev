const WRONGWAY_EVENT_TYPES = ["wrong-way-level-1", "wrong-way-level-2"];
const LIVE_SUCCESS_STATUSES = new Set(["ACKNOWLEDGED"]);
const LIVE_FAILURE_STATUSES = new Set(["FAILED"]);

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function createMetricAccumulator() {
  return {
    vehicleTrackIds: new Set(),
    wrongwayVehicleKeys: new Set(),
    stage1Events: 0,
    stage2Events: 0,
    wrongwayEvents: 0,
    controlCommands: 0,
    dryRunCommands: 0,
    liveCommands: 0,
    acknowledgedCommands: 0,
    failedCommands: 0,
    responseDurationTotalMs: 0,
    responseDurationSamples: 0,
  };
}

function wrongwayVehicleKey(event) {
  return event.trackId || event.vehicleTrackId || event.id;
}

function applyWrongwayEvent(target, event) {
  target.wrongwayEvents += 1;
  if (event.eventType === "wrong-way-level-1") target.stage1Events += 1;
  if (event.eventType === "wrong-way-level-2") target.stage2Events += 1;
  target.wrongwayVehicleKeys.add(wrongwayVehicleKey(event));
}

function applyControlCommand(target, command) {
  target.controlCommands += 1;
  if (command.status === "DRY_RUN") {
    target.dryRunCommands += 1;
  } else {
    target.liveCommands += 1;
  }
  if (LIVE_SUCCESS_STATUSES.has(command.status)) target.acknowledgedCommands += 1;
  if (LIVE_FAILURE_STATUSES.has(command.status)) target.failedCommands += 1;

  if (command.sentAt && command.acknowledgedAt) {
    const durationMs = new Date(command.acknowledgedAt).getTime() - new Date(command.sentAt).getTime();
    if (durationMs >= 0) {
      target.responseDurationTotalMs += durationMs;
      target.responseDurationSamples += 1;
    }
  }
}

function mergeMetricAccumulator(target, source) {
  source.vehicleTrackIds.forEach((id) => target.vehicleTrackIds.add(id));
  source.wrongwayVehicleKeys.forEach((id) => target.wrongwayVehicleKeys.add(id));
  target.stage1Events += source.stage1Events;
  target.stage2Events += source.stage2Events;
  target.wrongwayEvents += source.wrongwayEvents;
  target.controlCommands += source.controlCommands;
  target.dryRunCommands += source.dryRunCommands;
  target.liveCommands += source.liveCommands;
  target.acknowledgedCommands += source.acknowledgedCommands;
  target.failedCommands += source.failedCommands;
  target.responseDurationTotalMs += source.responseDurationTotalMs;
  target.responseDurationSamples += source.responseDurationSamples;
  return target;
}

function finalizeMetricStat(stat) {
  const vehiclesTotal = stat.vehicleTrackIds.size;
  const wrongwayVehicles = stat.wrongwayVehicleKeys.size;
  const normalVehicles = Math.max(vehiclesTotal - wrongwayVehicles, 0);
  const liveCompleted = stat.acknowledgedCommands + stat.failedCommands;

  return {
    vehiclesTotal,
    normalVehicles,
    wrongwayVehicles,
    wrongwayEvents: stat.wrongwayEvents,
    wrongwayRate: percent(wrongwayVehicles, vehiclesTotal),
    stage1Events: stat.stage1Events,
    stage2Events: stat.stage2Events,
    controlCommands: stat.controlCommands,
    dryRunCommands: stat.dryRunCommands,
    liveCommands: stat.liveCommands,
    acknowledgedCommands: stat.acknowledgedCommands,
    failedCommands: stat.failedCommands,
    commandSuccessRate: liveCompleted ? percent(stat.acknowledgedCommands, liveCompleted) : null,
    averageResponseMs: stat.responseDurationSamples
      ? Math.round(stat.responseDurationTotalMs / stat.responseDurationSamples)
      : null,
  };
}

module.exports = {
  WRONGWAY_EVENT_TYPES,
  createMetricAccumulator,
  applyWrongwayEvent,
  applyControlCommand,
  mergeMetricAccumulator,
  finalizeMetricStat,
  percent,
};
