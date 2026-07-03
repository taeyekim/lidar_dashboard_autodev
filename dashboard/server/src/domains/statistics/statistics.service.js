const { prisma } = require("../../prisma/client");

const RANGE_OPTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const WRONGWAY_EVENT_TYPES = ["wrong-way-level-1", "wrong-way-level-2"];
const LIVE_SUCCESS_STATUSES = new Set(["ACKNOWLEDGED"]);
const LIVE_FAILURE_STATUSES = new Set(["FAILED"]);

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function startOfWeek(date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function isoDate(date) {
  return date.toISOString();
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function normalizeRange(query = {}) {
  const range = RANGE_OPTIONS.has(query.range) ? query.range : "daily";
  const now = query.now ? parseDate(query.now) || new Date() : new Date();
  let start;
  let end;
  let bucketUnit;

  if (range === "weekly") {
    start = startOfWeek(now);
    end = addDays(start, 7);
    bucketUnit = "day";
  } else if (range === "monthly") {
    start = startOfMonth(now);
    end = addMonths(start, 1);
    bucketUnit = "day";
  } else if (range === "yearly") {
    start = startOfYear(now);
    end = addMonths(start, 12);
    bucketUnit = "month";
  } else {
    start = startOfDay(now);
    end = addDays(start, 1);
    bucketUnit = "hour";
  }

  const customStart = parseDate(query.from);
  const customEnd = parseDate(query.to);
  if (customStart && customEnd && customStart < customEnd) {
    start = customStart;
    end = customEnd;
  }

  return { range, start, end, bucketUnit };
}

function formatBucketLabel(start, unit) {
  if (unit === "hour") {
    return `${String(start.getHours()).padStart(2, "0")}:00`;
  }
  if (unit === "month") {
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function createBucket(start, end, unit, index) {
  return {
    key: `${unit}-${index}`,
    label: formatBucketLabel(start, unit),
    start,
    end,
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

function buildBuckets(start, end, unit) {
  const buckets = [];
  let cursor = new Date(start);
  let index = 0;
  while (cursor < end && index < 400) {
    const next = unit === "hour" ? new Date(cursor.getTime() + 60 * 60 * 1000)
      : unit === "month" ? addMonths(cursor, 1)
        : addDays(cursor, 1);
    buckets.push(createBucket(cursor, next > end ? end : next, unit, index));
    cursor = next;
    index += 1;
  }
  return buckets;
}

function findBucket(buckets, date) {
  if (!date) return null;
  return buckets.find((bucket) => date >= bucket.start && date < bucket.end) || null;
}

function zoneKeyFromRecord(record) {
  return record.zone?.zoneCode || record.externalZoneId || record.zone?.id || "UNKNOWN";
}

function zoneNameFromRecord(record) {
  if (record.zone?.name) return record.zone.name;
  return record.externalZoneId || "Unknown zone";
}

function createZoneStat(key, name) {
  return {
    key,
    zoneCode: key === "UNKNOWN" ? null : key,
    name,
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

function getZoneStat(zoneStats, record) {
  const key = zoneKeyFromRecord(record);
  if (!zoneStats.has(key)) {
    zoneStats.set(key, createZoneStat(key, zoneNameFromRecord(record)));
  }
  return zoneStats.get(key);
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

function finalizeStat(stat) {
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

function finalizeBucket(bucket) {
  return {
    key: bucket.key,
    label: bucket.label,
    start: isoDate(bucket.start),
    end: isoDate(bucket.end),
    ...finalizeStat(bucket),
  };
}

function finalizeZone(stat) {
  return {
    zoneCode: stat.zoneCode,
    name: stat.name,
    ...finalizeStat(stat),
  };
}

function buildDateWhere(field, start, end, extra = {}) {
  return {
    ...extra,
    [field]: {
      gte: start,
      lt: end,
    },
  };
}

async function getTrafficStatistics(query = {}) {
  const { range, start, end, bucketUnit } = normalizeRange(query);
  const buckets = buildBuckets(start, end, bucketUnit);
  const zoneStats = new Map();

  const filterZoneId = query.zoneId ? String(query.zoneId) : null;
  const filterExternalZoneId = query.externalZoneId ? String(query.externalZoneId) : null;
  const zoneFilter = {};
  if (filterZoneId) zoneFilter.zoneId = filterZoneId;
  if (filterExternalZoneId) zoneFilter.externalZoneId = filterExternalZoneId;
  const hasZoneFilter = Object.keys(zoneFilter).length > 0;

  const [vehicleTracks, wrongwayEvents, controlCommands] = await Promise.all([
    prisma.vehicleTrack.findMany({
      where: buildDateWhere("firstSeenAt", start, end, zoneFilter),
      select: {
        id: true,
        firstSeenAt: true,
        externalZoneId: true,
        zone: { select: { id: true, zoneCode: true, name: true } },
      },
    }),
    prisma.trafficEvent.findMany({
      where: buildDateWhere("receivedAt", start, end, {
        ...zoneFilter,
        eventType: { in: WRONGWAY_EVENT_TYPES },
      }),
      select: {
        id: true,
        eventType: true,
        receivedAt: true,
        trackId: true,
        vehicleTrackId: true,
        externalZoneId: true,
        zone: { select: { id: true, zoneCode: true, name: true } },
      },
    }),
    prisma.controlCommand.findMany({
      where: buildDateWhere("requestedAt", start, end, hasZoneFilter ? { trafficEvent: { is: zoneFilter } } : {}),
      select: {
        id: true,
        status: true,
        commandType: true,
        requestedAt: true,
        sentAt: true,
        acknowledgedAt: true,
        trafficEvent: {
          select: {
            externalZoneId: true,
            zone: { select: { id: true, zoneCode: true, name: true } },
          },
        },
      },
    }),
  ]);

  vehicleTracks.forEach((track) => {
    const bucket = findBucket(buckets, track.firstSeenAt);
    if (bucket) bucket.vehicleTrackIds.add(track.id);
    getZoneStat(zoneStats, track).vehicleTrackIds.add(track.id);
  });

  wrongwayEvents.forEach((event) => {
    const bucket = findBucket(buckets, event.receivedAt);
    if (bucket) applyWrongwayEvent(bucket, event);
    applyWrongwayEvent(getZoneStat(zoneStats, event), event);
  });

  controlCommands.forEach((command) => {
    const bucket = findBucket(buckets, command.requestedAt);
    if (bucket) applyControlCommand(bucket, command);
    if (command.trafficEvent) {
      applyControlCommand(getZoneStat(zoneStats, command.trafficEvent), command);
    }
  });

  const totals = buckets.reduce((accumulator, bucket) => {
    bucket.vehicleTrackIds.forEach((id) => accumulator.vehicleTrackIds.add(id));
    bucket.wrongwayVehicleKeys.forEach((id) => accumulator.wrongwayVehicleKeys.add(id));
    accumulator.stage1Events += bucket.stage1Events;
    accumulator.stage2Events += bucket.stage2Events;
    accumulator.wrongwayEvents += bucket.wrongwayEvents;
    accumulator.controlCommands += bucket.controlCommands;
    accumulator.dryRunCommands += bucket.dryRunCommands;
    accumulator.liveCommands += bucket.liveCommands;
    accumulator.acknowledgedCommands += bucket.acknowledgedCommands;
    accumulator.failedCommands += bucket.failedCommands;
    accumulator.responseDurationTotalMs += bucket.responseDurationTotalMs;
    accumulator.responseDurationSamples += bucket.responseDurationSamples;
    return accumulator;
  }, createBucket(start, end, bucketUnit, "total"));

  return {
    ok: true,
    range,
    bucketUnit,
    generatedAt: new Date().toISOString(),
    period: {
      start: isoDate(start),
      end: isoDate(end),
    },
    totals: finalizeStat(totals),
    buckets: buckets.map(finalizeBucket),
    zones: Array.from(zoneStats.values())
      .map(finalizeZone)
      .sort((a, b) => b.vehiclesTotal - a.vehiclesTotal || b.wrongwayEvents - a.wrongwayEvents),
  };
}

module.exports = {
  getTrafficStatistics,
  normalizeRange,
};
