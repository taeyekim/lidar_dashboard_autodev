import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card } from "../../shared/components/Card";
import {
  fetchDevices,
  fetchDeviceStatus,
  fetchSystemStatus,
  normalizeDevices,
} from "../../features/devices/devicesApi";

function formatDateTime(value) {
  if (!value) return "미수신";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function statusTone(status = "", healthStatus = "") {
  const value = `${status} ${healthStatus}`.toUpperCase();
  if (value.includes("ERROR") || value.includes("FAILED") || value.includes("OFFLINE")) {
    return {
      label: "오류",
      icon: WifiOff,
      card: "border-red-200 bg-red-50",
      iconWrap: "bg-red-100 text-red-700",
      text: "text-red-700",
    };
  }
  if (value.includes("ONLINE") || value.includes("OK") || value.includes("HEALTHY")) {
    return {
      label: "정상",
      icon: Wifi,
      card: "border-emerald-200 bg-emerald-50",
      iconWrap: "bg-emerald-100 text-emerald-700",
      text: "text-emerald-700",
    };
  }
  return {
    label: "미연동",
    icon: AlertTriangle,
    card: "border-amber-200 bg-amber-50",
    iconWrap: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
  };
}

function SummaryCard({ icon, title, value, subText, tone = "gray" }) {
  const IconComponent = icon;
  const toneClass = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    gray: "border-gray-200 bg-white text-gray-700",
  }[tone];

  return (
    <Card className={`p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</div>
          <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
        </div>
        <IconComponent className="h-5 w-5 opacity-80" />
      </div>
      <div className="mt-2 text-xs opacity-80">{subText}</div>
    </Card>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({});
  const [systemStatus, setSystemStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDevices() {
    setLoading(true);
    setError("");
    try {
      const [deviceItems, statusSummary, systemSummary] = await Promise.all([
        fetchDevices(),
        fetchDeviceStatus(),
        fetchSystemStatus(),
      ]);
      setDevices(normalizeDevices(deviceItems));
      setDeviceStatus(statusSummary || {});
      setSystemStatus(systemSummary || {});
    } catch (err) {
      setError(err.message || "장비 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  const summary = useMemo(() => {
    const total = deviceStatus.total ?? devices.length;
    const online = deviceStatus.byStatus?.ONLINE || deviceStatus.byHealthStatus?.OK || 0;
    const unknown = deviceStatus.byStatus?.UNKNOWN || deviceStatus.byHealthStatus?.UNKNOWN || 0;
    const errorCount =
      (deviceStatus.byStatus?.ERROR || 0) +
      (deviceStatus.byHealthStatus?.ERROR || 0) +
      (deviceStatus.byStatus?.OFFLINE || 0);

    return { total, online, unknown, errorCount };
  }, [deviceStatus, devices.length]);

  const systemTone = systemStatus.database?.ok === false ? "red" : summary.errorCount > 0 ? "amber" : "green";
  const systemLabel = systemStatus.database?.ok === false ? "DB 오류" : summary.total > 0 ? "구성 완료" : "장비 미구성";

  return (
    <div className="min-h-screen space-y-6 bg-white p-6 font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">장비 상태</h1>
          <div className="text-sm text-gray-500">라이다 PC, 통합제어보드, 현장 구역 연동 상태</div>
        </div>
        <button
          type="button"
          onClick={loadDevices}
          className="inline-flex h-10 items-center justify-center gap-2 rounded border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={CheckCircle2}
          title="시스템"
          value={systemLabel}
          subText={`점검 시각 ${formatDateTime(systemStatus.checkedAt)}`}
          tone={systemTone}
        />
        <SummaryCard
          icon={Server}
          title="등록 장비"
          value={summary.total}
          subText={`ONLINE ${summary.online} / UNKNOWN ${summary.unknown}`}
        />
        <SummaryCard
          icon={Activity}
          title="최근 수신"
          value={systemStatus.ingest?.status || "NO_DATA"}
          subText={formatDateTime(systemStatus.ingest?.latestEvent?.receivedAt)}
          tone={systemStatus.ingest?.latestEvent ? "green" : "amber"}
        />
        <SummaryCard
          icon={HardDrive}
          title="제어보드"
          value={systemStatus.controlBoard?.mode || "UNKNOWN"}
          subText={systemStatus.controlBoard?.hostConfigured ? "TCP 대상 설정됨" : "TCP 대상 미설정"}
          tone={systemStatus.controlBoard?.mode === "LIVE_TCP" ? "green" : "amber"}
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3 text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-bold">등록된 장비가 없습니다.</div>
              <div className="mt-1 text-sm">
                Prisma seed 또는 현장 장비 등록 후 이 화면에서 실제 장비 상태를 확인할 수 있습니다.
              </div>
            </div>
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-4 mt-2 text-lg font-bold text-gray-800">현장 장비 목록</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {devices.map((device) => {
            const tone = statusTone(device.status, device.healthStatus);
            const ToneIcon = tone.icon;
            return (
              <Card key={device.id} className={`p-4 ${tone.card}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${tone.iconWrap}`}>
                      <Server className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-bold text-gray-900">{device.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span>{device.type}</span>
                        <span>{device.code}</span>
                        <span>{device.ipAddress}{device.port ? `:${device.port}` : ""}</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {device.siteName} / {device.zoneName} / {device.location}
                      </div>
                    </div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1 text-xs font-bold ${tone.text}`}>
                    <ToneIcon className="h-3.5 w-3.5" />
                    <span>{tone.label}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/70 pt-3 text-xs text-gray-600 sm:grid-cols-3">
                  <div>
                    <div className="font-bold text-gray-500">상태</div>
                    <div className="mt-1 font-mono text-gray-800">{device.status}</div>
                  </div>
                  <div>
                    <div className="font-bold text-gray-500">헬스</div>
                    <div className="mt-1 font-mono text-gray-800">{device.healthStatus}</div>
                  </div>
                  <div>
                    <div className="font-bold text-gray-500">마지막 수신</div>
                    <div className="mt-1 font-mono text-gray-800">{formatDateTime(device.lastSeenAt)}</div>
                  </div>
                </div>

                {device.latestMessage && (
                  <div className="mt-3 rounded bg-white/70 px-3 py-2 text-xs text-gray-600">
                    {device.latestMessage}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
