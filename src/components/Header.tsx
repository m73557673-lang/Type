import React from 'react';
import { ShieldAlert, Activity, Database, Sparkles, RefreshCw } from 'lucide-react';
import { HealthCheck } from '../types';

interface HeaderProps {
  health: HealthCheck | null;
  activeCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ health, activeCount, onRefresh, isRefreshing }) => {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#080c14]/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Identity */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-cyan-950/70 border border-cyan-800/60 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <ShieldAlert className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-slate-100 text-sm tracking-tight">
              Autonomous AI-Powered Incident Commander
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
              Synthetic Simulation
            </span>
          </div>
          <p className="text-xs text-slate-400">
            SRE & DevOps Operational Intelligence Platform
          </p>
        </div>
      </div>

      {/* Status Indicators & Controls */}
      <div className="flex items-center gap-4">
        {/* Backend & DB Health Indicator */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/70 px-3 py-1.5 rounded-md">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${health?.status === 'UP' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-mono text-slate-300">
              {health ? `FastAPI: ${health.status}` : 'Connecting...'}
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-slate-300">SQLite</span>
          </div>
        </div>

        {/* Active Incidents Badge */}
        <div className="flex items-center gap-2 text-xs bg-rose-950/30 border border-rose-900/40 text-rose-300 px-3 py-1.5 rounded-md">
          <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          <span className="font-medium">{activeCount} Active Incidents</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh operational telemetry"
          className="h-8 w-8 rounded-md bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-800/60 flex items-center justify-center transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
