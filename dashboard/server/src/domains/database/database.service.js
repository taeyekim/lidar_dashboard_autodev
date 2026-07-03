const { prisma } = require("../../prisma/client");

async function getDatabaseHealth() {
  const checkedAt = new Date().toISOString();

  // Confirm both database connectivity and basic table query availability.
  await prisma.$queryRaw`SELECT 1`;

  const [
    siteCount,
    zoneCount,
    deviceCount,
    vehicleTrackCount,
    eventCount,
    eventLogCount,
    controlCommandCount,
    controlCommandLogCount,
    deviceStatusLogCount,
    userCount,
  ] = await Promise.all([
    prisma.site.count(),
    prisma.zone.count(),
    prisma.device.count(),
    prisma.vehicleTrack.count(),
    prisma.trafficEvent.count(),
    prisma.eventLog.count(),
    prisma.controlCommand.count(),
    prisma.controlCommandLog.count(),
    prisma.deviceStatusLog.count(),
    prisma.user.count(),
  ]);

  return {
    ok: true,
    checkedAt,
    database: "postgresql",
    tables: {
      users: userCount,
      sites: siteCount,
      zones: zoneCount,
      devices: deviceCount,
      vehicleTracks: vehicleTrackCount,
      trafficEvents: eventCount,
      eventLogs: eventLogCount,
      controlCommands: controlCommandCount,
      controlCommandLogs: controlCommandLogCount,
      deviceStatusLogs: deviceStatusLogCount,
    },
  };
}

module.exports = { getDatabaseHealth };
