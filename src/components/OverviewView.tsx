import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Server,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Clock,
  Zap,
  Activity,
  Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { Incident, Service, Metric, Action, SimulationStatus, SimulationEvent } from '../types';
import { SimulationController } from './SimulationController';

interface OverviewViewProps {
  incidents: Incident[];
  services: Service[];
  metrics: Metric[];
  actions: Action[];
  simulationStatus: SimulationStatus | null;
  simulationEvents: SimulationEvent[];
  onStartScenario: (scenario: 'incident' | 'healthy') => Promise<void>;
  onResetSimulation: () => Promise<void>;
  onSelectIncident: (id: number) => void;
  onNavigate: (tab: any) => void;
  isLoading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  incidents,
  services,
  metrics,
  actions,
  simulationStatus,
  simulationEvents,
  onStartScenario,
  onResetSimulation,
  onSelectIncident,
  onNavigate,
  isLoading
}) => {
  const [selectedMetricTab, setSelectedMetricTab] = useState<'all' | 'latency' | 'errors' | 'pool' | 'traffic'>('all');

  const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED');
  const criticalIncidents = activeIncidents.filter(i => i.severity === 'CRITICAL');
  const affectedServices = services.filter(s => s.status !== 'HEALTHY');
  const pendingActions = actions.filter(a => a.status === 'PENDING');
  const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED');

  // Format metrics timeseries for Recharts
  const timeMap = new Map<string, any>();
  metrics.forEach(m => {
    const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!timeMap.has(timeStr)) {
      timeMap.set(timeStr, { timestamp: timeStr });
    }
    const entry = timeMap.get(timeStr);
    if (m.metric_name === 'latency_p95' && m.service_id === 2) entry.checkout_latency = m.value;
    else if (m.metric_name === 'latency_p95' && m.service_id === 1) entry.gateway_latency = m.value;
    else if (m.metric_name === 'error_rate') entry.error_rate = m.value;
    else if (m.metric_name === 'pool_utilization') entry.pool_utilization = m.value;
    else if (m.metric_name === 'request_volume') entry.request_volume = m.value;
  });

  const chartData = Array.from(timeMap.values()).reverse();

  return (
    <div className="space-y-6">
      {/* Simulation Engine Controller Bar */}
      <SimulationController
        status={simulationStatus}
        events={simulationEvents}
        onStartScenario={onStartScenario}
        onResetSimulation={onResetSimulation}
        isProcessing={isLoading}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Incidents */}
        <div
          onClick={() => onNavigate('incidents')}
          className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Incidents</span>
            <AlertCircle className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 font-mono">
              {activeIncidents.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              / {incidents.length} total
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>{criticalIncidents.length} critical priority</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
          </div>
        </div>

        {/* Card 2: Critical Severity */}
        <div
          onClick={() => onNavigate('incidents')}
          className="p-4 rounded-lg bg-[#0c1220] border border-rose-900/30 hover:border-rose-800/60 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Critical Priority (P0)</span>
            <AlertTriangle className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-rose-400 font-mono">
              {criticalIncidents.length}
            </span>
            <span className="text-xs text-rose-400/80 font-mono">requires SRE review</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>DB pool starvation</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-rose-400 transition-colors" />
          </div>
        </div>

        {/* Card 3: Affected Services */}
        <div
          onClick={() => onNavigate('services')}
          className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Affected Services</span>
            <Server className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-amber-300 font-mono">
              {affectedServices.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              / {services.length} checkout services
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>{affectedServices.map(s => s.name).slice(0, 2).join(', ') || 'All healthy'}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 transition-colors" />
          </div>
        </div>

        {/* Card 4: Remediation Action Status */}
        <div
          onClick={() => onNavigate('remediation')}
          className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Remediation Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 font-mono">
              {pendingActions.length > 0 ? `${pendingActions.length} Pending` : 'Nominal'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {resolvedIncidents.length} resolved
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Human SRE approval required</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
          </div>
        </div>
      </div>

      {/* Synthetic E-Commerce Telemetry Correlator (Latency, Errors, Volume, Pool) */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Synthetic Telemetry Correlator (E-Commerce Checkout)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live timeseries: Request Latency, Error Rate, Request Volume (RPS), and DB Connection Pool Saturation (%).
            </p>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center bg-slate-900 p-1 rounded-md border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedMetricTab('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                selectedMetricTab === 'all' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold' : 'text-slate-400'
              }`}
            >
              All Signals
            </button>
            <button
              onClick={() => setSelectedMetricTab('latency')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                selectedMetricTab === 'latency' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold' : 'text-slate-400'
              }`}
            >
              Latency
            </button>
            <button
              onClick={() => setSelectedMetricTab('errors')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                selectedMetricTab === 'errors' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold' : 'text-slate-400'
              }`}
            >
              Error Rate
            </button>
            <button
              onClick={() => setSelectedMetricTab('pool')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                selectedMetricTab === 'pool' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold' : 'text-slate-400'
              }`}
            >
              Pool Saturation
            </button>
            <button
              onClick={() => setSelectedMetricTab('traffic')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                selectedMetricTab === 'traffic' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold' : 'text-slate-400'
              }`}
            >
              Traffic (RPS)
            </button>
          </div>
        </div>

        <div className="h-64 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Latency (ms) / RPS', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: '% (Pool / Error)', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 10 }}
                />
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

                {(selectedMetricTab === 'all' || selectedMetricTab === 'latency') && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="checkout_latency"
                    name="Checkout Latency p95 (ms)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                  />
                )}

                {(selectedMetricTab === 'all' || selectedMetricTab === 'pool') && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pool_utilization"
                    name="DB Pool Saturation (%)"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={false}
                  />
                )}

                {(selectedMetricTab === 'all' || selectedMetricTab === 'errors') && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="error_rate"
                    name="HTTP Error Rate (%)"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={false}
                  />
                )}

                {(selectedMetricTab === 'all' || selectedMetricTab === 'traffic') && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="request_volume"
                    name="Checkout Ingress (RPS)"
                    stroke="#a855f7"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading operational metrics from SQLite...
            </div>
          )}
        </div>
      </div>

      {/* Grid: 4 E-Commerce Services & Recent Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Services Fleet (4 cols) */}
        <div className="lg:col-span-5 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">E-Commerce Checkout Fleet</h3>
              <p className="text-xs text-slate-400">4 Core microservices state</p>
            </div>
            <button
              onClick={() => onNavigate('services')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
            >
              <span>View Fleet</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="p-3 rounded bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-200">{svc.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{svc.owner}</div>
                </div>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-medium ${
                    svc.status === 'OUTAGE'
                      ? 'text-rose-400 bg-rose-950/60 border border-rose-800/60'
                      : svc.status === 'DEGRADED'
                      ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                      : 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                  }`}
                >
                  {svc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident Queue (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Incident Queue</h3>
              <p className="text-xs text-slate-400">Automated correlation from telemetry</p>
            </div>
            <button
              onClick={() => onNavigate('incidents')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
            >
              <span>All Incidents</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="pb-2 font-mono">ID</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {incidents.slice(0, 4).map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-2.5 font-mono font-medium text-cyan-400">INC-{inc.id}</td>
                    <td className="py-2.5 text-slate-200 max-w-[200px] truncate" title={inc.title}>
                      {inc.title.replace('[SYNTHETIC] ', '')}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          inc.severity === 'CRITICAL'
                            ? 'text-rose-400 bg-rose-950/60 border border-rose-800/50'
                            : 'text-amber-400 bg-amber-950/60 border border-amber-800/50'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            inc.status === 'RESOLVED' ? 'bg-emerald-400' : 'bg-cyan-400 animate-pulse'
                          }`}
                        />
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => {
                          onSelectIncident(inc.id);
                          onNavigate('investigation');
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
