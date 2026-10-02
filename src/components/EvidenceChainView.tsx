/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Layers,
  AlertCircle,
  FileCode,
  TrendingDown,
  GitCommit,
  Clock,
  BookOpen,
  History,
  ShieldAlert,
  Search,
  Copy,
  Check,
  ExternalLink,
  X,
  Filter,
  ArrowRight,
  Database,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';
import { Incident, Evidence } from '../types';

interface EvidenceChainViewProps {
  incidents: Incident[];
  selectedIncidentId: number;
  onSelectIncident: (id: number) => void;
  evidence: Evidence[];
  onNavigate?: (tab: any) => void;
  isLoading: boolean;
}

export const EvidenceChainView: React.FC<EvidenceChainViewProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  evidence,
  onNavigate,
  isLoading
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [selectedRawEvidence, setSelectedRawEvidence] = useState<Evidence | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedRaw, setCopiedRaw] = useState<boolean>(false);

  const currentIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  const filteredEvidence = evidence.filter(ev => {
    if (filterType !== 'ALL' && ev.source_type?.toUpperCase() !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = ev.title?.toLowerCase().includes(q);
      const matchExcerpt = ev.excerpt_or_value?.toLowerCase().includes(q);
      const matchRef = ev.source_ref?.toLowerCase().includes(q);
      const matchStable = ev.stable_id?.toLowerCase().includes(q);
      const matchDetail = ev.detail?.toLowerCase().includes(q);
      if (!matchTitle && !matchExcerpt && !matchRef && !matchStable && !matchDetail) {
        return false;
      }
    }
    return true;
  });

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyRaw = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const getTypeIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'ALERT':
        return <AlertCircle className="w-4 h-4 text-rose-400" />;
      case 'LOG':
        return <FileCode className="w-4 h-4 text-amber-400" />;
      case 'METRIC':
        return <TrendingDown className="w-4 h-4 text-cyan-400" />;
      case 'DEPLOYMENT':
        return <GitCommit className="w-4 h-4 text-purple-400" />;
      case 'RUNBOOK':
        return <BookOpen className="w-4 h-4 text-indigo-400" />;
      case 'HISTORICAL_INCIDENT':
        return <History className="w-4 h-4 text-emerald-400" />;
      case 'HYPOTHESIS':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const getTypeBadgeStyle = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'DEPLOYMENT':
        return 'text-purple-300 bg-purple-950/60 border-purple-800/60';
      case 'LOG':
        return 'text-amber-300 bg-amber-950/60 border-amber-800/60';
      case 'METRIC':
        return 'text-cyan-300 bg-cyan-950/60 border-cyan-800/60';
      case 'RUNBOOK':
        return 'text-indigo-300 bg-indigo-950/60 border-indigo-800/60';
      case 'HISTORICAL_INCIDENT':
        return 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60';
      case 'HYPOTHESIS':
        return 'text-emerald-300 bg-emerald-950/80 border-emerald-500/60';
      case 'ALERT':
        return 'text-rose-300 bg-rose-950/60 border-rose-800/60';
      default:
        return 'text-slate-300 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Target Incident Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Chronological Evidence Chain
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real persisted telemetry signals, configuration diffs, logs, runbooks, and historical incidents tied to INC-{currentIncident?.id}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Incident:</label>
          <select
            value={currentIncident?.id}
            onChange={(e) => onSelectIncident(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                INC-{inc.id} ({inc.severity}) [{inc.status}] - {inc.service_name || `Service ${inc.service_id}`}
              </option>
            ))}
          </select>

          {onNavigate && (
            <button
              onClick={() => onNavigate('root-cause')}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-medium transition flex items-center gap-1 shrink-0"
            >
              <span>Root Cause</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs, Search & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'All Evidence' },
            { id: 'DEPLOYMENT', label: 'Deployments' },
            { id: 'LOG', label: 'Error Logs' },
            { id: 'METRIC', label: 'Metrics' },
            { id: 'RUNBOOK', label: 'Runbooks' },
            { id: 'HISTORICAL_INCIDENT', label: 'Historical' },
            { id: 'HYPOTHESIS', label: 'Hypotheses' },
            { id: 'ALERT', label: 'Alerts' }
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setFilterType(type.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
                filterType === type.id
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-800 rounded bg-slate-900 p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 text-xs rounded transition ${
                viewMode === 'timeline' ? 'bg-cyan-950 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 text-xs rounded transition ${
                viewMode === 'grid' ? 'bg-cyan-950 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grid
            </button>
          </div>
        </div>
      </div>

      {/* Evidence Content Area */}
      {isLoading ? (
        <div className="p-16 text-center text-xs font-mono text-slate-400">
          Loading correlated evidence from database...
        </div>
      ) : evidence.length === 0 ? (
        /* Empty state: No evidence records exist for this incident */
        <div className="p-16 text-center rounded-lg bg-[#0c1220] border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-200">
              No Evidence Chain Stored for INC-{currentIncident?.id}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This incident currently has no persisted evidence signals in the database. Run an investigation to automatically correlate error logs, telemetry metric spikes, configuration commits, and runbook excerpts.
            </p>
          </div>
          {onNavigate && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => onNavigate('investigation')}
                className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch AI Investigation</span>
              </button>
              <button
                onClick={() => onNavigate('overview')}
                className="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition"
              >
                <span>Trigger Incident Simulation</span>
              </button>
            </div>
          )}
        </div>
      ) : filteredEvidence.length === 0 ? (
        /* Empty state: Filters matched 0 records */
        <div className="p-16 text-center rounded-lg bg-[#0c1220] border border-slate-800 space-y-3">
          <Info className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm text-slate-300 font-medium">
            No {filterType !== 'ALL' ? filterType : ''} evidence records match your criteria
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No evidence contains the term "${searchQuery}". Clear your search query or reset the type filter.`
              : `There are currently no items under category "${filterType}".`}
          </p>
          <button
            onClick={() => { setFilterType('ALL'); setSearchQuery(''); }}
            className="px-3.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:text-white transition"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Chronological Timeline View */
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {filteredEvidence.map((ev) => (
            <div key={ev.id} className="relative group">
              {/* Dot on timeline */}
              <div className="absolute -left-6 sm:-left-8 top-3.5 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-slate-950 group-hover:scale-125 transition" />

              <div className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/90 hover:border-slate-700 transition space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-2 border-b border-slate-900">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-cyan-400">
                        {ev.stable_id || `EVD-${ev.id}`}
                      </span>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold border ${getTypeBadgeStyle(ev.source_type)}`}>
                        {ev.source_type}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {ev.source_ref}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-100">
                      {ev.title || `Correlated ${ev.source_type} Signal`}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {ev.timestamp && (
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                      Relevance: {(ev.relevance * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Excerpt or Value Payload */}
                <div className="rounded bg-slate-950/80 border border-slate-900 p-3 font-mono text-[11px] text-cyan-200/95 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    <span>Signal Excerpt / Value:</span>
                    <button
                      onClick={() => handleCopy(ev.id, ev.excerpt_or_value || ev.detail || '')}
                      className="hover:text-slate-200 flex items-center gap-1 transition text-slate-400 text-[10px]"
                    >
                      {copiedId === ev.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Excerpt</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    {ev.excerpt_or_value || ev.detail}
                  </pre>
                </div>

                {/* Detail & Hypothesis linkages */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                  <p className="text-[11px] text-slate-400">
                    {ev.detail}
                  </p>

                  <div className="flex items-center gap-2 shrink-0">
                    {ev.supporting_hypotheses?.map((h) => (
                      <span key={h} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/40 text-emerald-300">
                        Supports {h}
                      </span>
                    ))}
                    {ev.contradicting_hypotheses?.map((h) => (
                      <span key={h} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-950/50 border border-rose-800/40 text-rose-300">
                        Contradicts {h}
                      </span>
                    ))}
                    <button
                      onClick={() => setSelectedRawEvidence(ev)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 ml-1"
                    >
                      <Database className="w-3 h-3" />
                      <span>Inspect Raw DB Record</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEvidence.map((ev) => (
            <div
              key={ev.id}
              className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/90 hover:border-slate-700 transition space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-400">
                      {ev.stable_id || `EVD-${ev.id}`}
                    </span>
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold border ${getTypeBadgeStyle(ev.source_type)}`}>
                      {ev.source_type}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                    {(ev.relevance * 100).toFixed(0)}%
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-slate-100">
                  {ev.title || `Correlated ${ev.source_type} Signal`}
                </h4>

                <div className="text-[10px] font-mono text-slate-400">
                  Ref: {ev.source_ref} {ev.timestamp && `· ${new Date(ev.timestamp).toLocaleTimeString()}`}
                </div>

                <div className="rounded bg-slate-950/80 border border-slate-900 p-2.5 font-mono text-[11px] text-cyan-200/90 line-clamp-4">
                  {ev.excerpt_or_value || ev.detail}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {ev.supporting_hypotheses?.map((h) => (
                    <span key={h} className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-950/50 text-emerald-300">
                      {h}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setSelectedRawEvidence(ev)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                >
                  <Database className="w-3 h-3" />
                  <span>Inspect DB Record</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw Stored Database Record Modal */}
      {selectedRawEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl rounded-lg bg-[#0c1220] border border-cyan-500/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-xs text-cyan-400 font-semibold">
                    {selectedRawEvidence.stable_id}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs font-mono text-slate-400">
                    Table Reference: {selectedRawEvidence.source_ref}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                  Original Stored Database Record
                </h3>
              </div>

              <button
                onClick={() => setSelectedRawEvidence(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Structured Metadata Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Source Type</div>
                  <div className="text-cyan-300 font-semibold">{selectedRawEvidence.source_type}</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Entity Ref</div>
                  <div className="text-slate-200 truncate">{selectedRawEvidence.source_ref}</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Relevance</div>
                  <div className="text-emerald-400 font-semibold">{(selectedRawEvidence.relevance * 100).toFixed(0)}% Match</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Timestamp</div>
                  <div className="text-slate-300 truncate">
                    {selectedRawEvidence.timestamp ? new Date(selectedRawEvidence.timestamp).toLocaleTimeString() : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Extracted Excerpt / Telemetry value */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[10px] font-mono text-slate-500 uppercase">Extracted Excerpt / Value:</div>
                <p className="font-mono text-[11px] text-cyan-200/90 leading-relaxed whitespace-pre-wrap">
                  {selectedRawEvidence.excerpt_or_value || selectedRawEvidence.detail}
                </p>
              </div>

              {/* Raw JSON */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 font-mono">
                  <span>Raw Database Stored JSON:</span>
                  <button
                    onClick={() => handleCopyRaw(selectedRawEvidence.raw_record || selectedRawEvidence)}
                    className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition flex items-center gap-1"
                  >
                    {copiedRaw ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300 max-h-64 overflow-y-auto leading-relaxed">
                  {JSON.stringify(selectedRawEvidence.raw_record || selectedRawEvidence, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {onNavigate && ['RUNBOOK', 'HISTORICAL_INCIDENT'].includes(selectedRawEvidence.source_type) && (
                  <button
                    onClick={() => {
                      setSelectedRawEvidence(null);
                      onNavigate('knowledge-base');
                    }}
                    className="px-3 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 text-xs font-medium transition flex items-center gap-1"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>Open in Knowledge Base</span>
                  </button>
                )}
                {onNavigate && selectedRawEvidence.source_type === 'HYPOTHESIS' && (
                  <button
                    onClick={() => {
                      setSelectedRawEvidence(null);
                      onNavigate('root-cause');
                    }}
                    className="px-3 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-200 text-xs font-medium transition flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Open in Root Cause Page</span>
                  </button>
                )}
                {onNavigate && ['METRIC', 'DEPLOYMENT'].includes(selectedRawEvidence.source_type) && (
                  <button
                    onClick={() => {
                      setSelectedRawEvidence(null);
                      onNavigate('services');
                    }}
                    className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1"
                  >
                    <TrendingDown className="w-3 h-3" />
                    <span>View in Services & Metrics</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedRawEvidence(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
