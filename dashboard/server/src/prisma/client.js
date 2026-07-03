const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { logger } = require("../utils/logger");

// Reuse the Prisma client during local hot reloads to avoid connection churn.
const globalForPrisma = globalThis;
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma =
  globalForPrisma.__lidarDashboardPrisma ||
  new PrismaClient({
    adapter,
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

prisma.$on("error", (event) => {
  logger.error("prisma error", {
    target: event.target,
    message: event.message,
  });
});

prisma.$on("warn", (event) => {
  logger.warn("prisma warning", {
    target: event.target,
    message: event.message,
  });
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__lidarDashboardPrisma = prisma;
}

module.exports = { prisma };
