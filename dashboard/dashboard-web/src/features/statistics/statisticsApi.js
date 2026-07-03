import { getJson } from "../../shared/api/http";

export const METRIC_DEFAULTS = {
  vehiclesTotal: 0,
  normalVehicles: 0,
  wrongwayVehicles: 0,
  wrongwayEvents: 0,
  wrongwayRate: 0,
  stage1Events: 0,
  stage2Events: 0,
  controlCommands: 0,
  dryRunCommands: 0,
  liveCommands: 0,
  acknowledgedCommands: 0,
  failedCommands: 0,
  commandSuccessRate: null,
};

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function normalizeMetric(metric = {}) {
  const sourceMetric = metric || {};
  return {
    ...METRIC_DEFAULTS,
    ...sourceMetric,
  };
}

export function normalizeTrafficStatistics(response = {}) {
  const source = response || {};
  return {
    ...source,
    totals: normalizeMetric(source.totals),
    buckets: Array.isArray(source.buckets)
      ? source.buckets.map((bucket) => {
          const sourceBucket = bucket || {};
          return {
            ...normalizeMetric(sourceBucket),
            key: sourceBucket.key,
            label: sourceBucket.label,
            start: sourceBucket.start,
            end: sourceBucket.end,
          };
        })
      : [],
    zones: Array.isArray(source.zones)
      ? source.zones.map((zone) => {
          const sourceZone = zone || {};
          return {
            ...normalizeMetric(sourceZone),
            zoneCode: sourceZone.zoneCode,
            name: sourceZone.name || sourceZone.zoneCode || "UNKNOWN",
          };
        })
      : [],
  };
}

export async function fetchTrafficStatistics(params = {}) {
  const response = await getJson(`/api/statistics/traffic${buildQuery(params)}`);
  return normalizeTrafficStatistics(response);
}
