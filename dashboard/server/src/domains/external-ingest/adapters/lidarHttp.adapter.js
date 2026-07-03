const {
  EXTERNAL_EVENT_SOURCE,
  EXTERNAL_EVENT_TYPE,
  createExternalEvent,
  createRawSummary,
} = require("../externalEvent.model");

// Convert LiDAR HTTP/JSON payloads into the common external event model.
// If the field payload changes, keep service/controller flow stable and update this adapter.
function adaptLidarHttpPayload(payload = {}) {
  return createExternalEvent({
    id: payload.id || payload.event_id || payload.eventCode,
    source: EXTERNAL_EVENT_SOURCE.LIDAR_PC,
    eventType: EXTERNAL_EVENT_TYPE.WRONG_WAY,
    stage: payload.stage,
    siteId: payload.site_id || payload.siteId,
    zoneId: payload.zone_id || payload.zoneId,
    deviceId: payload.device_id || payload.deviceId || payload.serial_no,
    trackId:
      payload.track_id ||
      payload.trackId ||
      payload.object_id ||
      payload.objectId ||
      payload.uuid ||
      payload.object_uuid ||
      payload.objectUuid ||
      payload.stable_object_id ||
      payload.stableObjectId,
    message: payload.message || "LiDAR wrong-way event received",
    occurredAt: payload.timestamp || payload.occurred_at || payload.occurredAt,
    confidence: payload.confidence,
    rawPayload: payload,
    rawSummary: createRawSummary(payload),
  });
}

module.exports = {
  adaptLidarHttpPayload,
};
