import React, { useState } from 'react';
import {
  Settings,
  Database,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Server,
  FileCode,
  Info,
  Check
} from 'lucide-react';
import { HealthCheck } from '../types';

interface SettingsViewProps {
  health: HealthCheck | null;
  onResetData: () => Promise<void>;
  isLoading: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  health,
  onResetData,
  isLoading
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleReset = async () => {
    if (!confirm('Reset all synthetic incidents, evidence logs, and metrics to default seed state?')) {
      return;
    }
    setResetting(true);
    setResetMessage(null);
    try {
      await onResetData();
      setResetMessage('Synthetic database state successfully reset to initial seed.');
      setTimeout(() => setResetMessage(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Platform Configuration & SRE Guardrails
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            System diagnostics, safety compliance rules, and synthetic database initialization controls.
          </p>
        </div>
      </div>

      {/* Backend & Database Health Diagnostic */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Backend & Engine Diagnostics
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 text-[11px]">API Engine Status:</span>
            <div className="text-slate-200 font-semibold flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${health?.status === 'UP' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>FastAPI / REST API: {health?.status || 'Active'}</span>
            </div>
            <span className="text-slate-500 text-[10px]">Version: {health?.version || '1.0.0'}</span>
          </div>

          <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 text-[11px]">Database Engine:</span>
            <div className="text-slate-200 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>{health?.database || 'SQLite (SQLAlchemy Engine)'}</span>
            </div>
            <span className="text-slate-500 text-[10px]">Isolated In-Memory & File Store</span>
          </div>

          <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 text-[11px]">Environment Target:</span>
            <div className="text-slate-200 font-semibold">
              {health?.environment || 'development'}
            </div>
            <span className="text-slate-500 text-[10px]">Port: 3000 (Vite) / 8000 (FastAPI)</span>
          </div>

          <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 text-[11px]">Active Incident Count:</span>
            <div className="text-slate-200 font-semibold">
              {health?.active_incidents ?? 3} Active Incidents
            </div>
            <span className="text-slate-500 text-[10px]">Synthetic Simulation Mode Enabled</span>
          </div>
        </div>
      </div>

      {/* SRE Safety Rules & Compliance */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Mandatory Safety Policies
        </h3>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded bg-slate-900/50 border border-slate-800 flex items-start justify-between gap-3">
            <div>
              <span className="font-semibold text-slate-200">
                1. Human-in-the-Loop Remediation Approval Gating
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                Prevents unreviewed commands from executing. Requires explicit human operator authorization phrase ('APPROVE REMEDIATION') before any mitigation can be simulated.
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 shrink-0">
              Enforced
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/50 border border-slate-800 flex items-start justify-between gap-3">
            <div>
              <span className="font-semibold text-slate-200">
                2. Sandbox Simulation Isolation Guardrail
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                Remediation scripts execute strictly within an isolated mock sandbox. No live production infrastructure, cloud clusters, or real databases are connected or mutated.
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 shrink-0">
              Enforced
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/50 border border-slate-800 flex items-start justify-between gap-3">
            <div>
              <span className="font-semibold text-slate-200">
                3. Mandatory Synthetic Telemetry Labeling
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                All simulated incidents, metrics, and error rates must be clearly identified as synthetic data to prevent misrepresentation as live production telemetry.
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 shrink-0">
              Enforced
            </span>
          </div>
        </div>
      </div>

      {/* Database State Management */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          Reset Synthetic Scenario Data
        </h3>

        <p className="text-xs text-slate-400 leading-relaxed">
          Restore the initial SRE incident scenarios, reset all resolved incidents back to their unmitigated state, and repopulate synthetic PgBouncer saturation telemetry for drills.
        </p>

        {resetMessage && (
          <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{resetMessage}</span>
          </div>
        )}

        <button
          onClick={handleReset}
          disabled={resetting}
          className="px-4 py-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-2 disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetting Database...' : 'Reset Synthetic Dataset to Initial Seed'}</span>
        </button>
      </div>
    </div>
  );
};
