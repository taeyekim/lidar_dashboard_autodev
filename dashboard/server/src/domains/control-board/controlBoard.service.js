const crypto = require("crypto");
const { prisma } = require("../../prisma/client");
const { broadcastRealtime } = require("../../realtime/bus");
const { logger } = require("../../utils/logger");
const {
  buildControlBoardCommandPacket,
  parseControlBoardPacket,
  validateControlBoardCommandResponse,
} = require("../external-ingest/protocol/controlBoardProtocol");
const { getControlBoardConfig } = require("./controlBoard.config");
const { sendRawPacket } = require("./adapters/tcpControlBoard.adapter");

const COMMAND_STATUS = {
  PENDING: "PENDING",
  DRY_RUN: "DRY_RUN",
  SENT: "SENT",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  FAILED: "FAILED",
};

const WRONGWAY_COMMAND_MAP = {
  "wrong-way-level-1": "STAGE_1_ON",
  "wrong-way-level-2": "STAGE_2_ON",
  "situation-ended": "STAGE_2_RETURN",
};

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeCommand(command) {
  if (!command) return null;
  return {
    ...command,
    requestedAt: serializeDate(command.requestedAt),
    sentAt: serializeDate(command.sentAt),
    acknowledgedAt: serializeDate(command.acknowledgedAt),
    completedAt: serializeDate(command.completedAt),
    createdAt: serializeDate(command.createdAt),
    updatedAt: serializeDate(command.updatedAt),
    logs: command.logs?.map((log) => ({
      ...log,
      createdAt: serializeDate(log.createdAt),
    })),
  };
}

function commandCode(commandType) {
  return `cmd-${commandType.toLowerCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function findDefaultControlBoardDevice(tx) {
  return tx.device.findFirst({
    where: { deviceType: "CONTROL_BOARD" },
    orderBy: { createdAt: "asc" },
    select: { id: true, deviceCode: true, name: true },
  });
}

async function createCommandRow(tx, commandType, packet, options = {}) {
  const device = options.targetDeviceId
    ? { id: options.targetDeviceId }
    : await findDefaultControlBoardDevice(tx);

  const command = await tx.controlCommand.create({
    data: {
      commandCode: commandCode(commandType),
      commandType,
      status: COMMAND_STATUS.PENDING,
      transport: "TCP",
      targetDeviceId: device?.id || null,
      trafficEventId: options.trafficEventId || null,
      mode: packet.mode,
      statusCode: packet.statusCode,
      selectCode: packet.selectCode,
      packetHex: packet.packetHex,
      requestedByUserId: options.requestedByUserId || null,
      metadata: {
        dryRun: options.config?.dryRun ?? true,
        hostConfigured: Boolean(options.config?.host),
        portConfigured: Boolean(options.config?.port),
        trigger: options.trigger || "MANUAL",
        label: packet.label,
        source: options.source || "CONTROL_BOARD_SERVICE",
      },
    },
  });

  await tx.controlCommandLog.create({
    data: {
      controlCommandId: command.id,
      action: "COMMAND_CREATED",
      message: `${commandType} command created.`,
      metadata: { packetHex: packet.packetHex },
    },
  });

  return command;
}

async function updateCommand(commandId, data, log) {
  return prisma.$transaction(async (tx) => {
    if (log) {
      await tx.controlCommandLog.create({
        data: {
          controlCommandId: commandId,
          action: log.action,
          message: log.message,
          metadata: log.metadata,
        },
      });
    }

    const command = await tx.controlCommand.update({
      where: { id: commandId },
      data,
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });

    return command;
  });
}

async function addCommandLog(commandId, log) {
  return prisma.controlCommandLog.create({
    data: {
      controlCommandId: commandId,
      action: log.action,
      message: log.message,
      metadata: log.metadata,
    },
  });
}

async function sendRawPacketWithRetry(packetBuffer, config, commandId) {
  const maxAttempts = Math.max(1, (Number(config.retryCount) || 0) + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        await addCommandLog(commandId, {
          action: "TCP_SEND_RETRY",
          message: `Retrying control board command (${attempt}/${maxAttempts}).`,
          metadata: { attempt, maxAttempts },
        });
      }
      return await sendRawPacket(packetBuffer, config);
    } catch (error) {
      lastError = error;
      await addCommandLog(commandId, {
        action: "TCP_SEND_ATTEMPT_FAILED",
        message: `Control board command attempt ${attempt}/${maxAttempts} failed.`,
        metadata: {
          attempt,
          maxAttempts,
          errorMessage: error.message,
          willRetry: attempt < maxAttempts,
        },
      });
    }
  }

  throw lastError;
}

async function sendCommand(commandType, options = {}) {
  const config = { ...getControlBoardConfig(), ...(options.config || {}) };
  const packet = buildControlBoardCommandPacket(commandType);

  const command = await prisma.$transaction(async (tx) => createCommandRow(tx, commandType, packet, {
    ...options,
    config,
  }));

  broadcastRealtime("control-command.created", serializeCommand(command));

  if (config.dryRun) {
    const updated = await updateCommand(
      command.id,
      {
        status: COMMAND_STATUS.DRY_RUN,
        completedAt: new Date(),
      },
      {
        action: "DRY_RUN_SKIPPED_SEND",
        message: "CONTROL_BOARD_DRY_RUN=true, TCP send skipped.",
        metadata: { packetHex: packet.packetHex },
      },
    );

    broadcastRealtime("control-command.updated", serializeCommand(updated));

    logger.info("control board command dry-run", {
      commandId: command.id,
      commandType,
      packetHex: packet.packetHex,
    });

    return serializeCommand(updated);
  }

  try {
    const sentAt = new Date();
    await updateCommand(
      command.id,
      { status: COMMAND_STATUS.SENT, sentAt },
      {
        action: "TCP_SEND_STARTED",
        message: `Sending command to ${config.host}:${config.port}.`,
        metadata: { host: config.host, port: config.port, packetHex: packet.packetHex },
      },
    );

    const response = await sendRawPacketWithRetry(packet.buffer, config, command.id);
    const parsed = parseControlBoardPacket(Array.from(response.responseBuffer));
    const validation = validateControlBoardCommandResponse(commandType, parsed);
    const ok = validation.ok;

    const updated = await updateCommand(
      command.id,
      {
        status: ok ? COMMAND_STATUS.ACKNOWLEDGED : COMMAND_STATUS.FAILED,
        responseHex: response.responseHex,
        crcStatus: parsed.crcStatus,
        acknowledgedAt: ok ? new Date() : null,
        completedAt: new Date(),
        errorMessage: ok ? null : validation.errors.join("; "),
      },
      {
        action: ok ? "TCP_RESPONSE_ACKNOWLEDGED" : "TCP_RESPONSE_INVALID",
        message: ok ? "Control board response acknowledged." : "Control board response failed validation.",
        metadata: {
          responseHex: response.responseHex,
          trailingByteCount: response.trailingByteCount,
          trailingHex: response.trailingHex,
          parsed,
          validation,
        },
      },
    );

    const serialized = serializeCommand(updated);
    broadcastRealtime("control-command.updated", serialized);
    return serialized;
  } catch (error) {
    const updated = await updateCommand(
      command.id,
      {
        status: COMMAND_STATUS.FAILED,
        errorMessage: error.message,
        completedAt: new Date(),
      },
      {
        action: "TCP_SEND_FAILED",
        message: error.message,
        metadata: { host: config.host, port: config.port },
      },
    );

    logger.error("control board command failed", {
      commandId: command.id,
      commandType,
      error,
    });

    const serialized = serializeCommand(updated);
    broadcastRealtime("control-command.updated", serialized);
    return serialized;
  }
}

async function createCommandForWrongwayEvent(payloadType, trafficEvent) {
  const commandType = WRONGWAY_COMMAND_MAP[payloadType];
  if (!commandType || !trafficEvent?.id) return null;

  const existingCommand = await prisma.controlCommand.findFirst({
    where: {
      trafficEventId: trafficEvent.id,
      commandType,
    },
    orderBy: { requestedAt: "asc" },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  });

  if (existingCommand) {
    logger.info("control board command reused for wrongway event", {
      commandId: existingCommand.id,
      commandType,
      trafficEventId: trafficEvent.id,
      status: existingCommand.status,
    });
    return serializeCommand(existingCommand);
  }

  return sendCommand(commandType, {
    trafficEventId: trafficEvent.id,
    trigger: "WRONGWAY_EVENT",
    source: "WRONGWAY_API",
  });
}

async function listCommands(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const where = {};
  if (query.status) where.status = String(query.status);
  if (query.commandType) where.commandType = String(query.commandType);
  if (query.trafficEventId) where.trafficEventId = String(query.trafficEventId);

  const [total, items] = await Promise.all([
    prisma.controlCommand.count({ where }),
    prisma.controlCommand.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      take: limit,
      include: { logs: { orderBy: { createdAt: "asc" } }, trafficEvent: true, targetDevice: true },
    }),
  ]);

  return {
    ok: true,
    total,
    items: items.map(serializeCommand),
  };
}

async function getStatus() {
  const config = getControlBoardConfig();
  const [latestCommand, counts] = await Promise.all([
    prisma.controlCommand.findFirst({
      orderBy: { requestedAt: "desc" },
      include: { logs: { orderBy: { createdAt: "asc" } }, targetDevice: true },
    }),
    prisma.controlCommand.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return {
    ok: true,
    mode: config.dryRun ? "DRY_RUN" : "LIVE_TCP",
    transport: config.transport,
    hostConfigured: Boolean(config.host),
    portConfigured: Boolean(config.port),
    connectTimeoutMs: config.connectTimeoutMs,
    responseTimeoutMs: config.responseTimeoutMs,
    retryCount: config.retryCount,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    byStatus: Object.fromEntries(counts.map((item) => [item.status, item._count._all])),
    latestCommand: serializeCommand(latestCommand),
  };
}

module.exports = {
  COMMAND_STATUS,
  sendCommand,
  createCommandForWrongwayEvent,
  listCommands,
  getStatus,
};
