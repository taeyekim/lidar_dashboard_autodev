const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { hashPassword } = require("../src/domains/auth/password");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminUserId = process.env.SEED_ADMIN_USER_ID || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin1234!";
  const adminName = process.env.SEED_ADMIN_NAME || "System Administrator";

  await prisma.user.upsert({
    where: { userId: adminUserId },
    update: {
      name: adminName,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    create: {
      userId: adminUserId,
      name: adminName,
      passwordHash: hashPassword(adminPassword),
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  const site = await prisma.site.upsert({
    where: { id: "site-wolchulsan-rest-area" },
    update: {
      name: "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C",
      location: "\uC804\uB77C\uB0A8\uB3C4 \uC601\uC554\uAD70",
      description:
        "\uB77C\uC774\uB2E4 \uC5ED\uC8FC\uD589 \uBC29\uC9C0 \uC2DC\uC2A4\uD15C 1\uCC28 \uAC1C\uBC1C \uB300\uC0C1 \uD604\uC7A5",
    },
    create: {
      id: "site-wolchulsan-rest-area",
      name: "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C",
      location: "\uC804\uB77C\uB0A8\uB3C4 \uC601\uC554\uAD70",
      description:
        "\uB77C\uC774\uB2E4 \uC5ED\uC8FC\uD589 \uBC29\uC9C0 \uC2DC\uC2A4\uD15C 1\uCC28 \uAC1C\uBC1C \uB300\uC0C1 \uD604\uC7A5",
    },
  });

  const roundabout1 = await prisma.zone.upsert({
    where: { zoneCode: "ROUNDABOUT-01" },
    update: {
      siteId: site.id,
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 1",
      type: "ROUNDABOUT",
      description:
        "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C \uD68C\uC804\uAD50\uCC28\uB85C 1",
    },
    create: {
      siteId: site.id,
      zoneCode: "ROUNDABOUT-01",
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 1",
      type: "ROUNDABOUT",
      description:
        "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C \uD68C\uC804\uAD50\uCC28\uB85C 1",
    },
  });

  const roundabout2 = await prisma.zone.upsert({
    where: { zoneCode: "ROUNDABOUT-02" },
    update: {
      siteId: site.id,
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 2",
      type: "ROUNDABOUT",
      description:
        "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C \uD68C\uC804\uAD50\uCC28\uB85C 2",
    },
    create: {
      siteId: site.id,
      zoneCode: "ROUNDABOUT-02",
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 2",
      type: "ROUNDABOUT",
      description:
        "\uC6D4\uCD9C\uC0B0\uD734\uAC8C\uC18C \uD68C\uC804\uAD50\uCC28\uB85C 2",
    },
  });

  const devices = [
    {
      zoneId: roundabout1.id,
      deviceCode: "LIDAR-PC-01",
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 1 \uB77C\uC774\uB2E4 PC",
      deviceType: "LIDAR_PC",
      installedLocation: "\uD68C\uC804\uAD50\uCC28\uB85C 1",
    },
    {
      zoneId: roundabout1.id,
      deviceCode: "CONTROL-BOARD-01",
      name:
        "\uD68C\uC804\uAD50\uCC28\uB85C 1 \uD1B5\uD569\uC81C\uC5B4\uBCF4\uB4DC",
      deviceType: "CONTROL_BOARD",
      installedLocation: "\uD68C\uC804\uAD50\uCC28\uB85C 1",
    },
    {
      zoneId: roundabout2.id,
      deviceCode: "LIDAR-PC-02",
      name: "\uD68C\uC804\uAD50\uCC28\uB85C 2 \uB77C\uC774\uB2E4 PC",
      deviceType: "LIDAR_PC",
      installedLocation: "\uD68C\uC804\uAD50\uCC28\uB85C 2",
    },
    {
      zoneId: roundabout2.id,
      deviceCode: "CONTROL-BOARD-02",
      name:
        "\uD68C\uC804\uAD50\uCC28\uB85C 2 \uD1B5\uD569\uC81C\uC5B4\uBCF4\uB4DC",
      deviceType: "CONTROL_BOARD",
      installedLocation: "\uD68C\uC804\uAD50\uCC28\uB85C 2",
    },
  ];

  for (const device of devices) {
    await prisma.device.upsert({
      where: { deviceCode: device.deviceCode },
      update: {
        zoneId: device.zoneId,
        name: device.name,
        deviceType: device.deviceType,
        installedLocation: device.installedLocation,
      },
      create: {
        ...device,
        status: "UNKNOWN",
        healthStatus: "UNKNOWN",
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
