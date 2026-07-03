const {
  EXTERNAL_EVENT_SOURCE,
  EXTERNAL_EVENT_TYPE,
  createExternalEvent,
  createRawSummary,
} = require("../externalEvent.model");
const { parseControlBoardPacket } = require("../protocol/controlBoardProtocol");

// command 값은 제어보드 신호 의미를 내부 이벤트 종류와 경고 단계로 매핑한다.
const COMMAND_EVENT_MAP = {
  STAGE_1_ON: { eventType: EXTERNAL_EVENT_TYPE.CONTROL_STAGE, stage: 1, message: "통합 제어보드 1차 경고 시작" },
  STAGE_2_ON: { eventType: EXTERNAL_EVENT_TYPE.CONTROL_STAGE, stage: 2, message: "통합 제어보드 2차 경고 시작" },
  STAGE_2_RETURN: { eventType: EXTERNAL_EVENT_TYPE.SITUATION_CLEARED, stage: 2, message: "통합 제어보드 2차 복귀/해제" },
  SYSTEM_RESET: { eventType: EXTERNAL_EVENT_TYPE.SITUATION_CLEARED, stage: 0, message: "통합 제어보드 전체 시스템 리셋" },
  UNKNOWN: { eventType: EXTERNAL_EVENT_TYPE.UNKNOWN, stage: 0, message: "통합 제어보드 패킷 수신" },
};

function getFallbackCommand(payload) {
  // packet이 아직 없거나 파싱할 수 없을 때는 Swagger 테스트용 command 값을 사용한다.
  return String(payload.command || payload.commandCode || "UNKNOWN").toUpperCase();
}

function getParsedCommand(payload, packetResult) {
  // 실제 패킷에서 해석한 command를 우선 사용한다.
  // packet 해석이 UNKNOWN이면 기존 mock command 값을 fallback으로 사용해 테스트 편의성을 유지한다.
  if (packetResult?.command && packetResult.command !== "UNKNOWN") return packetResult.command;
  return getFallbackCommand(payload);
}

function getCrcStatus(payload, packetResult) {
  // packet이 있으면 실제 CRC 계산 결과를 우선 사용한다.
  // packet이 없으면 기존 mock 테스트용 crcValid 값을 사용한다.
  if (packetResult?.crcStatus) return packetResult.crcStatus;
  return payload.crcValid === true ? "VALID" : payload.crcValid === false ? "INVALID" : "NOT_VERIFIED";
}

function adaptControlBoardPacket(payload = {}, options = {}) {
  // 통합 제어보드는 Ethernet/TCP payload로 10바이트 raw frame을 주고받는 것을 기준으로 한다.
  // 이 adapter는 HTTP mock/브릿지로 받은 packet도 실제 TCP payload와 같은 방식으로 파싱해서 내부 이벤트로 바꾼다.
  // packet이 없으면 기존 command/crcValid 기반 mock 흐름을 유지해 Swagger 테스트를 계속 사용할 수 있다.
  const packetResult = payload.packet ? parseControlBoardPacket(payload.packet) : null;
  const command = getParsedCommand(payload, packetResult);
  const mapped = COMMAND_EVENT_MAP[command] || COMMAND_EVENT_MAP.UNKNOWN;
  const crcStatus = getCrcStatus(payload, packetResult);

  return createExternalEvent({
    id: payload.id || payload.event_id,
    source: options.source || EXTERNAL_EVENT_SOURCE.CONTROL_BOARD,
    eventType: payload.eventType || mapped.eventType,
    stage: payload.stage ?? mapped.stage,
    siteId: payload.site_id || payload.siteId,
    zoneId: payload.zone_id || payload.zoneId,
    deviceId: payload.device_id || payload.deviceId || "CONTROL-BOARD-01",
    message: payload.message || mapped.message,
    occurredAt: payload.timestamp || payload.occurred_at || payload.occurredAt,
    rawPayload: payload,
    rawSummary: {
      ...createRawSummary(payload),
      command,
      crcStatus,
      packetSize: packetResult?.packetSize || 0,
      packetBytes: packetResult?.hex || [],
      crcExpected: packetResult?.crcExpected ?? null,
      crcCalculated: packetResult?.crcCalculated ?? null,
      packetValid: packetResult?.isValid ?? crcStatus === "VALID",
      packetErrors: packetResult?.errors || [],
      parsed: packetResult?.parsed || null,
    },
  });
}

module.exports = {
  adaptControlBoardPacket,
};
