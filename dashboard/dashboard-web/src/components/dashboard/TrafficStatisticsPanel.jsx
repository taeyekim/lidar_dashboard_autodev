import { useEffect, useMemo, useState } from "react";
import { Car, RefreshCw, ShieldCheck, Siren, TrendingUp } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTrafficStatistics } from "../../features/statistics/statisticsApi";
import { Card } from "../../shared/components/Card";

const RANGE_OPTIONS = [
  { value: "daily", label: "일간" },
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
  { value: "yearly", label: "연간" },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatRate(value, suffix = "%") {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toFixed(2)}${suffix}`;
}

function formatDurationMs(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString()}ms`;
}

function formatPeriod(data) {
  if (!data?.period?.start || !data?.period?.end) return "집계 대기";
  return `${new Date(data.period.start).toLocaleString()} - ${new Date(data.period.end).toLocaleString()}`;
}

function getRiskTone(rate) {
  const value = Number(rate || 0);
  if (value >= 5) return { label: "위험", className: "bg-red-100 text-red-700" };
  if (value >= 1) return { label: "주의", className: "bg-amber-100 text-amber-700" };
  return { label: "정상", className: "bg-emerald-100 text-emerald-700" };
}

function MetricTile({ icon, label, value, subLabel, tone = "slate" }) {
  const TileIcon = icon;
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded ${toneClass}`}>
          <TileIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate text-[11px] font-black uppercase tracking-wider text-gray-400">{label}</div>
          <div className="mt-1 text-xl font-black leading-6 text-gray-900">{value}</div>
        </div>
      </div>
      <div className="mt-2 truncate text-xs font-semibold text-gray-500">{subLabel}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 font-black text-gray-900">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex min-w-36 justify-between gap-4">
          <span style={{ color: item.color }}>{item.name}</span>
          <span className="font-black text-gray-900">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TrafficStatisticsPanel() {
  const [range, setRange] = useState("daily");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const next = await fetchTrafficStatistics({ range });
        if (ignore) return;
        setData(next);
        setError("");
      } catch (err) {
        if (ignore) return;
        setError(err.message || "교통 통계를 불러오지 못했습니다.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 15000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [range]);

  const chartData = useMemo(
    () =>
      (data?.buckets || []).map((bucket) => ({
        label: bucket.label,
        normalVehicles: bucket.normalVehicles,
        wrongwayVehicles: bucket.wrongwayVehicles,
        wrongwayRate: bucket.wrongwayRate,
      })),
    [data],
  );

  const totals = data?.totals || {};
  const topZones = (data?.zones || []).slice(0, 4);

  return (
    <Card className="border-solid bg-white" title="교통 운영 통계">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-black text-gray-900">정주행/역주행 운영 통계</div>
          <div className="mt-1 truncate text-xs font-semibold text-gray-500">{formatPeriod(data)}</div>
          <div className="mt-1 text-xs font-semibold text-gray-500">
            공식 차량 수는 DB unique track 기준이며, 라이다 raw count는 진단/비교용으로 분리합니다.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="grid grid-cols-4 overflow-hidden rounded border border-gray-200 bg-gray-50">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`h-9 px-3 text-xs font-black transition-colors ${
                  range === option.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Car}
          label="정주행 차량"
          value={formatNumber(totals.normalVehicles)}
          subLabel={`DB unique track 전체 ${formatNumber(totals.vehiclesTotal)}대 기준`}
          tone="blue"
        />
        <MetricTile
          icon={Siren}
          label="역주행 차량"
          value={formatNumber(totals.wrongwayVehicles)}
          subLabel={`이벤트 ${formatNumber(totals.wrongwayEvents)}건`}
          tone="red"
        />
        <MetricTile
          icon={TrendingUp}
          label="역주행률"
          value={formatRate(totals.wrongwayRate)}
          subLabel={`unique 역주행 / 전체 track, 1차 ${formatNumber(totals.stage1Events)} / 2차 ${formatNumber(totals.stage2Events)}`}
          tone="slate"
        />
        <MetricTile
          icon={ShieldCheck}
          label="TCP ACK"
          value={formatRate(totals.commandSuccessRate)}
          subLabel={`평균 ${formatDurationMs(totals.averageResponseMs)} · LIVE ${formatNumber(totals.liveCommands)} / DRY ${formatNumber(totals.dryRunCommands)}`}
          tone="emerald"
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-72 rounded border border-gray-200 bg-white p-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="count" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="count" dataKey="normalVehicles" name="정주행" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="count" dataKey="wrongwayVehicles" name="역주행" fill="#dc2626" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="wrongwayRate"
                name="역주행률"
                stroke="#111827"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-gray-900">구역별 위험도</div>
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">상위 구역</div>
          </div>
          <div className="space-y-2">
            {topZones.length === 0 && (
              <div className="rounded border border-dashed border-gray-200 bg-white p-4 text-sm font-semibold text-gray-400">
                집계된 구역 데이터가 없습니다.
              </div>
            )}
            {topZones.map((zone) => {
              const risk = getRiskTone(zone.wrongwayRate);
              return (
                <div key={zone.zoneCode || zone.name} className="rounded border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-gray-900">{zone.name}</div>
                      <div className="mt-0.5 truncate text-xs font-semibold text-gray-400">
                        {zone.zoneCode || "UNKNOWN"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`rounded px-2 py-1 text-[11px] font-black ${risk.className}`}>
                        {risk.label}
                      </span>
                      <div className="mt-1 text-sm font-black text-red-600">{formatRate(zone.wrongwayRate)}</div>
                      <div className="text-[11px] font-semibold text-gray-400">역주행률</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-red-500"
                      style={{ width: `${Math.min(100, Number(zone.wrongwayRate || 0))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs font-semibold text-gray-500">
                    <span>정주행 {formatNumber(zone.normalVehicles)}</span>
                    <span>역주행 {formatNumber(zone.wrongwayVehicles)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
