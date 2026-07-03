const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const commandLogs = [];
let commandRow = null;
let sendAttempts = 0;

const now = new Date("2026-07-03T12:00:00.000Z");

const tx = {
  device: {
    findFirst: async () => ({
      id: "control-board-device-1",
      deviceCode: "CONTROL-BOARD-001",
      name: "Loopback Guard Device",
    }),
  },
  controlCommand: {
    create: async ({ data }) => {
      commandRow = {
        id: "control-command-live-approval-guard",
        ...data,
        requestedAt: now,
        sentAt: null,
        acknowledgedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        logs: [],
      };
      return commandRow;
    },
    update: async ({ data }) => {
      commandRow = {
        ...commandRow,
        ...data,
        updatedAt: now,
        logs: commandLogs,
      };
      return commandRow;
    },
  },
  controlCommandLog: {
    create: async ({ data }) => {
      const log = {
        id: `command-log-${commandLogs.length + 1}`,
        ...data,
        createdAt: now,
      };
      commandLogs.push(log);
      return log;
    },
  },
};

const prisma = {
  $transaction: async (callback) => callback(tx),
  controlCommand: {
    findFirst: async () => commandRow,
    groupBy: async () => [{ status: commandRow?.status || "FAILED", _count: { _all: 1 } }],
    findMany: async () => [],
  },
};

function mockModule(relativePath, exports) {
  const resolved = require.resolve(path.join(__dirname, "..", relativePath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

mockModule("src/prisma/client.js", { prisma });
mockModule("src/realtime/bus.js", {
  broadcastRealtime: () => {},
  setRealtimeBroadcaster: () => {},
});
mockModule("src/utils/logger.js", {
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
});
mockModule("src/domains/control-board/adapters/tcpControlBoard.adapter.js", {
  sendRawPacket: async () => {
    sendAttempts += 1;
    throw new Error("sendRawPacket must not be called without live TCP approval");
  },
});

const { COMMAND_STATUS, getStatus, sendCommand } = require("../src/domains/control-board/controlBoard.service");

async function main() {
  const command = await sendCommand("STAGE_1_ON", {
    requestedByUserId: "field-operator-1",
    config: {
      dryRun: false,
      liveApproved: false,
      host: "127.0.0.1",
      port: 65000,
      connectTimeoutMs: 25,
      responseTimeoutMs: 25,
      retryCount: 0,
    },
  });

  assert(sendAttempts === 0, "live TCP approval guard must block before sendRawPacket is called");
  assert(command.status === COMMAND_STATUS.FAILED, `unapproved LIVE_TCP command must fail, got ${command.status}`);
  assert(
    command.errorMessage === "CONTROL_BOARD_LIVE_APPROVED is not true; live TCP send blocked.",
    `unexpected approval guard error: ${command.errorMessage}`,
  );

  const approvalLog = command.logs.find((log) => log.action === "LIVE_TCP_APPROVAL_REQUIRED");
  assert(approvalLog, "unapproved LIVE_TCP command must record LIVE_TCP_APPROVAL_REQUIRED evidence");
  assert(approvalLog.metadata.packetHex === "02 A1 10 01 01 02 00 9B 03 0D", "approval log must retain packetHex evidence");
  assert(approvalLog.metadata.hostConfigured === true, "approval log must record hostConfigured=true");
  assert(approvalLog.metadata.portConfigured === true, "approval log must record portConfigured=true");
  assert(approvalLog.metadata.liveApproved === false, "approval log must record liveApproved=false");

  assert(
    !command.logs.some((log) => log.action === "TCP_SEND_STARTED"),
    "unapproved LIVE_TCP command must not record TCP_SEND_STARTED",
  );
  assert(
    !command.logs.some((log) => log.action === "TCP_SEND_ATTEMPT_FAILED"),
    "unapproved LIVE_TCP command must not attempt retryable TCP sends",
  );

  process.env.CONTROL_BOARD_DRY_RUN = "false";
  process.env.CONTROL_BOARD_LIVE_APPROVED = "false";
  process.env.CONTROL_BOARD_HOST = "127.0.0.1";
  process.env.CONTROL_BOARD_PORT = "65000";

  const status = await getStatus();
  assert(status.mode === "LIVE_TCP", `status mode must expose LIVE_TCP, got ${status.mode}`);
  assert(status.liveTcpReady === false, "LIVE_TCP without approval must not be ready");
  assert(status.liveApproved === false, "status must expose liveApproved=false");
  assert(status.safetyStatus === "LIVE_TCP_REVIEW", `status must expose LIVE_TCP_REVIEW, got ${status.safetyStatus}`);
  assert(status.latestCommand.status === COMMAND_STATUS.FAILED, "status latestCommand must retain failed approval guard command");

  console.log("control board live approval guard ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
