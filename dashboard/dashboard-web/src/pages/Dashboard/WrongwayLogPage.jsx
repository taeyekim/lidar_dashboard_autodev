import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Car,
  CheckCircle,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  RefreshCcw,
  Search,
  Shield,
} from "lucide-react";
import { Card } from "../../shared/components/Card";
import {
  fetchEvents,
  fetchRecentEvents,
  formatConfidencePercent,
  formatEventTimestamp,
  isWrongWayEvent,
  normalizeEvents,
  updateEventStatus,
} from "../../features/events/eventsApi";

function statusText(status) {
  if (status === "pending" || status === "new") return "New";
  if (status === "resolved" || status === "reviewed") return "Reviewed";
  if (status === "dismissed" || status === "ignored") return "Dismissed";
  return status || "-";
}

function RawPayloadBlock({ value }) {
  return (
    <details className="rounded border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase text-gray-500">
        rawPayload JSON
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-gray-200 p-3 text-xs text-gray-700">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}

export default function WrongwayLogPage() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let nextEvents = normalizeEvents(await fetchEvents({ type: "wrong-way", limit: 50 }));

      if (nextEvents.length === 0) {
        const recent = normalizeEvents(await fetchRecentEvents(50));
        nextEvents = recent.filter((event) => isWrongWayEvent(event));
      }

      setEvents(nextEvents);
      setSelectedId((prev) => {
        if (prev && nextEvents.some((event) => event.id === prev)) return prev;
        return nextEvents[0]?.id || null;
      });
    } catch (err) {
      setError(err.message || "Failed to load wrong-way events.");
      setEvents([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const timer = setInterval(loadEvents, 5000);
    return () => clearInterval(timer);
  }, [loadEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => {
      return (
        event.id.toLowerCase().includes(q) ||
        event.type.toLowerCase().includes(q) ||
        event.location.toLowerCase().includes(q) ||
        event.message.toLowerCase().includes(q) ||
        event.status.toLowerCase().includes(q)
      );
    });
  }, [events, query]);

  const selectedEvent = useMemo(() => {
    return filtered.find((event) => event.id === selectedId) || filtered[0] || null;
  }, [filtered, selectedId]);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 200);
    return () => clearTimeout(timer);
  }, [selectedEvent?.id]);

  const newCount = events.filter((event) => event.status === "pending" || event.status === "new").length;

  const handleStatus = async (status) => {
    if (!selectedEvent) return;
    setActionError("");
    try {
      await updateEventStatus(selectedEvent.id, status);
      setEvents((prev) =>
        prev.map((event) => (event.id === selectedEvent.id ? { ...event, status } : event)),
      );
    } catch (err) {
      setActionError(err.message || "Failed to update event status.");
    }
  };

  return (
    <div className="min-h-screen space-y-6 bg-white p-6 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <button
          className="flex items-center space-x-2 rounded p-1 transition-colors hover:bg-gray-100"
          onClick={() => navigate("/")}
          type="button"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
          <span className="font-mono text-sm text-gray-500">Back to dashboard</span>
        </button>

        <button
          className="flex items-center rounded bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200"
          onClick={loadEvents}
          type="button"
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-red-100">
            <AlertOctagon className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Wrong-way event log</h1>
            <div className="flex items-center text-sm text-gray-500">
              <span className="mr-2 h-2 w-2 rounded-full bg-red-500" />
              API events, pending {newCount}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex items-center space-x-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search id, location, status..."
              className="w-full bg-transparent text-sm outline-none sm:w-64"
            />
          </div>

          <button
            className="flex items-center rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
            type="button"
          >
            <Shield className="mr-2 h-4 w-4" /> Export report
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:h-[calc(100vh-250px)]">
        <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 lg:col-span-4">
          <div className="border-b border-gray-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Detected events</h3>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {loading && (
              <div className="p-6 text-center text-sm text-gray-500">Loading wrong-way events...</div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                No wrong-way events found.
              </div>
            )}

            {!loading &&
              filtered.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  className={`w-full cursor-pointer rounded-lg border p-4 text-left transition-all ${
                    selectedEvent?.id === event.id
                      ? "border-red-400 bg-white shadow-md ring-1 ring-red-100"
                      : "border-gray-200 bg-white hover:border-red-200 hover:shadow-sm"
                  }`}
                  type="button"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex min-w-0 items-center">
                      <AlertTriangle
                        className={`mr-2 h-4 w-4 ${
                          event.status === "pending" || event.status === "new"
                            ? "text-red-500"
                            : "text-gray-400"
                        }`}
                      />
                      <span className="truncate font-mono font-bold text-gray-800">{event.id}</span>
                    </div>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-gray-400">
                      {formatEventTimestamp(event.timestamp)}
                    </span>
                  </div>

                  <div className="mb-2 flex items-center text-xs text-gray-600">
                    <MapPin className="mr-1 h-3 w-3 text-gray-400" />
                    <span className="truncate">{event.location}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        event.status === "pending" || event.status === "new"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {statusText(event.status)}
                    </span>
                    {selectedEvent?.id === event.id && <ChevronRight className="h-4 w-4 text-red-400" />}
                  </div>
                </button>
              ))}
          </div>
        </div>

        <Card className="relative flex flex-col overflow-hidden lg:col-span-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-red-500 to-red-600" />

          <div className={`flex-1 transition-opacity duration-200 ${isAnimating ? "opacity-60" : "opacity-100"}`}>
            {selectedEvent ? (
              <div className="space-y-8">
                <div className="flex items-start justify-between border-b border-gray-100 pb-6">
                  <div>
                    <div className="mb-2 flex items-center space-x-3">
                      <h2 className="font-mono text-3xl font-bold text-gray-900">{selectedEvent.id}</h2>
                      <span className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white">
                        Wrong-way
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="mr-2 h-4 w-4" />
                      {formatEventTimestamp(selectedEvent.timestamp)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                      Confidence
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatConfidencePercent(selectedEvent.confidence)}
                    </div>
                  </div>
                </div>

                {actionError && (
                  <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div className="space-y-6">
                    <h3 className="flex items-center text-sm font-bold text-gray-900">
                      <CheckCircle className="mr-2 h-4 w-4 text-blue-500" />
                      Event information
                    </h3>

                    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
                      <div>
                        <div className="mb-1 text-xs text-gray-500">Message</div>
                        <div className="font-medium text-gray-800">{selectedEvent.message}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-500">Location</div>
                        <div className="font-medium text-gray-800">{selectedEvent.location}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-500">Status</div>
                        <div className="font-bold text-gray-800">{statusText(selectedEvent.status)}</div>
                      </div>
                      <div className="border-t border-dashed border-gray-200 pt-3 text-xs leading-5 text-gray-500">
                        License plate, vehicle owner, CCTV, and registry data are not part of the current
                        event API contract.
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded bg-green-600 py-2 text-sm font-bold text-white hover:bg-green-700"
                        onClick={() => handleStatus("resolved")}
                        type="button"
                      >
                        Mark reviewed
                      </button>
                      <button
                        className="rounded border border-gray-300 bg-white py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                        onClick={() => handleStatus("dismissed")}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="flex items-center text-sm font-bold text-gray-900">
                      <Info className="mr-2 h-4 w-4 text-gray-500" />
                      Evidence payload
                    </h3>

                    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-gray-900">
                      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-gray-900 to-black opacity-70">
                        <Car className="h-16 w-16 text-gray-600" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-3">
                        <div className="font-mono text-xs text-white">Sensor event</div>
                        <div className="font-mono text-xs text-white">
                          {formatEventTimestamp(selectedEvent.timestamp)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-blue-100 bg-blue-50 p-4">
                      <div className="mb-2 text-xs font-bold uppercase text-blue-800">Analysis</div>
                      <p className="text-xs leading-relaxed text-blue-700">
                        This view is based on the backend event API. Use rawPayload to inspect the original
                        lidar payload or adapter output.
                      </p>
                    </div>
                  </div>
                </div>

                <RawPayloadBlock value={selectedEvent.rawPayload} />
              </div>
            ) : (
              <div className="flex h-full min-h-80 flex-col items-center justify-center text-gray-400">
                <Info className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm">Select an event to view detail.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
