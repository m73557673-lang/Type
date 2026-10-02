import React from 'react';
import {
  LayoutDashboard,
  AlertTriangle,
  SearchCode,
  Layers,
  Sparkles,
  Server,
  BookOpen,
  Wrench,
  FileText,
  Settings,
  ShieldCheck
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'incidents'
  | 'investigation'
  | 'evidence'
  | 'root-cause'
  | 'services'
  | 'knowledge-base'
  | 'remediation'
  | 'postmortems'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  activeIncidentsCount: number;
  pendingRemediationsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  activeIncidentsCount,
  pendingRemediationsCount
}) => {
  const navItems = [
    {
      id: 'overview' as NavTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'incidents' as NavTab,
      label: 'Incidents',
      icon: AlertTriangle,
      badge: activeIncidentsCount > 0 ? activeIncidentsCount : null,
      badgeColor: 'text-rose-400 bg-rose-950/60 border-rose-800/60',
    },
    {
      id: 'investigation' as NavTab,
      label: 'Investigation',
      icon: SearchCode,
      badge: null,
    },
    {
      id: 'evidence' as NavTab,
      label: 'Evidence Chain',
      icon: Layers,
      badge: null,
    },
    {
      id: 'root-cause' as NavTab,
      label: 'Root Cause',
      icon: Sparkles,
      badge: null,
    },
    {
      id: 'services' as NavTab,
      label: 'Services & Metrics',
      icon: Server,
      badge: null,
    },
    {
      id: 'knowledge-base' as NavTab,
      label: 'Knowledge Base',
      icon: BookOpen,
      badge: null,
    },
    {
      id: 'remediation' as NavTab,
      label: 'Remediation',
      icon: Wrench,
      badge: pendingRemediationsCount > 0 ? `${pendingRemediationsCount} req.` : null,
      badgeColor: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
    },
    {
      id: 'postmortems' as NavTab,
      label: 'Postmortems',
      icon: FileText,
      badge: null,
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#080c14] flex flex-col justify-between shrink-0 h-[calc(100vh-4rem)]">
      <div className="p-3">
        <div className="px-3 py-2 text-[11px] font-mono tracking-wider uppercase text-slate-500">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400 font-semibold pl-2.5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      item.badgeColor || 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Safety Guardrail Footer Notice */}
      <div className="p-4 border-t border-slate-800/60">
        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Human-Gated Safety</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Remediation is restricted to sandbox simulation with verified operator approval.
          </p>
        </div>
      </div>
    </aside>
  );
};
