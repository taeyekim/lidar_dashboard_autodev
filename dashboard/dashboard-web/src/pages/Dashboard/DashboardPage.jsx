// /src/pages/Dashboard/Dashboard.jsx
import { useCallback, useState, useEffect, useRef } from "react";
import { Card } from "../../shared/components/Card";
import { TrafficStatisticsPanel } from "../../components/dashboard/TrafficStatisticsPanel";
import { apiUrl, detectorUrl, WS_BASE } from "../../shared/api/config";
import { postJson } from "../../shared/api/http";
import { useRealtimeSocket } from "../../shared/realtime/useRealtimeSocket";
import {
  controlBoardModeLabel,
  fetchControlBoardStatus,
  latestCommandSummary,
  sendControlBoardTestCommand,
} from "../../features/controlBoard/controlBoardApi";
import {
  fetchEventSummary,
  fetchRecentEvents,
  formatEventTime,
  formatEventTimestamp,
  isWrongWayEvent,
  normalizeEvent,
  normalizeEvents,
  normalizeSummary,
} from "../../features/events/eventsApi";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Calendar,
  Activity,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Megaphone,
  Siren,
  AlertTriangle,
  X,
} from "lucide-react";

const MAX_RECENT_LOGS = 5;

const COMMAND_CONFIRMATIONS = {
  STAGE_1_ON: {
    label: "1차 경고",
    title: "1차 경고 명령 전송",
    description: "전광판과 스피커를 통해 역주행 차량에 1차 경고를 보냅니다.",
    buttonClass: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-300",
  },
  STAGE_2_ON: {
    label: "2차 차단",
    title: "2차 차단 명령 전송",
    description: "차단기를 내려 진입을 막는 명령입니다. 현장 상황을 확인한 뒤 실행합니다.",
    buttonClass: "bg-red-600 hover:bg-red-700 focus:ring-red-300",
  },
  STAGE_2_RETURN: {
    label: "차단기 복귀",
    title: "차단기 복귀 명령 전송",
    description: "차단기를 복귀시켜 통행 가능 상태로 전환합니다.",
    buttonClass: "bg-gray-800 hover:bg-gray-700 focus:ring-gray-300",
  },
};

const CLOSED_EVENT_STATUSES = new Set(["resolved", "dismissed", "ignored", "closed", "cleared", "ended"]);

function isClosedEventStatus(status) {
  return CLOSED_EVENT_STATUSES.has(String(status || "").trim().toLowerCase());
}

function toDashboardWrongwayEvent(rawEvent) {
  const event = normalizeEvent(rawEvent);
  return {
    id: event.id,
    type: "wrong-way",
    stage: rawEvent?.warningLevel || event.stage || 1,
    message: event.message,
    subMessage: `Zone: ${event.location}`,
    timestamp: formatEventTimestamp(event.timestamp),
    zone_id: rawEvent?.externalZoneId || event.location,
    track_id: rawEvent?.trackId,
    confidence: event.confidence,
    status: event.status,
  };
}

// ------------------------------
// DashboardPage Component
// ------------------------------
// 메인 대시보드 화면을 담당한다.
// 서버 상태, KPI, WebSocket 알림, 차단기/VMS 제어 UI를 한 화면에서 보여준다.
// 현재는 화면 로직이 큰 파일에 모여 있으므로 이후 dashboard/wrongway feature로 점진 분리한다.
export default function DashboardPage({
  onNavigateToTotalVehicles,
  onNavigateToUnidentified,
}) {
  const [activeDashboardEvent, setActiveDashboardEvent] = useState(null); // 모달로 표시할 대시보드 이벤트
  const [latestWrongwayEvent, setLatestWrongwayEvent] = useState(null);
  const [lastLidarEvent, setLastLidarEvent] = useState(null);
  const [eventModalEnabled, setEventModalEnabled] = useState(true); // 이벤트 모달 허용 토글(ON/OFF)
  const [vmsText, setVmsText] = useState(""); // 전광판 입력
  const [recentLogs, setRecentLogs] = useState([]); // recent event list
  
  const [serverAlive, setServerAlive] = useState(false); // 서버 alive 표시 => /api/health
  const [kpi, setKpi] = useState({ 
    todaysEvents: 0, 
    vehiclesPassed: 0, 
    wrongwayVehicles: 0,
    wrongWayEvents: 0, 
    unidentified: 0 
  }); 
  const [controlBoardStatus, setControlBoardStatus] = useState(null);
  const [controlBoardError, setControlBoardError] = useState("");
  const [controlBoardBusy, setControlBoardBusy] = useState("");
  const [pendingCommand, setPendingCommand] = useState(null);

  // kpi 페이지 이동 함수
  const navigate = useNavigate();
  const goEvents = (tab) => navigate(`/events?tab=${tab}`);

  // websocket onmessage의 항상 최신값 유지
  const eventModalEnabledRef = useRef(eventModalEnabled); 
  useEffect(() => {
    eventModalEnabledRef.current = eventModalEnabled;
  }, [eventModalEnabled]);

  useEffect(() => {
    let ignore = false;

    const loadEventApiFallback = async () => {
      const [summaryResult, recentResult] = await Promise.allSettled([
        fetchEventSummary(),
        fetchRecentEvents(MAX_RECENT_LOGS),
      ]);

      if (ignore) return;

      if (summaryResult.status === "fulfilled") {
        setKpi((prev) => ({
          ...prev,
          ...normalizeSummary(summaryResult.value),
        }));
      }

      if (recentResult.status === "fulfilled") {
        const nextLogs = normalizeEvents(recentResult.value)
          .map((event) => ({
            msg: event.message,
            time: formatEventTime(event.timestamp),
          }))
          .slice(0, MAX_RECENT_LOGS);
        setRecentLogs(nextLogs);
      }
    };

    loadEventApiFallback();
    const timer = setInterval(loadEventApiFallback, 10000);

    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, []);

  // 팝업 버튼 핸들러
  const refreshControlBoardStatus = async () => {
    try {
      const status = await fetchControlBoardStatus();
      setControlBoardStatus(status);
      setControlBoardError("");
      return status;
    } catch (error) {
      setControlBoardError(error.message || "통합제어보드 상태를 불러오지 못했습니다.");
      setControlBoardStatus((prev) => prev || { ok: false, mode: "OFFLINE" });
      return null;
    }
  };

  useEffect(() => {
    let ignore = false;

    const loadStatus = async () => {
      const status = await refreshControlBoardStatus();
      if (ignore || !status) return;
      setControlBoardStatus(status);
    };

    loadStatus();
    const timer = setInterval(loadStatus, 5000);

    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, []);

  const sendControlBoardCommand = async (commandType, label) => {
    setControlBoardBusy(commandType);
    try {
      const command = await sendControlBoardTestCommand(commandType);
      pushLog(`${label} 명령 ${command.status || "전송"}`);
      await refreshControlBoardStatus();
    } catch (error) {
      const message = error.message || `${label} 명령 실패`;
      setControlBoardError(message);
      pushLog(message);
    } finally {
      setControlBoardBusy("");
    }
  };

  const requestControlBoardCommand = (commandType) => {
    setPendingCommand({
      commandType,
      ...(COMMAND_CONFIRMATIONS[commandType] || {
        label: commandType,
        title: `${commandType} 명령 전송`,
        description: "통합제어보드로 명령을 전송합니다.",
        buttonClass: "bg-gray-800 hover:bg-gray-700 focus:ring-gray-300",
      }),
    });
  };

  const confirmPendingCommand = async () => {
    if (!pendingCommand) return;
    const command = pendingCommand;
    setPendingCommand(null);
    await sendControlBoardCommand(command.commandType, command.label);
  };

  const handleDismissDashboardEvent = () => {
    setActiveDashboardEvent(null);
  }; 


  const handleViewDashboardEvent = () => {
    if (activeDashboardEvent?.id) {
      navigate(`/events?tab=all&eventId=${encodeURIComponent(activeDashboardEvent.id)}`);
    } else if (activeDashboardEvent?.type === "wrong-way" && onNavigateToTotalVehicles) {
      onNavigateToTotalVehicles();
    } else if (activeDashboardEvent?.type === "unidentified" && onNavigateToUnidentified) {
      onNavigateToUnidentified();
    } else {
      navigate("/events?tab=all");
    }
    setActiveDashboardEvent(null);
  };

  const pushLog = (msg) => {
    const t = new Date().toLocaleTimeString([], {
      hour: "2-digit", 
      minute: "2-digit"
    });
    setRecentLogs((prev)=> [
      {msg, time:t}, 
      ...prev].slice(0, MAX_RECENT_LOGS));
  };

  // demo start-end 지점
  const videoRef = useRef(null);
  const camVideoRef = useRef(null); 
  const DEMO_START_SEC = 0; // 시작 시점
  const CAMERA_VIDEO_SRC = "/wrongway_test.mp4";

  // YOLO 감지 서버 상태
  const [detectorAlive, setDetectorAlive] = useState(false);

  useEffect(() => {
    let timer;
    const pingDetector = async () => {
      try {
        const res = await fetch(detectorUrl("/health"), { cache: "no-store" });
        setDetectorAlive(res.ok);
      } catch {
        setDetectorAlive(false);
      }
    };
    pingDetector();
    timer = setInterval(pingDetector, 3000);
    return () => clearInterval(timer);
  }, []);
  //

  // ------------------------------
  // /api/demo/start
  // ------------------------------
  const startDemo = async () => {
    try {
      pushLog("Demo START 요청");

      // demo 영상 (라이다 & 카메라 동기화)
      const v = videoRef.current;
      const v2 = camVideoRef.current;

      if(v) {
        v.pause();
        v.currentTime = DEMO_START_SEC;
        v.play().catch(()=>{});
      }
      if(v2) {
        v2.pause();
        v2.currentTime = DEMO_START_SEC;
        v2.play().catch(()=>{});
      }

      const data = await postJson("/api/demo/start");
      if (!data.ok) throw new Error(data.error || "start failed");
      pushLog("Demo START 성공");
    } catch (e) {
      pushLog(`Demo START 실패: ${String(e.message || e)}`);
    }
  };

  const resetDemo = async () => {
  try {
    pushLog("Demo RESET 요청");

    const data = await postJson("/api/demo/reset");
    if (!data.ok) throw new Error(data.error || "reset failed");

    setActiveDashboardEvent(null); // 떠 있던 팝업 닫기
    pushLog("Demo RESET 성공");
  } catch (e) {
    pushLog(`Demo RESET 실패: ${String(e.message || e)}`);
  }
};
  
  // ------------------------------
  // 전광판 차단기 ui용 함수
  // ------------------------------
  const sendVms = () => {
    const text = vmsText.trim();
    if(!text) return;
    pushLog(`전광판 송신: ${text}`);
    setVmsText("");
  };

  const quickVms = (text) => {
    setVmsText(text);
    pushLog(`전광판 문구 선택: ${text}`);
  };

  const openGate = () => requestControlBoardCommand("STAGE_2_RETURN");
  const closeGate = () => requestControlBoardCommand("STAGE_2_ON");

  // ------------------------------
  // websocket 수신 로직
  // ------------------------------
  const handleRealtimeMessage = useCallback((msg) => {
    if (msg.type === "log" && msg.payload?.msg) {
      setRecentLogs((prev) => [{ msg: msg.payload.msg, time: msg.payload.time || "" }, ...prev].slice(0, MAX_RECENT_LOGS));
    }
    if (msg.type === "logs" && Array.isArray(msg.payload)) {
      setRecentLogs(msg.payload.slice(0, MAX_RECENT_LOGS));
    }

    if (msg.type === "state" && msg.payload) {
      setKpi((prev) => ({
        ...prev,
        ...normalizeSummary(msg.payload),
      }));
    }

    if (msg.type === "traffic-event.created" && msg.payload) {
      const event = normalizeEvent(msg.payload);
      setLastLidarEvent(event);
      setRecentLogs((prev) => [
        { msg: event.message, time: formatEventTime(event.timestamp) },
        ...prev,
      ].slice(0, MAX_RECENT_LOGS));
      setKpi((prev) => ({
        ...prev,
        todaysEvents: prev.todaysEvents + 1,
        newEvents: prev.newEvents + 1,
        wrongWayEvents: prev.wrongWayEvents + (isWrongWayEvent(event) ? 1 : 0),
        wrongwayVehicles:
          prev.wrongwayVehicles +
          (isWrongWayEvent(event) && event.type !== "wrong-way-level-2" ? 1 : 0),
      }));

      if (eventModalEnabledRef.current && isWrongWayEvent(event)) {
        const nextDashboardEvent = toDashboardWrongwayEvent(msg.payload);
        setLatestWrongwayEvent(nextDashboardEvent);
        setActiveDashboardEvent(nextDashboardEvent);
      } else if (isWrongWayEvent(event)) {
        setLatestWrongwayEvent(toDashboardWrongwayEvent(msg.payload));
      }
    }

    if (msg.type === "traffic-event.updated" && msg.payload) {
      const event = normalizeEvent(msg.payload);
      setLastLidarEvent(event);

      if (isWrongWayEvent(event)) {
        if (isClosedEventStatus(event.status)) {
          setActiveDashboardEvent((prev) => (prev?.id === event.id ? null : prev));
          setLatestWrongwayEvent((prev) => (prev?.id === event.id ? null : prev));
          setRecentLogs((prev) => [
            { msg: `${event.message} ${event.status}`, time: formatEventTime(event.timestamp) },
            ...prev,
          ].slice(0, MAX_RECENT_LOGS));
        } else {
          const nextDashboardEvent = toDashboardWrongwayEvent(msg.payload);
          setLatestWrongwayEvent((prev) => (prev?.id === event.id ? nextDashboardEvent : prev));
          setActiveDashboardEvent((prev) => (prev?.id === event.id ? nextDashboardEvent : prev));
        }
      }
    }

    if (msg.type === "vehicle-track.updated" && msg.payload?.vehicleTrack) {
      const track = msg.payload.vehicleTrack;
      const timestamp = track.lastSeenAt || track.updatedAt || track.createdAt || new Date().toISOString();
      setLastLidarEvent({
        id: track.id || track.trackId,
        type: track.lastEventType || "vehicle-track",
        message: track.lastEventType === "normal-driving" ? "정주행 차량 수신" : "차량 track 갱신",
        location: track.externalZoneId || track.zoneId || "-",
        timestamp,
      });

      if (msg.payload.created) {
        setKpi((prev) => ({
          ...prev,
          vehiclesPassed: Number(prev.vehiclesPassed || 0) + 1,
        }));
      }
    }

    if (msg.type === "control-command.created" && msg.payload) {
      setControlBoardStatus((prev) => ({
        ...(prev || {}),
        latestCommand: msg.payload,
      }));
    }

    if (msg.type === "control-command.updated" && msg.payload) {
      setControlBoardStatus((prev) => ({
        ...(prev || {}),
        latestCommand: msg.payload,
      }));
    }

    if (msg.type === "dashboard-event") {
      const dashboardEvent = msg.payload;
      if (!eventModalEnabledRef.current) {
        if (dashboardEvent?.subMessage) {
          setRecentLogs((prev) => [{ msg: `(Muted) ${dashboardEvent.subMessage}`, time: dashboardEvent.timestamp || "" }, ...prev].slice(0, MAX_RECENT_LOGS));
        }
        return;
      }

      if (dashboardEvent?.type === "wrong-way") {
        setActiveDashboardEvent(dashboardEvent);
      } else if (dashboardEvent?.subMessage) {
        setRecentLogs((prev) => [{ msg: dashboardEvent.subMessage, time: dashboardEvent.timestamp || "" }, ...prev].slice(0, MAX_RECENT_LOGS));
      }
    }
  }, []);

  const { status: wsStatus } = useRealtimeSocket({
    url: WS_BASE,
    onMessage: handleRealtimeMessage,
    onOpen: () => pushLog("WebSocket 연결됨"),
    onClose: () => pushLog("WebSocket 연결 해제"),
    onError: () => pushLog("WebSocket 오류"),
  });

  // ------------------------------
  // stage별 스타일 함수 
  // ------------------------------
  const isCritical = Number(activeDashboardEvent?.stage) === 2;

  const eventModalTheme = isCritical
    ? {
        header: "bg-red-600",
        primaryBtn: "bg-red-600 hover:bg-red-700 focus:ring-red-300",
        stageTitle: "2차 경보: 역주행 차단 필요",
        statusText: "위험",
        stageLabel: "역주행 위험 단계",
      }
    : {
        header: "bg-amber-500",
        primaryBtn: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-300",
        stageTitle: "1차 경보: 역주행 감지",
        statusText: "경고",
        stageLabel: "역주행 경고 단계",
      };


  // ------------------------------
  // 헬스체크
  // ------------------------------
  useEffect(() => {
    let timer;

    const ping = async ()=>{
      try {
        const res = await fetch(apiUrl("/api/health"), { cache: "no-store" });
        setServerAlive(res.ok);
      }catch {
        setServerAlive(false);
      }
    };

    ping();
    timer=setInterval(ping, 3000); //3초마다
    return () => clearInterval(timer);
  }, []);

  const controlBoardMode = controlBoardModeLabel(controlBoardStatus || {});
  const latestControlCommand = controlBoardStatus?.latestCommand || null;
  const controlBoardLiveReady = Boolean(controlBoardStatus?.liveTcpReady);
  const controlBoardLiveApproved = Boolean(controlBoardStatus?.liveApproved);
  const controlBoardReviewRequired = controlBoardMode === "LIVE_TCP" && !controlBoardLiveReady;
  const controlBoardBadgeClass = controlBoardLiveReady
    ? "bg-emerald-100 text-emerald-700"
    : controlBoardReviewRequired
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  const activeIncident = activeDashboardEvent || latestWrongwayEvent;
  const activeIncidentStage = Number(activeIncident?.stage || 0);
  const hasActiveIncident = Boolean(activeIncident);
  const wrongWayRate =
    kpi.vehiclesPassed > 0 ? ((Number(kpi.wrongwayVehicles || 0) / kpi.vehiclesPassed) * 100).toFixed(2) : "0.00";
  const incidentTone = activeIncidentStage >= 2 ? "red" : hasActiveIncident ? "amber" : "green";
  const incidentStatusText = activeIncidentStage >= 2
    ? "2차 차단 필요"
    : hasActiveIncident
      ? "1차 경고 감지"
      : "감지 상황 없음";
  const lastLidarText = lastLidarEvent?.timestamp ? formatEventTimestamp(lastLidarEvent.timestamp) : "수신 대기";
  const reviewOrigin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const reviewLinks = [
    { label: "Dashboard", href: reviewOrigin || "/" },
    { label: "Swagger", href: `${reviewOrigin}/api-docs` },
    { label: "API health", href: `${reviewOrigin}/api/health` },
  ];


  return (
    <div className="p-6 space-y-6 bg-white min-h-screen relative">
      {/* 실시간 알림 오버레이 */}
      {activeDashboardEvent && (
      <div
        key={activeDashboardEvent.id}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div className="relative w-full max-w-[360px] overflow-hidden rounded-md bg-white shadow-2xl animate-in zoom-in-95 duration-300">
          <div className={`${eventModalTheme.header} relative px-5 py-3 text-center`}>
            <h2 className="text-lg font-black leading-6 text-white">{eventModalTheme.statusText}</h2>
            <button
              onClick={handleDismissDashboardEvent}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-5 pt-4">
            <div className="mb-3 flex items-start gap-2">
              <Siren className={`mt-0.5 h-4 w-4 shrink-0 ${isCritical ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <h3 className="text-base font-black leading-5 text-gray-900">{eventModalTheme.stageTitle}</h3>
                <p className="mt-1 text-xs font-semibold text-gray-500">{eventModalTheme.stageLabel}</p>
              </div>
            </div>

            <div className="mb-3 aspect-[16/9] overflow-hidden border border-gray-200 bg-gray-100" aria-label="실시간 영상 영역" />

            <div className="mb-4 space-y-1 text-sm font-bold text-gray-900">
              <p>
                위치:{" "}
                <span className="font-semibold text-gray-700">
                  {activeDashboardEvent.zone_id || "구역 미수신"}
                </span>
              </p>
              <p>
                시각:{" "}
                <span className="font-semibold text-gray-700">
                  {activeDashboardEvent.timestamp || "실시간"}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDismissDashboardEvent}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                무시
              </button>
              <button
                onClick={handleViewDashboardEvent}
                className={`rounded-md px-4 py-3 text-sm font-black text-white shadow-sm transition-colors focus:outline-none focus:ring-2 ${eventModalTheme.primaryBtn}`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

      {pendingCommand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-md bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <AlertTriangle className="h-5 w-5 text-gray-700" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-gray-900">{pendingCommand.title}</h2>
                <p className="mt-2 text-sm leading-5 text-gray-600">{pendingCommand.description}</p>
                <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
                  {controlBoardMode} / {pendingCommand.commandType}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPendingCommand(null)}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPendingCommand}
                disabled={Boolean(controlBoardBusy)}
                className={`rounded-md px-4 py-3 text-sm font-black text-white focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${pendingCommand.buttonClass}`}
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            역주행 방지 실시간 관제 대시보드
          </h1>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              현장-01
            </span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              LIDAR-01
            </span>
          </div>
        </div>

      <div className="flex items-center gap-3">
        {/* ✅ 서버 상태 점 */}
        <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded px-3 h-10">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              serverAlive ? "bg-green-500" : "bg-red-500"
            }`}
            title={serverAlive ? "API 정상" : "API 오류"}
          />
          <span className="font-mono text-xs text-gray-600">
            {serverAlive ? "API 정상" : "API 오류"}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded px-3 h-10">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              detectorAlive ? "bg-green-500" : "bg-red-500"
            }`}
            title={detectorAlive ? "감지 서버 정상" : "감지 서버 오류"}
          />
          <span className="font-mono text-xs text-gray-600">
            {detectorAlive ? "감지 서버" : "감지 서버 오류"}
          </span>
        </div>
          <button
            onClick={startDemo}
            className="h-10 px-4 rounded bg-gray-900 text-white text-xs font-bold hover:bg-gray-700"
          >
            데모 시작
          </button>
          <button
            onClick={resetDemo}
            className="h-10 px-4 rounded bg-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-300"
          >
            초기화
          </button>
        </div>


      </div>

      <div
        className={`rounded-lg border p-4 ${
          incidentTone === "red"
            ? "border-red-200 bg-red-50"
            : incidentTone === "amber"
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-full p-2 ${
                incidentTone === "red"
                  ? "bg-red-100 text-red-700"
                  : incidentTone === "amber"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {hasActiveIncident ? <Siren className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-gray-500">현재 상황</div>
              <div className="mt-1 text-lg font-black text-gray-900">{incidentStatusText}</div>
              <div className="mt-1 truncate text-sm text-gray-600">
                {hasActiveIncident
                  ? `${activeIncident.zone_id || "UNKNOWN"} / ${activeIncident.track_id || "track 미수신"}`
                  : "라이다 이벤트 수신 대기 중"}
              </div>
            </div>
          </div>

          <div className="rounded border border-white/70 bg-white/70 p-3">
            <div className="text-xs font-black uppercase tracking-wider text-gray-500">수신 체인</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
              <span className={serverAlive ? "rounded bg-emerald-100 px-2 py-1 text-emerald-700" : "rounded bg-red-100 px-2 py-1 text-red-700"}>
                API
              </span>
              <span className={wsStatus === "CONNECTED" ? "rounded bg-emerald-100 px-2 py-1 text-emerald-700" : "rounded bg-amber-100 px-2 py-1 text-amber-700"}>
                WS
              </span>
              <span className={detectorAlive ? "rounded bg-emerald-100 px-2 py-1 text-emerald-700" : "rounded bg-red-100 px-2 py-1 text-red-700"}>
                LIDAR
              </span>
            </div>
            <div className="mt-2 truncate text-xs text-gray-500">최근 라이다 수신: {lastLidarText}</div>
          </div>

          <div className="rounded border border-white/70 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-gray-500">최근 제어 명령</div>
                <div className="mt-1 truncate text-sm font-black text-gray-900">
                  {latestCommandSummary(latestControlCommand)}
                </div>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-1 text-[11px] font-black ${
                  controlBoardBadgeClass
                }`}
              >
                {controlBoardMode}
              </span>
            </div>
            <div className="mt-2 truncate font-mono text-xs text-gray-500">
              {latestControlCommand?.packetHex || "전송 패킷 없음"}
            </div>
          </div>
        </div>
      </div>

      {/* 시스템 알림 배너 + 토글 */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-100 rounded-full">
            <Siren className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-red-800 tracking-wide">시스템 경보 활성</span>
            <span className="text-xs text-red-600">역주행 감지 모니터링 중</span>
          </div>
        </div>

        <button
          onClick={() => setEventModalEnabled((v) => !v)}
          className="flex items-center space-x-3 bg-white px-3 py-1.5 rounded border border-red-100 shadow-sm"
          aria-label="알림 토글"
        >
          <span className="text-xs font-bold text-gray-600">알림</span>
          <div
            className={`w-10 h-5 rounded-full relative transition-colors ${
              eventModalEnabled ? "bg-red-500" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                eventModalEnabled ? "right-0.5" : "left-0.5"
              }`}
            />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="flex min-h-32 flex-col justify-between border-solid bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">통합제어보드</div>
              <div className="mt-1 text-xl font-black text-gray-900">{controlBoardMode}</div>
            </div>
            <span
              className={`h-3 w-3 rounded-full ${
                controlBoardLiveReady ? "bg-green-500" : controlBoardMode === "DRY_RUN" ? "bg-amber-500" : "bg-red-500"
              }`}
              title={controlBoardMode}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>
              <span className="font-bold text-gray-700">Host</span>{" "}
              {controlBoardStatus?.hostConfigured ? "설정됨" : "미설정"}
            </div>
            <div>
              <span className="font-bold text-gray-700">Port</span>{" "}
              {controlBoardStatus?.portConfigured ? "설정됨" : "미설정"}
            </div>
            <div>
              <span className="font-bold text-gray-700">liveApproved</span>{" "}
              {controlBoardLiveApproved ? "승인됨" : "미승인"}
            </div>
            <div>
              <span className="font-bold text-gray-700">safetyStatus</span>{" "}
              {controlBoardStatus?.safetyStatus || "-"}
            </div>
          </div>
          {controlBoardError && (
            <div className="mt-2 truncate text-xs font-semibold text-red-600">{controlBoardError}</div>
          )}
        </Card>

        <Card className="min-h-32 border-solid bg-white">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">최근 명령</div>
          <div className="mt-2 text-sm font-black text-gray-900">
            {latestCommandSummary(latestControlCommand)}
          </div>
          <div className="mt-2 truncate font-mono text-xs text-gray-500">
            {latestControlCommand?.packetHex || "전송 패킷 없음"}
          </div>
          <div className="mt-2 text-xs text-gray-400">
            CRC {latestControlCommand?.crcStatus || "-"} / retry {controlBoardStatus?.retryCount ?? "-"}
          </div>
        </Card>

        <Card className="min-h-32 border-solid bg-white">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">수동 제어</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => requestControlBoardCommand("STAGE_1_ON")}
              disabled={Boolean(controlBoardBusy)}
              className="rounded bg-amber-500 px-2 py-2 text-xs font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              1차 경고
            </button>
            <button
              type="button"
              onClick={() => requestControlBoardCommand("STAGE_2_ON")}
              disabled={Boolean(controlBoardBusy)}
              className="rounded bg-red-600 px-2 py-2 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              2차 차단
            </button>
            <button
              type="button"
              onClick={() => requestControlBoardCommand("STAGE_2_RETURN")}
              disabled={Boolean(controlBoardBusy)}
              className="rounded bg-gray-800 px-2 py-2 text-xs font-black text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              복귀
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            {controlBoardBusy
              ? `명령 전송 중: ${controlBoardBusy}`
              : controlBoardLiveReady
                ? "LIVE_TCP_READY: host/port 설정 후 실제 TCP 전송 모드입니다."
                : controlBoardReviewRequired
                  ? "LIVE_TCP_REVIEW: host/port 또는 현장 승인 확인이 필요합니다. LIVE_TCP_APPROVAL_REQUIRED 상태에서는 TCP 전송을 차단합니다."
                  : "DRY_RUN_SAFE: LIVE_TCP 전환 전에는 dry-run 명령으로 기록됩니다."}
          </div>
        </Card>

        <Card className="min-h-32 border-solid bg-white">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Review Access</div>
          <div className="space-y-2">
            {reviewLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:border-blue-300 hover:bg-blue-50"
              >
                <span>{link.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />
              </a>
            ))}
          </div>
          <div className="mt-3 truncate font-mono text-[11px] text-gray-500">
            {reviewOrigin || "same-origin runtime"}
          </div>
        </Card>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="flex flex-col justify-between h-32 cursor-pointer hover:bg-gray-50 hover:border-blue-400 transition-colors group">
          <div className="flex justify-between items-start" onClick={() => goEvents("analytics")}
        >
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <MoreHorizontal className="text-gray-300 w-5 h-5 group-hover:text-blue-400" />
          </div>
          <div onClick={() => goEvents("analytics")}>
            <div className="font-mono text-sm font-bold text-gray-700 mb-1">오늘 이벤트</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-gray-900">{kpi.todaysEvents}</span>
              <span className="text-xs text-green-600 bg-green-100 px-1 rounded">+{kpi.newEvents} 신규</span>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between h-32 cursor-pointer hover:bg-gray-50 hover:border-blue-400 transition-colors group">
          <div className="flex justify-between items-start" onClick={() => goEvents("vehicles")}>
            <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
              <Activity className="w-4 h-4 text-gray-600" />
            </div>
            <MoreHorizontal className="text-gray-300 w-5 h-5 group-hover:text-blue-400" />
          </div>
          <div onClick={() => goEvents("vehicles")}>
            <div className="font-mono text-sm font-bold text-gray-700 mb-1">통과 차량 수</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-gray-900">{kpi.vehiclesPassed.toLocaleString()}</span>
              <div className="flex items-center text-xs text-blue-600 bg-blue-100 px-1 rounded">
                <ArrowUpRight className="w-3 h-3 mr-1" />
                <span>DB unique</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between h-32 cursor-pointer hover:bg-red-50 hover:border-red-400 transition-colors group">
          <div className="flex justify-between items-start" onClick={() => navigate("/dashboard/wrongway")}>
            <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <MoreHorizontal className="text-gray-300 w-5 h-5 group-hover:text-red-400" />
          </div>
          <div onClick={() => navigate("/dashboard/wrongway")}>
            <div className="font-mono text-sm font-bold text-gray-700 mb-1">역주행 차량</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-gray-900">{Number(kpi.wrongwayVehicles || 0)}</span>
              <div className="flex items-center text-xs text-red-600 bg-red-100 px-1 rounded">
                <span className="animate-pulse mr-1">●</span>
                <span>역주행률 {wrongWayRate}%</span>
              </div>
            </div>
            <div className="mt-1 text-xs font-semibold text-gray-500">
              이벤트 {Number(kpi.wrongWayEvents || 0).toLocaleString()}건
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between h-32 cursor-pointer hover:bg-gray-50 hover:border-blue-400 transition-colors group">
          <div className="flex justify-between items-start" onClick={() => goEvents("unidentified")}>
            <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-gray-600" />
            </div>
            <MoreHorizontal className="text-gray-300 w-5 h-5 group-hover:text-blue-400" />
          </div>
          <div onClick={() => goEvents("unidentified")}>
            <div className="font-mono text-sm font-bold text-gray-700 mb-1">미식별</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-gray-900">{kpi.unidentified}</span>
              <div className="flex items-center text-xs text-red-600 bg-red-100 px-1 rounded">
                <ArrowDownRight className="w-3 h-3 mr-1" />
                <span>검토 대상</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <TrafficStatisticsPanel />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 메인 모니터링 */}
        <Card className="lg:col-span-2 h-[28rem]" title="실시간 모니터링">
          <div className="grid grid-cols-2 gap-4 h-[23rem]">
            {/* 카메라 영역 (1칸) */}
            <div className=" bg-gray-200 rounded border border-gray-300 relative overflow-hidden flex items-center justify-center">

              <div className="absolute top-3 left-3 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded flex items-center z-10">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse" />
                실시간 카메라
              </div>

              <img
                src={detectorUrl("/video_feed")}
                alt="YOLO Detection Feed"
                className="w-full h-full object-contain"
              />

              <div className="absolute bottom-2 left-2 text-[10px] text-gray-600 font-mono">
                CAM_01_ENTRANCE
              </div>
            </div>


             {/* 라이다 영역 (2칸) */}
              <div className=" bg-black rounded border border-gray-700 relative overflow-hidden flex">

                <div className="absolute top-3 left-3 px-2 py-0.5 bg-blue-900/80 border border-blue-500/50 text-blue-200 text-[10px] font-bold rounded font-mono z-10">
                  라이다 센서
                </div>

                <img
                  src={detectorUrl("/lidar_feed")}
                  alt="Lidar Point Cloud Feed"
                  className="w-full h-full object-contain"
                />


              </div>

          </div>
        </Card>

        {/* 우측 위젯 */}
        <Card className="h-[28rem] flex flex-col" title="제어 및 활동">
          <div className="flex-1 space-y-6">
            {/* 차단기 제어 */}
            <div>
              <div className="text-xs font-bold text-gray-400 mb-2 tracking-wider">차단기 제어</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={openGate}
                  className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded hover:bg-green-50 hover:border-green-300 transition-colors group bg-white"
                >
                  <ArrowUp className="w-5 h-5 text-gray-500 group-hover:text-green-600 mb-1" />
                  <span className="text-xs font-bold text-gray-700">열기</span>
                </button>
                <button
                  onClick={closeGate}
                  className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded hover:bg-red-50 hover:border-red-300 transition-colors group bg-white"
                >
                  <ArrowDown className="w-5 h-5 text-gray-500 group-hover:text-red-600 mb-1" />
                  <span className="text-xs font-bold text-gray-700">닫기</span>
                </button>
              </div>
            </div>

            {/* 전광판 문구 */}
            <div>
              <div className="text-xs font-bold text-gray-400 mb-2 tracking-wider">전광판 문구</div>
              <div className="flex space-x-2 mb-2">
                <div className="flex-1 relative">
                  <Megaphone className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    value={vmsText}
                    onChange={(e) => setVmsText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendVms()}
                    placeholder="문구 입력..."
                    className="w-full bg-gray-50 border border-gray-200 rounded py-1.5 pl-7 pr-2 text-xs font-mono focus:outline-none focus:border-blue-400"
                  />
                </div>
                <button
                  onClick={sendVms}
                  className="bg-gray-800 text-white px-3 rounded text-xs font-bold hover:bg-gray-700 transition-colors"
                >
                  전송
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => quickVms("정지")}
                  className="px-2 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold rounded hover:bg-gray-200 border border-gray-200"
                >
                  정지
                </button>
                <button
                  type="button"
                  onClick={() => quickVms("서행")}
                  className="px-2 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold rounded hover:bg-gray-200 border border-gray-200"
                >
                  서행
                </button>
                <button
                  type="button"
                  onClick={() => quickVms("역주행 주의")}
                  className="px-2 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold rounded hover:bg-gray-200 border border-gray-200"
                >
                  역주행 주의
                </button>
              </div>
            </div>

            {/* 최근 로그 */}
            <div>
              <div className="text-xs font-bold text-gray-400 mb-2 tracking-wider">최근 이벤트</div>
              <div className="space-y-2 bg-gray-50 p-2 rounded border border-gray-100 max-h-[117px] ">

                {recentLogs.length === 0 && (
                  <div className="text-xs text-gray-400">최근 수신 이벤트가 없습니다.</div>
                )}

                {recentLogs.slice(0,4).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs pb-1 border-b border-gray-200 border-dashed last:border-0 last:pb-0"
                  >
                    <span className="text-gray-600 truncate mr-2">{item.msg}</span>
                    <span className="text-gray-400 font-mono text-[10px]">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

