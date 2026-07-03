import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Globe,
  LockKeyhole,
  Monitor,
  RefreshCw,
  Save,
  Server,
  Shield,
  SlidersHorizontal,
  Volume2,
  Wifi,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fetchControlBoardStatus } from "../../features/controlBoard/controlBoardApi";
import { fetchSystemStatus } from "../../features/devices/devicesApi";
import { AUTH_CSRF_COOKIE_NAME } from "../../shared/api/config";
import { Card } from "../../shared/components/Card";

const SECTIONS = [
  { id: "general", icon: Globe, label: "일반" },
  { id: "notifications", icon: Bell, label: "알림" },
  { id: "security", icon: Shield, label: "보안" },
  { id: "display", icon: Monitor, label: "화면" },
];

const STATUS_TONE = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-gray-200 bg-white text-gray-700",
};

function NavItem({ id, icon, label, activeSection, onSelect }) {
  const active = activeSection === id;
  const iconElement = React.createElement(icon, { className: "h-4 w-4" });
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`flex h-11 w-full items-center gap-3 rounded border px-3 text-left text-sm transition-colors ${
        active
          ? "border-gray-900 bg-gray-900 font-bold text-white"
          : "border-gray-200 bg-white font-semibold text-gray-600 hover:bg-gray-50"
      }`}
    >
      {iconElement}
      <span>{label}</span>
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
      aria-label={label}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, value, children }) {
  const iconElement = React.createElement(Icon, { className: "h-4 w-4" });
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-600">
          {iconElement}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-800">{title}</div>
          <div className="mt-1 text-xs leading-5 text-gray-500">{description}</div>
        </div>
      </div>
      <div className="shrink-0 text-left sm:text-right">
        {children || (
          <div className="min-w-28 rounded border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ tone = "neutral", children }) {
  return (
    <span className={`inline-flex h-8 items-center rounded border px-3 text-xs font-bold ${STATUS_TONE[tone]}`}>
      {children}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "수신 이력 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDurationMs(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString()}ms`;
}

function getSystemTone(systemStatus = {}) {
  if (systemStatus.database?.ok === false) return "error";
  if (systemStatus.controlBoard?.mode === "LIVE_TCP") return "ok";
  if (systemStatus.controlBoard?.mode === "DRY_RUN") return "warn";
  return "neutral";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("general");
  const [systemStatus, setSystemStatus] = useState(null);
  const [controlBoardStatus, setControlBoardStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [preferences, setPreferences] = useState({
    dashboardAlert: true,
    audioAlert: true,
    eventDigest: true,
    highContrast: false,
    compactMode: false,
    autoRefresh: true,
  });

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [system, controlBoard] = await Promise.all([
        fetchSystemStatus(),
        fetchControlBoardStatus().catch(() => null),
      ]);
      setSystemStatus(system || {});
      setControlBoardStatus(controlBoard || null);
    } catch (loadError) {
      setError(loadError.message || "운영 상태를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const statusTone = getSystemTone(systemStatus || {});
  const operatorName = user?.name || user?.userId || "Operator";
  const controlMode = controlBoardStatus?.mode || systemStatus?.controlBoard?.mode || "UNKNOWN";
  const controlSafetyStatus = controlBoardStatus?.safetyStatus || systemStatus?.controlBoard?.safetyStatus || "UNKNOWN";
  const controlLiveApproved = Boolean(controlBoardStatus?.liveApproved || systemStatus?.controlBoard?.liveApproved);
  const csrfEnabled =
    typeof document !== "undefined" && document.cookie.includes(`${AUTH_CSRF_COOKIE_NAME}=`);

  const summary = useMemo(
    () => [
      {
        icon: Server,
        title: "API",
        value: systemStatus?.server?.ok === false ? "점검 필요" : "정상",
        tone: systemStatus?.server?.ok === false ? "error" : "ok",
      },
      {
        icon: Database,
        title: "Database",
        value: systemStatus?.database?.ok === false ? "오류" : "연결",
        tone: systemStatus?.database?.ok === false ? "error" : "ok",
      },
      {
        icon: Wifi,
        title: "Control Board",
        value: controlMode,
        tone: controlMode === "LIVE_TCP" ? "ok" : controlMode === "DRY_RUN" ? "warn" : "neutral",
      },
    ],
    [controlMode, systemStatus],
  );

  const updatePreference = (key) => (nextValue) => {
    setPreferences((current) => ({ ...current, [key]: nextValue }));
  };

  const savePreferences = () => {
    setSavedAt(new Date());
  };

  return (
    <div className="min-h-screen space-y-6 bg-white p-6 font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">설정</h1>
          <div className="text-sm text-gray-500">운영 환경, 알림, 보안, 화면 표시 기준</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadStatus}
            className="inline-flex h-10 items-center gap-2 rounded border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            onClick={savePreferences}
            className="inline-flex h-10 items-center gap-2 rounded bg-gray-900 px-4 text-sm font-bold text-white hover:bg-gray-800"
          >
            <Save className="h-4 w-4" />
            변경 저장
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {summary.map((item) => (
          <div key={item.title} className={`rounded border p-4 ${STATUS_TONE[item.tone]}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase opacity-70">{item.title}</div>
                <div className="mt-1 font-mono text-lg font-bold">{item.value}</div>
              </div>
              <item.icon className="h-5 w-5 opacity-80" />
            </div>
          </div>
        ))}
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-2">
          {SECTIONS.map((section) => (
            <NavItem
              key={section.id}
              id={section.id}
              icon={section.icon}
              label={section.label}
              activeSection={activeSection}
              onSelect={setActiveSection}
            />
          ))}
        </div>

        <div className="space-y-6">
          {activeSection === "general" && (
            <>
              <Card title="운영 기본값" className="border-gray-200 bg-gray-50">
                <SettingRow
                  icon={SlidersHorizontal}
                  title="시스템 이름"
                  description="관제 화면과 납품 문서에서 사용하는 운영 시스템 명칭입니다."
                  value="역주행 방지 실시간 관제"
                />
                <SettingRow
                  icon={Globe}
                  title="언어와 시간대"
                  description="현장 운영 기준은 한국어와 KST 시간 표기를 사용합니다."
                  value="한국어 / UTC+09:00"
                />
                <SettingRow
                  icon={Clock}
                  title="최근 상태 확인"
                  description="백엔드 상태 API가 마지막으로 응답한 시각입니다."
                  value={formatDateTime(systemStatus?.checkedAt)}
                />
              </Card>

              <Card title="현장 운전 모드" className="border-gray-200 bg-gray-50">
                <SettingRow
                  icon={Wifi}
                  title="통합제어보드"
                  description="실장비 연결 전에는 DRY_RUN으로 명령 lifecycle과 packetHex를 검증합니다."
                >
                  <StatusBadge tone={statusTone}>{controlMode}</StatusBadge>
                </SettingRow>
                <SettingRow
                  icon={Shield}
                  title="LIVE_TCP 승인 상태"
                  description="CONTROL_BOARD_LIVE_APPROVED=true가 아니면 LIVE_TCP_APPROVAL_REQUIRED로 실제 TCP 전송을 차단합니다."
                  value={`${controlLiveApproved ? "승인됨" : "미승인"} · ${controlSafetyStatus}`}
                />
                <SettingRow
                  icon={Clock}
                  title="TCP ACK 평균 응답"
                  description="최근 ACK 명령의 sentAt to acknowledgedAt 기준 평균 지연입니다."
                  value={`${formatDurationMs(controlBoardStatus?.averageResponseMs)} · 샘플 ${formatNumber(controlBoardStatus?.responseSampleCount)}건`}
                />
                <SettingRow
                  icon={Database}
                  title="차량 수 기준"
                  description="정주행 1초 반복 수신은 track ID 기반 unique count로 집계합니다."
                  value="DB vehicle_tracks"
                />
              </Card>
            </>
          )}

          {activeSection === "notifications" && (
            <Card title="알림 채널" className="border-gray-200 bg-gray-50">
              <SettingRow
                icon={Bell}
                title="대시보드 경보"
                description="역주행 이벤트와 통합제어보드 명령 실패를 화면 알림으로 표시합니다."
              >
                <Toggle checked={preferences.dashboardAlert} onChange={updatePreference("dashboardAlert")} label="대시보드 경보" />
              </SettingRow>
              <SettingRow
                icon={Volume2}
                title="운영실 사운드"
                description="1차 경고와 2차 차단 이벤트를 서로 다른 알림음으로 구분합니다."
              >
                <Toggle checked={preferences.audioAlert} onChange={updatePreference("audioAlert")} label="운영실 사운드" />
              </SettingRow>
              <SettingRow
                icon={Clock}
                title="근무 교대 요약"
                description="최근 이벤트, 제어 명령, 미확인 로그를 교대 시 빠르게 확인할 수 있게 유지합니다."
              >
                <Toggle checked={preferences.eventDigest} onChange={updatePreference("eventDigest")} label="근무 교대 요약" />
              </SettingRow>
            </Card>
          )}

          {activeSection === "security" && (
            <Card title="보안 상태" className="border-gray-200 bg-gray-50">
              <SettingRow
                icon={LockKeyhole}
                title="로그인 세션"
                description="JWT는 응답 본문이나 localStorage가 아니라 HttpOnly 쿠키로 유지됩니다."
              >
                <StatusBadge tone="ok">{operatorName}</StatusBadge>
              </SettingRow>
              <SettingRow
                icon={Shield}
                title="CSRF 보호"
                description="쿠키 인증 mutation 요청은 X-CSRF-Token 헤더 검증을 통과해야 합니다."
              >
                <StatusBadge tone={csrfEnabled ? "ok" : "warn"}>{csrfEnabled ? "활성" : "로그인 필요"}</StatusBadge>
              </SettingRow>
              <SettingRow
                icon={CheckCircle2}
                title="Bearer 호환"
                description="스크립트 클라이언트 호환용으로만 유지하며 브라우저 UI는 쿠키 인증을 사용합니다."
                value="제한적 허용"
              />
            </Card>
          )}

          {activeSection === "display" && (
            <Card title="화면 표시" className="border-gray-200 bg-gray-50">
              <SettingRow
                icon={Monitor}
                title="자동 새로고침"
                description="WebSocket이 지연될 때 API polling fallback으로 현장 상태를 갱신합니다."
              >
                <Toggle checked={preferences.autoRefresh} onChange={updatePreference("autoRefresh")} label="자동 새로고침" />
              </SettingRow>
              <SettingRow
                icon={Eye}
                title="고대비 강조"
                description="역주행률, 명령 실패, 통신 저하 상태의 색 대비를 높입니다."
              >
                <Toggle checked={preferences.highContrast} onChange={updatePreference("highContrast")} label="고대비 강조" />
              </SettingRow>
              <SettingRow
                icon={SlidersHorizontal}
                title="조밀한 목록"
                description="이벤트 로그와 장비 목록을 반복 감시하기 좋은 밀도로 표시합니다."
              >
                <Toggle checked={preferences.compactMode} onChange={updatePreference("compactMode")} label="조밀한 목록" />
              </SettingRow>
            </Card>
          )}

          {savedAt && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              표시 기본값이 현재 브라우저 세션에 저장되었습니다. {formatDateTime(savedAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
