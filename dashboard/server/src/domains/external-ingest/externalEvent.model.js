// External devices can send different payload shapes. Normalize LiDAR PC,
// integrated control-board, and legacy diagnostic inputs into this event model.

// Source identifies which external device or diagnostic path produced the event.
const EXTERNAL_EVENT_SOURCE = {
  LIDAR_PC: "LIDAR_PC",
  CONTROL_BOARD: "CONTROL_BOARD",
  CONTROL_BOARD_SERIAL_TEST: "CONTROL_BOARD_SERIAL_TEST",
};

// Event type controls dashboard presentation and history classification.
const EXTERNAL_EVENT_TYPE = {
  WRONG_WAY: "WRONG_WAY",
  CONTROL_STAGE: "CONTROL_STAGE",
  SITUATION_CLEARED: "SITUATION_CLEARED",
  UNKNOWN: "UNKNOWN",
};

// Some diagnostic payloads do not provide an ID, so create a traceable fallback.
function createEventId() {
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

// Validate external device timestamps and calculate skew against receive time.
// Preserve invalid original values in externalOccurredAt for field diagnostics.
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

// Preserve the original payload while exposing only compact summary metadata to logs.
function createRawSummary(raw) {
  const text = JSON.stringify(raw ?? {});

  // Field verification can inspect rawPayload in DB, while operation logs retain
  // only key names and approximate payload size.
  return {
    payloadKeys: raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [],
    payloadSize: text.length,
  };
}

// Convert adapter output into the common external event object used downstream.
function createExternalEvent(input) {
  const receivedAt = new Date().toISOString();
  const occurredAtInfo = analyzeOccurredAt(input.occurredAt, receivedAt);

  // Downstream services should not need to know the original LiDAR/control-board shape.
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
