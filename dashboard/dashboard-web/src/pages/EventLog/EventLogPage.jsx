import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Download,
  Eye,
  Info,
  RefreshCcw,
  Save,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../../shared/components/Card";
import { WS_BASE } from "../../shared/api/config";
import { useRealtimeSocket } from "../../shared/realtime/useRealtimeSocket";
import {
  fetchEvent,
  fetchEventLogs,
  fetchEvents,
  fetchEventSummary,
  formatConfidencePercent,
  formatEventTime,
  formatEventTimestamp,
  normalizeEvent,
  normalizeEvents,
  normalizeSummary,
  updateEventMemo,
  updateEventStatus,
} from "../../features/events/eventsApi";

const INITIAL_HOURLY_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  events: 0,
}));

const EMPTY_SUMMARY = {
  todaysEvents: 0,
  wrongWayEvents: 0,
  vehiclesPassed: 0,
  unidentified: 0,
  newEvents: 0,
  hourlyEvents: INITIAL_HOURLY_DATA,
};

function statusLabel(status) {
  if (status === "pending" || status === "new") return "대기";
  if (status === "resolved" || status === "reviewed") return "조치 완료";
  if (status === "dismissed" || status === "ignored") return "무시";
  return status || "-";
}

function statusBadgeClass(status) {
  if (status === "pending" || status === "new") {
    return "bg-orange-50 text-orange-700 border-orange-200";
  }
  if (status === "resolved" || status === "reviewed") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (status === "dismissed" || status === "ignored") {
    return "bg-gray-50 text-gray-600 border-gray-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function iconByStatus(status) {
  if (status === "resolved" || status === "reviewed") return <CheckCircle className="h-4 w-4" />;
  if (status === "dismissed" || status === "ignored") return <Info className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

function iconWrapClass(status) {
  if (status === "resolved" || status === "reviewed") return "bg-green-100 text-green-600";
  if (status === "dismissed" || status === "ignored") return "bg-gray-100 text-gray-600";
  return "bg-orange-100 text-orange-600";
}

function AnalyticsView({ summary, loading, error }) {
  const hourlyData =
    summary.hourlyEvents && summary.hourlyEvents.length > 0
      ? summary.hourlyEvents
      : INITIAL_HOURLY_DATA;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border-blue-100 bg-blue-50 p-4">
          <div className="mb-1 text-sm font-bold text-blue-800">오늘 이벤트</div>
          <div className="text-3xl font-bold text-gray-900">{summary.todaysEvents}</div>
          <div className="mt-1 text-xs text-blue-600">{loading ? "집계 중" : "이벤트 API 기준"}</div>
        </Card>

        <Card className="border-red-100 bg-red-50 p-4">
          <div className="mb-1 text-sm font-bold text-red-800">역주행 이벤트</div>
          <div className="text-3xl font-bold text-red-600">{summary.wrongWayEvents}</div>
          <div className="mt-1 text-xs text-red-500">관제 확인 대상</div>
        </Card>

        <Card className="border-green-100 bg-green-50 p-4">
          <div className="mb-1 text-sm font-bold text-green-800">대기 이벤트</div>
          <div className="text-3xl font-bold text-gray-900">{summary.newEvents}</div>
          <div className="mt-1 text-xs text-green-600">상태 변경 필요</div>
        </Card>
      </div>

      <Card title="시간대별 이벤트 분포" className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="events" stroke="#2563eb" fill="#bfdbfe" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function ContractEmptyView({ title }) {
  return (
    <Card className="p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center text-center text-gray-500">
        <Info className="mb-3 h-8 w-8 text-gray-300" />
        <h2 className="mb-2 text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm leading-6">
          현재 이벤트 API 계약에는 CCTV, 번호판, 차주, 차량 등록 정보가 포함되어 있지 않습니다.
          실제 데이터처럼 보이는 샘플 대신 연동 범위 밖 상태로 표시합니다.
        </p>
      </div>
    </Card>
  );
}

function RawPayloadBlock({ value }) {
  return (
    <details className="rounded border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase text-gray-500">
        원본 payload JSON
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-gray-200 p-3 text-xs text-gray-700">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}

function commandStatusClass(status) {
  if (status === "ACKNOWLEDGED" || status === "DRY_RUN") return "bg-green-50 text-green-700 border-green-200";
  if (status === "FAILED") return "bg-red-50 text-red-700 border-red-200";
  if (status === "SENT" || status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function ControlCommandTimeline({ commands = [] }) {
  if (!commands.length) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        이 이벤트에 연결된 통합제어보드 명령이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {commands.map((command) => (
        <div key={command.id || command.commandCode} className="rounded border border-gray-200 bg-white p-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-black text-gray-800">{command.commandType || "CONTROL_COMMAND"}</div>
              <div className="mt-1 text-gray-400">{formatEventTimestamp(command.requestedAt)}</div>
            </div>
            <span className={`shrink-0 rounded border px-2 py-0.5 font-black ${commandStatusClass(command.status)}`}>
              {command.status || "-"}
            </span>
          </div>

          <div className="mt-3 space-y-1 font-mono text-[11px] text-gray-600">
            <div className="break-all">
              <span className="font-bold text-gray-400">TX</span> {command.packetHex || "-"}
            </div>
            <div className="break-all">
              <span className="font-bold text-gray-400">RX</span> {command.responseHex || "-"}
            </div>
            <div>
              <span className="font-bold text-gray-400">CRC</span> {command.crcStatus || "-"}
            </div>
            {command.errorMessage && (
              <div className="break-words text-red-600">
                <span className="font-bold">ERR</span> {command.errorMessage}
              </div>
            )}
          </div>

          {Array.isArray(command.logs) && command.logs.length > 0 && (
            <details className="mt-3 rounded border border-gray-100 bg-gray-50">
              <summary className="cursor-pointer px-2 py-1 font-bold uppercase text-gray-400">
                명령 로그
              </summary>
              <div className="space-y-1 border-t border-gray-100 p-2">
                {command.logs.map((log) => (
                  <div key={log.id} className="text-gray-600">
                    <span className="font-bold text-gray-700">{log.action}</span>
                    {log.message ? ` / ${log.message}` : ""}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function upsertEvent(events, nextEvent) {
  if (!nextEvent?.id) return events;
  const index = events.findIndex((event) => event.id === nextEvent.id);
  if (index === -1) return [nextEvent, ...events].slice(0, 100);
  return events.map((event, i) => (i === index ? { ...event, ...nextEvent } : event));
}

export default function EventLogPage() {
  const [searchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") || "all").toLowerCase();
  const eventIdParam = searchParams.get("eventId") || "";
  const safeTab = ["all", "analytics", "vehicles", "unidentified"].includes(tabParam)
    ? tabParam
    : "all";

  const [activeTab, setActiveTab] = useState(safeTab);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventLogs, setEventLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [actionError, setActionError] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const data = normalizeSummary(await fetchEventSummary());
      setSummary((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setSummaryError(err.message || "이벤트 요약을 불러오지 못했습니다.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const data = normalizeEvents(await fetchEvents({ limit: 50 }));
      setEvents(data);
      setSelectedEvent((prev) => {
        const urlSelected = eventIdParam ? data.find((event) => event.id === eventIdParam) : null;
        if (urlSelected) return urlSelected;
        if (prev && data.some((event) => event.id === prev.id)) return prev;
        return data[0] || null;
      });
    } catch (err) {
      setListError(err.message || "이벤트 목록을 불러오지 못했습니다.");
      setEvents([]);
      setSelectedEvent(null);
    } finally {
      setListLoading(false);
    }
  }, [eventIdParam]);

  const loadSelectedDetail = useCallback(async (eventId) => {
    if (!eventId) {
      setEventLogs([]);
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    try {
      const [detail, logs] = await Promise.all([
        fetchEvent(eventId).catch(() => null),
        fetchEventLogs(eventId).catch(() => []),
      ]);
      if (detail) {
        const normalized = normalizeEvent(detail);
        setSelectedEvent(normalized);
        setMemoDraft(normalized.memo || "");
      }
      setEventLogs(logs.map((log) => normalizeEvent(log)));
    } catch (err) {
      setDetailError(err.message || "이벤트 상세를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveTab(safeTab);
  }, [safeTab]);

  useEffect(() => {
    loadEvents();
    loadSummary();
  }, [loadEvents, loadSummary]);

  useEffect(() => {
    if (!eventIdParam) return;
    if (selectedEvent?.id === eventIdParam) return;

    const listedEvent = events.find((event) => event.id === eventIdParam);
    if (listedEvent) {
      setSelectedEvent(listedEvent);
      return;
    }

    let ignore = false;
    setDetailLoading(true);
    setDetailError("");
    fetchEvent(eventIdParam)
      .then((detail) => {
        if (ignore || !detail) return;
        const normalized = normalizeEvent(detail);
        setSelectedEvent(normalized);
        setEvents((prev) => upsertEvent(prev, normalized));
      })
      .catch((err) => {
        if (!ignore) {
          setDetailError(err.message || "이벤트 상세를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) setDetailLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [eventIdParam, events, selectedEvent?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadEvents();
      loadSummary();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadEvents, loadSummary]);

  useEffect(() => {
    loadSelectedDetail(selectedEvent?.id);
  }, [loadSelectedDetail, selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent) {
      setMemoDraft("");
    } else {
      setMemoDraft(selectedEvent.memo || "");
    }
  }, [selectedEvent]);

  const { status: realtimeStatus } = useRealtimeSocket({
    url: WS_BASE,
    onMessage: (msg) => {
      if (msg.type === "state" && msg.payload) {
        setSummary((prev) => ({ ...prev, ...normalizeSummary(msg.payload) }));
      }
      if (msg.type === "traffic-event.created" && msg.payload) {
        const normalized = normalizeEvent(msg.payload);
        setEvents((prev) => upsertEvent(prev, normalized));
        setSelectedEvent((prev) => prev || normalized);
        loadSummary();
      }
      if (msg.type === "traffic-event.updated" && msg.payload?.id) {
        const normalized = normalizeEvent(msg.payload);
        setEvents((prev) => upsertEvent(prev, normalized));
        setSelectedEvent((prev) => (prev?.id === normalized.id ? { ...prev, ...normalized } : prev));
        loadSummary();
      }
    },
  });

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => {
      return (
        event.id.toLowerCase().includes(q) ||
        event.type.toLowerCase().includes(q) ||
        event.category.toLowerCase().includes(q) ||
        event.message.toLowerCase().includes(q) ||
        event.location.toLowerCase().includes(q) ||
        event.status.toLowerCase().includes(q)
      );
    });
  }, [events, query]);

  const handleSelect = (event) => {
    setActionError("");
    setSelectedEvent(event);
  };

  const handleStatus = async (status) => {
    if (!selectedEvent) return;
    setActionError("");
    try {
      const updated = normalizeEvent((await updateEventStatus(selectedEvent.id, status)) || {
        ...selectedEvent.raw,
        status,
      });
      setSelectedEvent(updated);
      setEvents((prev) => prev.map((event) => (event.id === updated.id ? updated : event)));
    } catch (err) {
      setActionError(err.message || "이벤트 상태를 변경하지 못했습니다.");
    }
  };

  const handleMemoSave = async () => {
    if (!selectedEvent) return;
    setActionError("");
    try {
      const updated = normalizeEvent((await updateEventMemo(selectedEvent.id, memoDraft)) || {
        ...selectedEvent.raw,
        memo: memoDraft,
      });
      setSelectedEvent(updated);
      setEvents((prev) => prev.map((event) => (event.id === updated.id ? updated : event)));
    } catch (err) {
      setActionError(err.message || "운영 메모를 저장하지 못했습니다.");
    }
  };

  return (
    <div className="min-h-screen space-y-6 bg-white p-6 font-sans">
      <div className="mb-2 flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">이벤트 로그</h1>
            <div className="text-sm text-gray-500">라이다 수신 이벤트, 관제 상태, 제어 명령 이력</div>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center rounded bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">
              {realtimeStatus === "CONNECTED" ? (
                <Wifi className="mr-2 h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="mr-2 h-4 w-4 text-amber-600" />
              )}
              {realtimeStatus}
            </div>
            <button
              className="flex items-center rounded bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200"
              type="button"
              onClick={() => {
                loadEvents();
                loadSummary();
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> 새로고침
            </button>
            <button
              className="flex items-center rounded bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
              type="button"
            >
              <Download className="mr-2 h-4 w-4" /> CSV 내보내기
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex px-4 py-2 text-sm font-bold border-b-2 ${
              activeTab === "all"
                ? "border-gray-800 text-gray-800"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            type="button"
          >
            전체 이벤트
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center px-4 py-2 text-sm font-bold border-b-2 ${
              activeTab === "analytics"
                ? "border-gray-800 text-gray-800"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            type="button"
          >
            <Activity className="mr-2 h-4 w-4" />
            분석
          </button>

          <button
            onClick={() => setActiveTab("vehicles")}
            className={`flex items-center px-4 py-2 text-sm font-bold border-b-2 ${
              activeTab === "vehicles"
                ? "border-gray-800 text-gray-800"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            type="button"
          >
            <Calendar className="mr-2 h-4 w-4" />
            차량 이력
          </button>

          <button
            onClick={() => setActiveTab("unidentified")}
            className={`flex items-center px-4 py-2 text-sm font-bold border-b-2 ${
              activeTab === "unidentified"
                ? "border-gray-800 text-gray-800"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            type="button"
          >
            <Eye className="mr-2 h-4 w-4" />
            미식별
          </button>
        </div>
      </div>

      <div className="min-h-[500px]">
        {activeTab === "analytics" && (
          <AnalyticsView summary={summary} loading={summaryLoading} error={summaryError} />
        )}

        {activeTab === "vehicles" && <ContractEmptyView title="차량 이력은 현재 API 계약 범위 밖입니다" />}
        {activeTab === "unidentified" && <ContractEmptyView title="미식별 차량 데이터는 현재 API 계약 범위 밖입니다" />}

        {activeTab === "all" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <div className="flex items-center rounded border border-gray-200 bg-gray-50 p-2">
                <Search className="ml-2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  type="text"
                  placeholder="ID, 유형, 상태, 구역 검색"
                  className="w-full border-none bg-transparent text-sm focus:outline-none"
                />
              </div>

              {listError && (
                <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {listError}
                </div>
              )}

              <div className="space-y-2">
                {listLoading && (
                  <div className="rounded border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    이벤트를 불러오는 중입니다.
                  </div>
                )}

                {!listLoading && !listError && filteredEvents.length === 0 && (
                  <div className="rounded border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    조건에 맞는 이벤트가 없습니다.
                  </div>
                )}

                {!listLoading &&
                  filteredEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => handleSelect(event)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg border p-4 text-left transition-all ${
                        selectedEvent?.id === event.id
                          ? "border-gray-300 bg-gray-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      }`}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center space-x-4">
                        <div className={`rounded-full p-2 ${iconWrapClass(event.status)}`}>
                          {iconByStatus(event.status)}
                        </div>

                        <div className="min-w-0">
                          <div className="mb-0.5 flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-gray-400">{event.id}</span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                                event.status,
                              )}`}
                            >
                              {statusLabel(event.status)}
                            </span>
                          </div>
                          <div className="truncate text-sm font-bold text-gray-800">{event.message}</div>
                          <div className="mt-1 text-xs text-gray-500">{event.location}</div>
                        </div>
                      </div>

                      <div className="ml-4 shrink-0 text-right">
                        <div className="mb-1 font-mono text-xs text-gray-500">
                          {formatEventTime(event.timestamp)}
                        </div>
                        <div className="text-xs text-gray-400">{event.category}</div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="lg:col-span-4">
              <Card title="이벤트 상세" className="sticky top-6 h-full">
                {selectedEvent ? (
                  <div className="space-y-5">
                    <div className="border-b border-gray-100 pb-4">
                      <div className="text-2xl font-mono font-bold text-gray-900">{selectedEvent.id}</div>
                      <div className="mt-1 text-xs font-bold text-gray-500">{selectedEvent.category}</div>
                    </div>

                    {detailLoading && <div className="text-xs text-gray-500">상세를 불러오는 중입니다.</div>}
                    {detailError && <div className="text-xs text-red-600">{detailError}</div>}
                    {actionError && <div className="text-xs text-red-600">{actionError}</div>}

                    <div>
                      <div className="mb-1 text-xs font-bold text-gray-400">메시지</div>
                      <p className="text-sm text-gray-800">{selectedEvent.message}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="mb-1 text-xs font-bold text-gray-400">상태</div>
                        <div className="text-gray-700">{statusLabel(selectedEvent.status)}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-bold text-gray-400">신뢰도</div>
                        <div className="text-gray-700">{formatConfidencePercent(selectedEvent.confidence)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="mb-1 text-xs font-bold text-gray-400">시각</div>
                        <div className="text-gray-700">{formatEventTimestamp(selectedEvent.timestamp)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="mb-1 text-xs font-bold text-gray-400">구역</div>
                        <div className="text-gray-700">{selectedEvent.location}</div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold text-gray-400">운영 메모</div>
                      <textarea
                        value={memoDraft}
                        onChange={(event) => setMemoDraft(event.target.value)}
                        className="min-h-24 w-full rounded border border-gray-200 p-2 text-sm focus:border-blue-400 focus:outline-none"
                        placeholder="운영 메모 입력"
                      />
                      <button
                        onClick={handleMemoSave}
                        className="mt-2 flex w-full items-center justify-center rounded bg-gray-900 py-2 text-sm font-bold text-white hover:bg-gray-800"
                        type="button"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        메모 저장
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-4">
                      <button
                        className="rounded bg-green-600 py-2 text-sm font-bold text-white hover:bg-green-700"
                        onClick={() => handleStatus("resolved")}
                        type="button"
                      >
                        조치 완료
                      </button>
                      <button
                        className="rounded border border-gray-300 bg-white py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                        onClick={() => handleStatus("dismissed")}
                        type="button"
                      >
                        무시
                      </button>
                    </div>

                    <RawPayloadBlock value={selectedEvent.rawPayload} />

                    <div>
                      <div className="mb-2 text-xs font-bold uppercase text-gray-400">통합제어보드 명령</div>
                      <ControlCommandTimeline commands={selectedEvent.raw?.controlCommands || []} />
                    </div>

                    {eventLogs.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-bold uppercase text-gray-400">감사 로그</div>
                        <div className="space-y-2">
                          {eventLogs.slice(0, 5).map((log) => (
                            <div key={log.id} className="rounded border border-gray-100 bg-gray-50 p-2 text-xs">
                              <div className="font-bold text-gray-700">{log.message}</div>
                              <div className="mt-1 text-gray-400">{formatEventTimestamp(log.timestamp)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center text-gray-400">
                    <Info className="mb-2 h-8 w-8 opacity-20" />
                    <p className="text-xs">이벤트를 선택하면 상세 정보가 표시됩니다.</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
