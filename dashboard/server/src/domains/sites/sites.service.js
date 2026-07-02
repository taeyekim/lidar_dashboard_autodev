const { prisma } = require("../../prisma/client");

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeSite(site) {
  if (!site) return null;
  return {
    ...site,
    createdAt: serializeDate(site.createdAt),
    updatedAt: serializeDate(site.updatedAt),
    zones: site.zones?.map(serializeZone),
  };
}

function serializeZone(zone) {
  if (!zone) return null;
  return {
    ...zone,
    createdAt: serializeDate(zone.createdAt),
    updatedAt: serializeDate(zone.updatedAt),
    devices: zone.devices?.map(serializeDevice),
  };
}

function serializeDevice(device) {
  if (!device) return null;
  const latestStatusLog = device.deviceStatusLogs?.[0] || null;
  return {
    ...device,
    lastSeenAt: serializeDate(device.lastSeenAt),
    createdAt: serializeDate(device.createdAt),
    updatedAt: serializeDate(device.updatedAt),
    latestStatusLog: latestStatusLog
      ? {
        ...latestStatusLog,
        createdAt: serializeDate(latestStatusLog.createdAt),
      }
      : null,
  };
}

function deviceInclude() {
  return {
    zone: {
      include: { site: true },
    },
    deviceStatusLogs: {
      orderBy: { createdAt: "desc" },
      take: 1,
    },
  };
}

function buildDeviceWhere(query = {}) {
  const where = {};
  if (query.zoneId) where.zoneId = String(query.zoneId);
  if (query.deviceType) where.deviceType = String(query.deviceType);
  if (query.status) where.status = String(query.status);
  if (query.healthStatus) where.healthStatus = String(query.healthStatus);
  return where;
}

async function listSites() {
  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    include: {
      zones: {
        orderBy: { name: "asc" },
        include: {
          devices: {
            orderBy: [{ deviceType: "asc" }, { name: "asc" }],
          },
        },
      },
    },
  });

  return {
    ok: true,
    total: sites.length,
    items: sites.map(serializeSite),
  };
}

async function listZones(query = {}) {
  const where = {};
  if (query.siteId) where.siteId = String(query.siteId);
  if (query.type) where.type = String(query.type);

  const zones = await prisma.zone.findMany({
    where,
    orderBy: [{ siteId: "asc" }, { name: "asc" }],
    include: {
      site: true,
      devices: {
        orderBy: [{ deviceType: "asc" }, { name: "asc" }],
      },
    },
  });

  return {
    ok: true,
    total: zones.length,
    items: zones.map(serializeZone),
  };
}

async function listDevices(query = {}) {
  const devices = await prisma.device.findMany({
    where: buildDeviceWhere(query),
    orderBy: [{ deviceType: "asc" }, { name: "asc" }],
    include: deviceInclude(),
  });

  return {
    ok: true,
    total: devices.length,
    items: devices.map(serializeDevice),
  };
}

async function getDeviceStatusSummary() {
  const [total, byStatus, byHealthStatus, byType, latestStatusLog, latestCommand] = await Promise.all([
    prisma.device.count(),
    prisma.device.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.device.groupBy({ by: ["healthStatus"], _count: { _all: true } }),
    prisma.device.groupBy({ by: ["deviceType"], _count: { _all: true } }),
    prisma.deviceStatusLog.findFirst({ orderBy: { createdAt: "desc" }, include: { device: true } }),
    prisma.controlCommand.findFirst({ orderBy: { requestedAt: "desc" }, include: { targetDevice: true } }),
  ]);

  return {
    ok: true,
    total,
    configured: total > 0,
    byStatus: Object.fromEntries(byStatus.map((item) => [item.status, item._count._all])),
    byHealthStatus: Object.fromEntries(byHealthStatus.map((item) => [item.healthStatus, item._count._all])),
    byType: Object.fromEntries(byType.map((item) => [item.deviceType, item._count._all])),
    latestStatusLog: latestStatusLog
      ? {
        ...latestStatusLog,
        createdAt: serializeDate(latestStatusLog.createdAt),
      }
      : null,
    latestCommand: latestCommand
      ? {
        ...latestCommand,
        requestedAt: serializeDate(latestCommand.requestedAt),
        sentAt: serializeDate(latestCommand.sentAt),
        acknowledgedAt: serializeDate(latestCommand.acknowledgedAt),
        completedAt: serializeDate(latestCommand.completedAt),
        createdAt: serializeDate(latestCommand.createdAt),
        updatedAt: serializeDate(latestCommand.updatedAt),
      }
      : null,
  };
}

module.exports = {
  listSites,
  listZones,
  listDevices,
  getDeviceStatusSummary,
};
