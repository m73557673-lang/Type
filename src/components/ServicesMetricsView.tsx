import React, { useState } from 'react';
import {
  Server,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { Service, Metric } from '../types';

interface ServicesMetricsViewProps {
  services: Service[];
  metrics: Metric[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ServicesMetricsView: React.FC<ServicesMetricsViewProps> = ({
  services,
  metrics,
  onRefresh,
  isRefreshing
}) => {
  const [metricMode, setMetricMode] = useState<'latency' | 'errors' | 'saturation'>('latency');

  // Format metrics timeseries
  const timeMap = new Map<string, any>();
  metrics.forEach(m => {
    const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!timeMap.has(timeStr)) {
      timeMap.set(timeStr, { timestamp: timeStr });
    }
    const entry = timeMap.get(timeStr);
    if (m.metric_name === 'latency_p95') entry.latency_p95 = m.value;
    else if (m.metric_name === 'error_rate') entry.error_rate = m.value;
    else if (m.metric_name === 'pool_saturation') entry.pool_saturation = m.value;
    else if (m.metric_name === 'memory_percent') entry.memory_percent = m.value;
  });

  const chartData = Array.from(timeMap.values()).reverse();

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Microservices Fleet Health & Metrics (GET /services)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational state from SQLite Service and Metric tables with pagination.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-amber-400/90 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
            SYNTHETIC TELEMETRY
          </span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Services Fleet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => {
          const isOutage = svc.status === 'OUTAGE';
          const isDegraded = svc.status === 'DEGRADED';
          return (
            <div
              key={svc.id}
              className={`p-4 rounded-lg bg-[#0c1220] border transition space-y-3 ${
                isOutage
                  ? 'border-rose-800/70 shadow-[0_0_15px_rgba(244,63,94,0.08)]'
                  : isDegraded
                  ? 'border-amber-800/60 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono font-semibold text-slate-100">{svc.name}</h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    Env: {svc.environment} · Owner: {svc.owner}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                    isOutage
                      ? 'text-rose-400 bg-rose-950/60 border border-rose-800/60'
                      : isDegraded
                      ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                      : 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                  }`}
                >
                  {svc.status}
                </span>
              </div>

              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60 text-xs font-mono flex items-center justify-between text-slate-400">
                <span>Service ID: #{svc.id}</span>
                <span className="text-cyan-400">{svc.owner}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Telemetry Chart Section */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Live Timeseries from SQLite Metric Table
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Retrieved via <code className="font-mono text-cyan-300">GET /incidents/{'{id}'}/metrics</code>.
            </p>
          </div>

          <div className="flex items-center bg-slate-900 p-1 rounded-md border border-slate-800 text-xs">
            <button
              onClick={() => setMetricMode('latency')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                metricMode === 'latency'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Latency (p95)
            </button>
            <button
              onClick={() => setMetricMode('errors')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                metricMode === 'errors'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Error Rate (%)
            </button>
            <button
              onClick={() => setMetricMode('saturation')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                metricMode === 'saturation'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Saturation (%)
            </button>
          </div>
        </div>

        <div className="h-72 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0b111e',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#e2e8f0',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                {metricMode === 'latency' && (
                  <Area
                    type="monotone"
                    dataKey="latency_p95"
                    name="p95 Latency (ms)"
                    stroke="#06b6d4"
                    fill="url(#cyanGradient)"
                    strokeWidth={2}
                  />
                )}

                {metricMode === 'errors' && (
                  <Area
                    type="monotone"
                    dataKey="error_rate"
                    name="Error Rate (%)"
                    stroke="#f43f5e"
                    fill="url(#roseGradient)"
                    strokeWidth={2}
                  />
                )}

                {metricMode === 'saturation' && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="pool_saturation"
                      name="Pool Saturation (%)"
                      stroke="#f43f5e"
                      fill="url(#roseGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="memory_percent"
                      name="Worker Memory (%)"
                      stroke="#a855f7"
                      fill="#a855f7"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No metric samples available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
