import { getJson, patchJson } from "../../shared/api/http";

export function unwrapApiData(response, fallback = null) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return fallback;
  if ("data" in response) return response.data ?? fallback;
  if ("event" in response) return response.event ?? fallback;
  if ("log" in response) return response.log ?? fallback;
  if (Array.isArray(response.events)) return response.events;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.results)) return response.results;
  return response;
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function toArray(value) {
  const data = unwrapApiData(value, []);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export async function fetchEvents(params = {}) {
  return toArray(await getJson(`/api/events${buildQuery(params)}`));
}

export async function fetchEvent(eventId) {
  return unwrapApiData(await getJson(`/api/events/${encodeURIComponent(eventId)}`), null);
}

export async function fetchRecentEvents(limit = 10) {
  return toArray(await getJson(`/api/events/recent${buildQuery({ limit })}`));
}

export async function fetchEventSummary() {
  return unwrapApiData(await getJson("/api/events/summary"), {});
}

export async function updateEventStatus(eventId, status) {
  return unwrapApiData(
    await patchJson(`/api/events/${encodeURIComponent(eventId)}/status`, { status }),
    null,
  );
}

export async function updateEventMemo(eventId, memo) {
  return unwrapApiData(
    await patchJson(`/api/events/${encodeURIComponent(eventId)}/memo`, { memo }),
    null,
  );
}

export async function fetchEventLogs(eventId) {
  return toArray(await getJson(`/api/events/${encodeURIComponent(eventId)}/logs`));
}

export function eventTimestamp(event = {}) {
  return (
    event.occurredAt ||
    event.receivedAt ||
    event.timestamp ||
    event.createdAt ||
    event.time ||
    ""
  );
}

export function formatEventTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatEventTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatConfidencePercent(value) {
  if (value === undefined || value === null || value === "") return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  const percent = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return `${Number(percent.toFixed(1))}%`;
}

export function normalizeEvent(raw = {}) {
  const id = raw.id || raw.eventId || raw._id || raw.uuid || "";
  const type = raw.type || raw.eventType || raw.category || "event";
  const timestamp = eventTimestamp(raw);
  const message =
    raw.message ||
    raw.title ||
    raw.subMessage ||
    raw.description ||
    `${String(type).replace(/[-_]/g, " ")} event`;

  return {
    id: String(id || `${type}-${timestamp || "unknown"}`),
    type: String(type || "event"),
    category: raw.category || raw.eventType || raw.type || "event",
    status: raw.status || raw.state || "pending",
    message,
    location: raw.location || raw.zone || raw.zoneId || raw.zone_id || raw.area || "-",
    confidence: raw.confidence ?? raw.score ?? raw.probability ?? null,
    timestamp,
    occurredAt: raw.occurredAt,
    receivedAt: raw.receivedAt,
    memo: raw.memo || "",
    rawPayload: raw.rawPayload ?? raw.payload ?? raw.originalPayload ?? raw,
    raw,
  };
}

export function normalizeEvents(events = []) {
  return events.map((event) => normalizeEvent(event));
}

export function isWrongWayEvent(event = {}) {
  const value = `${event.type || ""} ${event.category || ""} ${event.message || ""}`.toLowerCase();
  return value.includes("wrong-way") || value.includes("wrongway") || value.includes("wrong way");
}

export function normalizeSummary(summary = {}) {
  const byEventType = summary.byEventType || summary.byType || {};
  const wrongWayEvents =
    summary.wrongWayEvents ??
    summary.wrongwayEvents ??
    summary.wrongWay ??
    summary.wrongway ??
    byEventType["wrong-way"] ??
    byEventType.wrongway ??
    ((byEventType["wrong-way-level-1"] || 0) + (byEventType["wrong-way-level-2"] || 0));

  return {
    todaysEvents:
      summary.todaysEvents ??
      summary.todayEvents ??
      summary.today ??
      summary.totalToday ??
      summary.totalEvents ??
      0,
    newEvents: summary.newEvents ?? summary.pendingEvents ?? summary.pending ?? 0,
    vehiclesPassed: summary.vehiclesPassed ?? summary.vehicleCount ?? summary.vehicles ?? 0,
    wrongWayEvents,
    unidentified: summary.unidentified ?? summary.unidentifiedEvents ?? 0,
    hourlyEvents: Array.isArray(summary.hourlyEvents) ? summary.hourlyEvents : [],
  };
}
