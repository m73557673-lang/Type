import React, { useState } from 'react';
import {
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Server,
  Layers,
  Database,
  ArrowRight,
  Sparkles,
  X
} from 'lucide-react';
import { SimulationStatus, SimulationEvent } from '../types';

interface SimulationControllerProps {
  status: SimulationStatus | null;
  events: SimulationEvent[];
  onStartScenario: (scenario: 'incident' | 'healthy') => Promise<void>;
  onResetSimulation: () => Promise<void>;
  isProcessing: boolean;
}

export const SimulationController: React.FC<SimulationControllerProps> = ({
  status,
  events,
  onStartScenario,
  onResetSimulation,
  isProcessing
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);

  const isIncident = status?.state === 'INCIDENT';

  const handleConfirmReset = async () => {
    setShowResetConfirm(false);
    await onResetSimulation();
  };

  return (
    <div className="p-4 rounded-lg bg-[#0c1220] border border-cyan-900/40 space-y-3 shadow-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* State description */}
        <div className="flex items-start sm:items-center gap-3">
          <div className={`p-2 rounded-lg border ${
            isIncident
              ? 'bg-rose-950/50 border-rose-800/60 text-rose-400 animate-pulse'
              : 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
          }`}>
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-100 uppercase tracking-wide">
                Simulation Engine:
              </span>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold border ${
                isIncident
                  ? 'bg-rose-950/60 border-rose-800/60 text-rose-300'
                  : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              }`}>
                {status?.state || 'HEALTHY'} STATE
              </span>
              <span className="text-[10px] font-mono uppercase bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded">
                [SYNTHETIC]
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {status?.description || 'Synthetic E-Commerce Checkout Environment (API Gateway, Checkout Service, Order Service, Database Service).'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setShowTimelineModal(true)}
            className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-cyan-300 hover:text-cyan-200 transition flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Event Timeline ({events.length})</span>
          </button>

          {!isIncident ? (
            <button
              onClick={() => onStartScenario('incident')}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-slate-950 text-xs font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isProcessing ? 'Triggering...' : 'Trigger Incident Drill (DB_POOL=10)'}</span>
            </button>
          ) : (
            <button
              onClick={() => onStartScenario('healthy')}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Restoring...' : 'Restore Healthy Baseline (DB_POOL=50)'}</span>
            </button>
          )}

          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={isProcessing}
            title="Reset simulation to healthy baseline"
            className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-300 text-xs transition flex items-center gap-1 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Real-time telemetry status ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800/60 text-center font-mono text-xs">
        <div className="p-2 rounded bg-slate-950/60 border border-slate-900">
          <div className="text-[10px] text-slate-500 uppercase">DB Pool Size</div>
          <div className={`text-xs font-semibold mt-0.5 ${isIncident ? 'text-rose-400' : 'text-emerald-400'}`}>
            {status?.db_pool_size ?? 50} connections
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/60 border border-slate-900">
          <div className="text-[10px] text-slate-500 uppercase">Pool Saturation</div>
          <div className={`text-xs font-semibold mt-0.5 ${isIncident ? 'text-rose-400' : 'text-slate-300'}`}>
            {status?.db_pool_utilization_pct?.toFixed(0) ?? 36}%
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/60 border border-slate-900">
          <div className="text-[10px] text-slate-500 uppercase">Traffic Volume</div>
          <div className={`text-xs font-semibold mt-0.5 ${isIncident ? 'text-amber-400' : 'text-slate-300'}`}>
            {status?.traffic_rps ?? 250} req/s
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/60 border border-slate-900">
          <div className="text-[10px] text-slate-500 uppercase">p95 Latency</div>
          <div className={`text-xs font-semibold mt-0.5 ${isIncident ? 'text-rose-400' : 'text-slate-300'}`}>
            {status?.latency_p95_ms ?? 45}ms
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/60 border border-slate-900 col-span-2 sm:col-span-1">
          <div className="text-[10px] text-slate-500 uppercase">Error Rate</div>
          <div className={`text-xs font-semibold mt-0.5 ${isIncident ? 'text-rose-400' : 'text-emerald-400'}`}>
            {status?.error_rate_pct ?? 0.02}%
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Confirm Simulation Reset
                </h3>
              </div>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Reset the synthetic e-commerce checkout simulation back to healthy baseline?
              This will restore <span className="font-mono text-cyan-300">DB_POOL_SIZE=50</span>, traffic to 250 RPS, latency to 45ms, and resolve active incidents.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition shadow-sm"
              >
                Yes, Reset Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Timeline Modal */}
      {showTimelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Simulation Event Timeline (GET /simulation/events)
                </h3>
              </div>
              <button
                onClick={() => setShowTimelineModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {events.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No events recorded.</div>
              ) : (
                events.map((ev, idx) => (
                  <div key={idx} className="p-3 rounded bg-slate-950/70 border border-slate-900 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          ev.type === 'DEPLOYMENT'
                            ? 'bg-purple-950/60 text-purple-300 border border-purple-800/60'
                            : ev.type === 'INCIDENT'
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                            : 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                        }`}>
                          {ev.type}
                        </span>
                        <span className="font-semibold text-slate-200">{ev.title}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-cyan-200/90 leading-relaxed pl-1">
                      {ev.detail}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setShowTimelineModal(false)}
                className="px-4 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium"
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
