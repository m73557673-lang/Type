import React, { useState } from 'react';
import {
  AlertTriangle,
  Plus,
  Search,
  ArrowRight,
  Clock,
  Layers,
  Wrench,
  X,
  Radar,
  Activity
} from 'lucide-react';
import { Incident, Service } from '../types';

interface IncidentsViewProps {
  incidents: Incident[];
  services: Service[];
  onSelectIncident: (id: number) => void;
  onNavigate: (tab: any) => void;
  onCreateIncident: (data: {
    title: string;
    severity?: string;
    status?: string;
    service_id: number;
  }) => Promise<void>;
  onDetectBreaches: () => Promise<any>;
  isLoading: boolean;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  services,
  onSelectIncident,
  onNavigate,
  onCreateIncident,
  onDetectBreaches,
  isLoading
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionNotice, setDetectionNotice] = useState<string | null>(null);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newServiceId, setNewServiceId] = useState<number>(services[0]?.id || 1);
  const [newSeverity, setNewSeverity] = useState('HIGH');

  const filteredIncidents = incidents.filter(inc => {
    if (statusFilter !== 'ALL' && inc.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (severityFilter !== 'ALL' && inc.severity.toUpperCase() !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const serviceName = inc.service_name || '';
      return inc.title.toLowerCase().includes(q) ||
             serviceName.toLowerCase().includes(q) ||
             inc.id.toString().includes(q);
    }
    return true;
  });

  const handleScanTelemetry = async () => {
    setIsDetecting(true);
    setDetectionNotice(null);
    try {
      const res = await onDetectBreaches();
      setDetectionNotice(
        `Detection run complete: ${res.breaches_detected} breaches evaluated, ${res.incidents_created} incidents created, ${res.deduplicated} active incidents deduplicated.`
      );
      setTimeout(() => setDetectionNotice(null), 6000);
    } catch (err: any) {
      setDetectionNotice(`Detection failed: ${err.message}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateIncident({
        title: newTitle,
        service_id: newServiceId,
        severity: newSeverity,
        status: 'detected'
      });
      setIsModalOpen(false);
      setNewTitle('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'detected':
        return 'text-amber-400 bg-amber-950/60 border-amber-800/60';
      case 'investigating':
        return 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60 animate-pulse';
      case 'awaiting_approval':
        return 'text-purple-400 bg-purple-950/60 border-purple-800/60';
      case 'remediating':
        return 'text-blue-400 bg-blue-950/60 border-blue-800/60';
      case 'validating':
        return 'text-teal-400 bg-teal-950/60 border-teal-800/60';
      case 'resolved':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
      case 'failed':
        return 'text-rose-400 bg-rose-950/60 border-rose-800/60';
      default:
        return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-cyan-400" />
            Production Incidents (Detection & Investigation Queue)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitors error rates and latency against configurable thresholds with automatic deduplication.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScanTelemetry}
            disabled={isDetecting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-cyan-800/60 text-cyan-300 font-medium text-xs transition shadow-sm disabled:opacity-50"
          >
            <Radar className={`w-4 h-4 text-cyan-400 ${isDetecting ? 'animate-spin' : ''}`} />
            <span>{isDetecting ? 'Evaluating...' : 'Scan Telemetry (POST /incidents/detect)'}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Simulate Incident</span>
          </button>
        </div>
      </div>

      {detectionNotice && (
        <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/50 text-xs text-cyan-300 flex items-center justify-between">
          <span>{detectionNotice}</span>
          <button onClick={() => setDetectionNotice(null)} className="text-slate-400 hover:text-slate-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, title, or service name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-900/80 p-1 rounded-md border border-slate-800 text-xs overflow-x-auto">
            {['ALL', 'detected', 'investigating', 'awaiting_approval', 'remediating', 'resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-slate-900/80 p-1 rounded-md border border-slate-800 text-xs">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  severityFilter === sev
                    ? 'bg-slate-800 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading incidents from database...</div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-12 text-center rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-2">
            <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-300 font-medium">No matching incidents found</p>
            <p className="text-xs text-slate-500">Run a telemetry scan or adjust your filter parameters.</p>
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-cyan-400">
                    INC-{inc.id}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      inc.severity === 'CRITICAL'
                        ? 'text-rose-400 bg-rose-950/60 border-rose-800/60 font-semibold'
                        : inc.severity === 'HIGH'
                        ? 'text-amber-400 bg-amber-950/60 border-amber-800/60'
                        : 'text-slate-400 bg-slate-900 border-slate-800'
                    }`}
                  >
                    {inc.severity}
                  </span>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getStatusBadge(inc.status)}`}>
                    {inc.status}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {inc.service_name || `service-${inc.service_id}`}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {inc.title.replace('[SYNTHETIC] ', '')}
                </h3>
              </div>

              {/* Action Toolbar */}
              <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-mono text-[11px] text-slate-500">
                  Service ID: {inc.service_id}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onSelectIncident(inc.id);
                      onNavigate('evidence');
                    }}
                    className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 transition flex items-center gap-1.5 font-medium"
                  >
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Evidence</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectIncident(inc.id);
                      onNavigate('remediation');
                    }}
                    className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-300 transition flex items-center gap-1.5 font-medium"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    <span>Actions</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectIncident(inc.id);
                      onNavigate('investigation');
                    }}
                    className="px-3 py-1 rounded bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-800/70 text-cyan-300 transition flex items-center gap-1 font-medium"
                  >
                    <span>Investigate</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Synthetic Incident Drill Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Trigger Synthetic Incident Drill
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Incident Title / Failure Mode
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., PostgreSQL Connection Pool Starvation"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Service</label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    {services.map(svc => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Severity Priority</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="CRITICAL">CRITICAL (P0)</option>
                    <option value="HIGH">HIGH (P1)</option>
                    <option value="MEDIUM">MEDIUM (P2)</option>
                    <option value="LOW">LOW (P3)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded bg-amber-950/20 border border-amber-800/30 text-[11px] text-amber-300/90 leading-relaxed">
                Will invoke <code className="font-mono text-cyan-300">POST /incidents</code> with status <span className="font-mono text-amber-300 font-semibold">detected</span> and log initial audit timeline transition.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
