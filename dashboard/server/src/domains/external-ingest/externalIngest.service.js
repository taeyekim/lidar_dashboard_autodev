const { logger } = require("../../utils/logger");
const { prisma } = require("../../prisma/client");
const { broadcastRealtime } = require("../../realtime/bus");
const mockLidarService = require("../mock-lidar/mockLidar.service");
const wrongwayService = require("../wrongway/wrongway.service");
const { EXTERNAL_EVENT_SOURCE, EXTERNAL_EVENT_TYPE } = require("./externalEvent.model");
const { adaptControlBoardPacket } = require("./adapters/controlBoardPacket.adapter");

// 최근 수신 이벤트는 DB 저장 전까지 메모리에 최대 50건만 유지한다.
const MAX_RECENT_EVENTS = 50;

// recentEvents는 현장 테스트 중 수신 여부를 확인하기 위한 임시 메모리 저장소다.
let recentEvents = [];

// 새 이벤트를 맨 앞에 넣고, 오래된 이벤트는 최대 개수를 넘으면 잘라낸다.
function rememberEvent(event) {
  // DB 저장 전 단계라 최근 수신 이벤트만 메모리에 보관한다.
  // 현장 테스트에서는 이 목록으로 "백엔드가 실제로 받았는지"를 빠르게 확인할 수 있다.
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents = recentEvents.slice(0, MAX_RECENT_EVENTS);
  }
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

async function recordDeviceStatus(event) {
  if (!event?.deviceId) return null;

  const packetInvalid = event.rawSummary?.crcStatus === "INVALID" || event.rawSummary?.packetValid === false;
  const status = packetInvalid ? "ERROR" : "ONLINE";
  const health = packetInvalid ? "ERROR" : event.rawSummary?.crcStatus || "UNKNOWN";

  const device = await prisma.device.findFirst({
    where: { deviceCode: event.deviceId },
    select: { id: true },
  });

  const log = await prisma.$transaction(async (tx) => {
    if (device?.id) {
      await tx.device.update({
        where: { id: device.id },
        data: {
          status,
          healthStatus: health,
          lastSeenAt: new Date(event.receivedAt),
        },
      });
    }

    return tx.deviceStatusLog.create({
      data: {
        deviceId: device?.id || null,
        source: event.source || EXTERNAL_EVENT_SOURCE.CONTROL_BOARD,
        status,
        health,
        message: event.message,
        metadata: {
          externalDeviceId: event.deviceId,
          eventId: event.id,
          crcStatus: event.rawSummary?.crcStatus || null,
          packetValid: event.rawSummary?.packetValid ?? null,
          command: event.rawSummary?.command || null,
        },
      },
      include: { device: true },
    });
  });

  const serialized = {
    ...log,
    createdAt: serializeDate(log.createdAt),
  };
  broadcastRealtime("device-status.updated", serialized);
  return serialized;
}

// 내부 표준 이벤트를 프론트 모달/이력에 전달할 dashboardEvent 형태로 변환한다.
function toDashboardEvent(event) {
  // dashboardEvent는 브라우저 alert()가 아니라, WebSocket으로 전달되는 화면용 이벤트 payload다.
  // 프론트는 이 payload 중 wrong-way 타입만 모달로 표시한다.
  return {
    id: event.id,
    type: event.eventType === EXTERNAL_EVENT_TYPE.WRONG_WAY ? "wrong-way" : "external-control",
    stage: event.stage,
    message: event.message,
    subMessage: `Zone: ${event.zoneId}`,
    timestamp: new Date(event.occurredAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    zone_id: event.zoneId,
    track_id: event.trackId,
    confidence: event.confidence,
    device_id: event.deviceId,
    source: event.source,
  };
}

// 내부 이벤트를 화면 상태, 알림, 이력, 로그에 실제로 반영한다.
function applyDashboardEffects(event) {
  // 외부 이벤트가 들어오면 기존 mockLidarService를 통해 화면 상태, 이력, WebSocket 알림을 갱신한다.
  // 상황 해제 이벤트는 신규 역주행 건수로 세지 않기 위해 로그만 남긴다.
  // 통합 제어보드 패킷의 CRC나 프레임 구조가 잘못된 경우에는 화면 이벤트로 전파하지 않는다.
  // 대신 recentEvents/rawPayload/rawSummary에는 남겨서 현장에서 어떤 패킷이 들어왔는지 확인할 수 있게 한다.
  if (event.rawSummary?.crcStatus === "INVALID" || event.rawSummary?.packetValid === false) {
    mockLidarService.pushLog(`[INGEST:INVALID] ${event.message}`);
    return;
  }

  if (event.eventType === EXTERNAL_EVENT_TYPE.SITUATION_CLEARED) {
    mockLidarService.pushLog(`[INGEST] ${event.message}`);
    return;
  }

  const dashboardEvent = toDashboardEvent(event);
  mockLidarService.applyDashboardEventEffects(dashboardEvent);
  mockLidarService.addWrongWayHistory(dashboardEvent);
  mockLidarService.broadcastDashboardEvent(dashboardEvent);
  mockLidarService.pushLog(`[INGEST] ${event.message}`);
}

// 실제 라이다 PC와 mock 라이다 테스트 API가 같은 변환/화면 반영 흐름을 타도록 공통 처리한다.
async function ingestLidar(payload, options = {}) {
  const mode = options.mode || "LIVE";
  const result = await wrongwayService.ingestWrongwayPayload(payload, {
    source: EXTERNAL_EVENT_SOURCE.LIDAR_PC,
    mode,
  });
  const event = result.event;

  logger.info("external lidar ingest received", {
    id: result.eventId,
    mode,
    zoneId: event.externalZoneId,
    trackId: event.trackId,
  });

  rememberEvent({
    ...event,
    id: result.eventId || event.id,
    source: EXTERNAL_EVENT_SOURCE.LIDAR_PC,
    eventType: event.eventType || event.type,
  });
  return result;
}

// 실제 라이다 PC가 현장에서 호출할 HTTP/JSON 수신 진입점이다.
function ingestLidarLive(payload) {
  return ingestLidar(payload, { mode: "LIVE" });
}

// 개발자와 Swagger/curl 테스트에서 사용할 라이다 mock 수신 진입점이다.
function ingestLidarMock(payload) {
  return ingestLidar(payload, { mode: "MOCK" });
}

// 통합 제어보드 mock 패킷 수신을 처리하는 service 진입점이다.
async function ingestControlBoardMock(payload) {
  // 통합 제어보드 mock API의 핵심 흐름: 패킷 흉내 데이터 -> control-board adapter -> 내부 이벤트 -> 화면 반영.
  // 실제 RS-485 수신 전에도 Swagger/curl로 제어보드 이벤트 흐름을 먼저 검증할 수 있다.
  const event = adaptControlBoardPacket(payload);
  logger.info("external control board mock packet received", {
    id: event.id,
    command: event.rawSummary.command,
    crcStatus: event.rawSummary.crcStatus,
    packetValid: event.rawSummary.packetValid,
  });

  rememberEvent(event);
  await recordDeviceStatus(event);
  applyDashboardEffects(event);
  return event;
}

// 통합 제어보드 실제 HTTP 수신을 처리하는 service 진입점이다.
async function ingestControlBoardLive(payload) {
  // 현장에서는 RS-485 직접 연결, HTTP 브릿지, 테스트 프로그램 중 어떤 방식이 될지 아직 확정되지 않았다.
  // 그래서 실제 수신용 URL은 먼저 열어두고, 내부 처리는 mock과 같은 parser/adapter 흐름을 재사용한다.
  const event = adaptControlBoardPacket(payload);

  logger.info("external control board packet received", {
    id: event.id,
    mode: "LIVE",
    command: event.rawSummary.command,
    crcStatus: event.rawSummary.crcStatus,
    packetValid: event.rawSummary.packetValid,
  });

  rememberEvent(event);
  await recordDeviceStatus(event);
  applyDashboardEffects(event);
  return event;
}

// 실제 COM 포트를 열기 전, serial reader 입력 형태만 검증하는 테스트 진입점이다.
async function createSerialTest(payload = {}) {
  // serial reader 테스트는 아직 COM 포트를 열지 않는다.
  // 지금은 현장에서 사용할 port/baudRate/samplePacket 입력 형태와 adapter 연결 흐름만 미리 맞춰둔다.
  const serial = {
    port: payload.port || "COM1",
    baudRate: Number(payload.baudRate) || 9600,
  };

  const event = payload.samplePacket
    ? adaptControlBoardPacket(
        { ...payload, packet: payload.samplePacket },
        { source: EXTERNAL_EVENT_SOURCE.CONTROL_BOARD_SERIAL_TEST },
      )
    : null;

  if (event) {
    rememberEvent(event);
    await recordDeviceStatus(event);
    applyDashboardEffects(event);
  }

  logger.info("control board serial reader test requested", {
    port: serial.port,
    baudRate: serial.baudRate,
    hasSamplePacket: Boolean(payload.samplePacket),
  });

  return {
    mode: "SERIAL_READER_NOT_CONNECTED",
    serial,
    event,
  };
}

// 최근 수신 이벤트를 조회한다. 현장 테스트 확인용이라 DB 없이 메모리 목록을 반환한다.
function getRecentEvents(limit = 20) {
  return recentEvents.slice(0, limit);
}

// 외부 장비 수신 상태를 현장 점검용으로 요약한다.
function getIngestStatus() {
  // DB가 붙기 전까지는 recentEvents 메모리 목록이 유일한 수신 근거다.
  // 그래서 최근 이벤트를 기준으로 "마지막 수신 시각", "최근 오류 패킷 수", "장비별 최근 수신"만 빠르게 보여준다.
  const now = new Date().toISOString();
  const invalidEvents = recentEvents.filter(
    (event) => event.rawSummary?.crcStatus === "INVALID" || event.rawSummary?.packetValid === false,
  );

  const lastLidarEvent = recentEvents.find((event) => String(event.source || "").includes("LIDAR"));
  const lastControlBoardEvent = recentEvents.find((event) =>
    String(event.source || "").includes("CONTROL_BOARD"),
  );

  const lastEvent = recentEvents[0] || null;

  return {
    ok: true,
    checkedAt: now,
    storage: "MEMORY",
    totalRecentEvents: recentEvents.length,
    invalidRecentEvents: invalidEvents.length,
    lastReceivedAt: lastEvent?.receivedAt || null,
    lastLidarReceivedAt: lastLidarEvent?.receivedAt || null,
    lastControlBoardReceivedAt: lastControlBoardEvent?.receivedAt || null,
    lastEvent,
    lastInvalidEvent: invalidEvents[0] || null,
  };
}

module.exports = {
  ingestLidarLive,
  ingestLidarMock,
  ingestControlBoardLive,
  ingestControlBoardMock,
  createSerialTest,
  getRecentEvents,
  getIngestStatus,
};
