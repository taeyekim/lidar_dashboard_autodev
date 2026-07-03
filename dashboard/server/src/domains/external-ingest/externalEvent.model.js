// 외부 장비마다 데이터 모양이 달라도, 대시보드 내부에서는 아래 표준 이벤트 형태로 다룬다.
// 라이다 PC, 통합 제어보드, serial reader 테스트 결과가 모두 이 모델을 거쳐 같은 흐름으로 처리된다.

// source는 이벤트가 어떤 외부 장비/테스트 경로에서 왔는지 구분하는 값이다.
const EXTERNAL_EVENT_SOURCE = {
  LIDAR_PC: "LIDAR_PC",
  CONTROL_BOARD: "CONTROL_BOARD",
  CONTROL_BOARD_SERIAL_TEST: "CONTROL_BOARD_SERIAL_TEST",
};

// eventType은 화면 반영 방식과 이력 분류를 결정하는 내부 이벤트 종류다.
const EXTERNAL_EVENT_TYPE = {
  WRONG_WAY: "WRONG_WAY",
  CONTROL_STAGE: "CONTROL_STAGE",
  SITUATION_CLEARED: "SITUATION_CLEARED",
  UNKNOWN: "UNKNOWN",
};

// 외부에서 id를 주지 않는 테스트 payload도 추적할 수 있도록 diagnostic event id를 만든다.
function createEventId() {
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

// 외부 장비 시간이 정상인지 판단하고, 서버 수신 시간과의 오차를 계산한다.
// 외부 시간이 잘못됐더라도 버리지 않고 externalOccurredAt에 원본 값을 남긴다.
function analyzeOccurredAt(value, receivedAt) {
  if (!value) {
    return {
      externalOccurredAt: null,
      occurredAt: receivedAt,
      isOccurredAtValid: false,
      timeSkewMs: null,
    };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      externalOccurredAt: value,
      occurredAt: receivedAt,
      isOccurredAtValid: false,
      timeSkewMs: null,
    };
  }

  const occurredAt = date.toISOString();
  return {
    externalOccurredAt: value,
    occurredAt,
    isOccurredAtValid: true,
    timeSkewMs: date.getTime() - new Date(receivedAt).getTime(),
  };
}

// 원본 payload를 직접 보관하되, 목록 화면/로그 추적에는 최소 요약 정보도 함께 둔다.
function createRawSummary(raw) {
  const text = JSON.stringify(raw ?? {});

  // 현장 데이터 규격 검증을 위해 rawPayload를 보존하되, 운영 로그에는 요약 정보만 남긴다.
  // 다만 서버 운영 로그에는 원본 전체를 찍지 않고, 필드 목록과 크기만 남긴다.
  return {
    payloadKeys: raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [],
    payloadSize: text.length,
  };
}

// adapter 결과를 대시보드 내부에서 공통으로 사용할 표준 이벤트 객체로 만든다.
function createExternalEvent(input) {
  const receivedAt = new Date().toISOString();
  const occurredAtInfo = analyzeOccurredAt(input.occurredAt, receivedAt);

  // 이후 service는 라이다/제어보드 원본 형식을 몰라도 이 객체만 보고 화면 반영을 처리한다.
  return {
    id: input.id || createEventId(),
    source: input.source,
    eventType: input.eventType || EXTERNAL_EVENT_TYPE.UNKNOWN,
    stage: Number(input.stage) || 0,
    siteId: input.siteId || "Site-01",
    zoneId: input.zoneId || "UNKNOWN",
    deviceId: input.deviceId || "UNKNOWN",
    trackId: input.trackId,
    message: input.message || "External event received",
    externalOccurredAt: occurredAtInfo.externalOccurredAt,
    occurredAt: occurredAtInfo.occurredAt,
    receivedAt,
    isOccurredAtValid: occurredAtInfo.isOccurredAtValid,
    timeSkewMs: occurredAtInfo.timeSkewMs,
    confidence: input.confidence,
    rawPayload: input.rawPayload ?? input.raw ?? null,
    rawSummary: input.rawSummary || createRawSummary(input.rawPayload ?? input.raw),
  };
}

module.exports = {
  EXTERNAL_EVENT_SOURCE,
  EXTERNAL_EVENT_TYPE,
  createExternalEvent,
  createRawSummary,
};
