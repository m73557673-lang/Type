import React, { useState, useEffect } from 'react';
import {
  Wrench,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Terminal,
  FileCheck,
  X,
  RotateCcw,
  AlertTriangle,
  Activity,
  ArrowRight,
  Clock,
  UserCheck,
  History,
  Check,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';
import { Action, Incident, Recommendation, AuditLogEntry } from '../types';
import { api } from '../api';

interface RemediationViewProps {
  actions: Action[];
  incidents: Incident[];
  selectedIncidentId?: number | null;
  onSelectIncident?: (id: number) => void;
  recommendation?: Recommendation | null;
  onApprove: (actionId: number, approvedBy: string, phrase: string) => Promise<void>;
  onSimulate: (actionId: number) => Promise<void>;
  onCancel?: (incidentId: number, reason?: string) => Promise<void>;
  onReset?: () => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

export const RemediationView: React.FC<RemediationViewProps> = ({
  actions,
  incidents,
  selectedIncidentId,
  onSelectIncident,
  recommendation: propRecommendation,
  onApprove,
  onSimulate,
  onCancel,
  onReset,
  onRefresh,
  isLoading
}) => {
  const [activeIncidentId, setActiveIncidentId] = useState<number>(selectedIncidentId || (incidents[0]?.id ?? 1));
  const [localRecommendation, setLocalRecommendation] = useState<Recommendation | null>(propRecommendation || null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [activeActionForApproval, setActiveActionForApproval] = useState<Action | null>(null);
  const [operatorName, setOperatorName] = useState('Principal SRE On-Call (Alice Chen)');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Operator opted for safe reset');

  const REQUIRED_PHRASE = 'APPROVE REMEDIATION';

  // Keep activeIncidentId synchronized
  useEffect(() => {
    if (selectedIncidentId) {
      setActiveIncidentId(selectedIncidentId);
    }
  }, [selectedIncidentId]);

  // Fetch recommendation and audit logs for active incident
  const loadIncidentData = async (incId: number) => {
    try {
      const [rec, logs] = await Promise.all([
        api.getIncidentRecommendation(incId).catch(() => null),
        api.getAuditLogs(incId).catch(() => [])
      ]);
      setLocalRecommendation(rec);
      setAuditLogs(logs);
    } catch (e) {
      console.error('Error fetching remediation data:', e);
    }
  };

  useEffect(() => {
    if (activeIncidentId) {
      loadIncidentData(activeIncidentId);
    }
  }, [activeIncidentId]);

  useEffect(() => {
    if (propRecommendation) {
      setLocalRecommendation(propRecommendation);
    }
  }, [propRecommendation]);

  const activeIncident = incidents.find(i => i.id === activeIncidentId) || incidents[0];
  const activeAction = actions.find(a => a.incident_id === activeIncidentId) || actions[0];

  const handleIncidentChange = (id: number) => {
    setActiveIncidentId(id);
    if (onSelectIncident) {
      onSelectIncident(id);
    }
  };

  const handleOpenApproval = (action?: Action) => {
    setActiveActionForApproval(action || activeAction || {
      id: 1,
      incident_id: activeIncidentId,
      status: 'PENDING',
      result: null,
      approved_by: null
    });
    setConfirmationInput('');
    setApprovalError(null);
  };

  const handleConfirmApproval = async () => {
    if (!activeActionForApproval && !activeIncidentId) return;
    if (confirmationInput.trim().toUpperCase() !== REQUIRED_PHRASE) {
      setApprovalError(`Confirmation phrase must be exactly: ${REQUIRED_PHRASE}`);
      return;
    }
    if (!operatorName.trim()) {
      setApprovalError("Safety guardrail: Operator identity 'approved_by' cannot be blank.");
      return;
    }

    setIsProcessing(true);
    setApprovalError(null);
    try {
      // Use direct incident approval endpoint POST /incidents/{id}/approve
      await api.approveIncidentRemediation(activeIncidentId, operatorName.trim(), confirmationInput.trim());
      setActiveActionForApproval(null);
      await loadIncidentData(activeIncidentId);
      onRefresh();
    } catch (err: any) {
      setApprovalError(err.message || 'Failed to approve remediation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulateExecution = async () => {
    setIsProcessing(true);
    try {
      // Use direct simulation endpoint POST /incidents/{id}/simulate-fix
      await api.simulateFixIncident(activeIncidentId);
      await loadIncidentData(activeIncidentId);
      onRefresh();
    } catch (err: any) {
      alert(`Simulation blocked by security guardrails: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelRemediation = async () => {
    setIsProcessing(true);
    try {
      if (onCancel) {
        await onCancel(activeIncidentId, cancelReason);
      } else {
        await api.cancelIncidentRemediation(activeIncidentId, operatorName, cancelReason);
      }
      setCancelModalOpen(false);
      await loadIncidentData(activeIncidentId);
      onRefresh();
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetSandbox = async () => {
    if (confirm("Reset synthetic simulation state to baseline healthy condition?")) {
      setIsProcessing(true);
      try {
        if (onReset) {
          await onReset();
        } else {
          await api.resetSimulation();
        }
        await loadIncidentData(activeIncidentId);
        onRefresh();
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const currentApprovalStatus = localRecommendation?.approval_status ||
    (activeAction?.status === 'SIMULATED' ? 'EXECUTED' : activeAction?.status as any) ||
    'PENDING';

  const isPending = currentApprovalStatus === 'PENDING' || activeAction?.status === 'PENDING';
  const isApproved = currentApprovalStatus === 'APPROVED' || activeAction?.status === 'APPROVED';
  const isExecuted = currentApprovalStatus === 'EXECUTED' || activeAction?.status === 'SIMULATED' || activeIncident?.status === 'resolved';

  return (
    <div className="space-y-6">
      {/* Strict SRE Safety Policy Banner */}
      <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-amber-200">
              Mandatory SRE Safety Guardrail: Human Approval Gating Enforced
            </span>
            <p className="text-amber-300/80 leading-relaxed">
              Investigation is read-only by default. Real shell commands, cloud APIs, Kubernetes operations, and production connections are permanently disabled. Actions require explicit operator authorization (<code className="bg-amber-900/40 px-1 py-0.5 rounded text-amber-200">APPROVE REMEDIATION</code>) before safe sandbox simulation.
            </p>
          </div>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1 text-[11px] font-mono text-amber-300/70 shrink-0">
          <span className="px-2 py-0.5 rounded bg-amber-900/30 border border-amber-800/50">Allowlist Enforced</span>
          <span>Simulation Sandbox Only</span>
        </div>
      </div>

      {/* Incident Switcher Bar */}
      {incidents.length > 1 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0c1220] border border-slate-800 overflow-x-auto text-xs">
          <span className="text-slate-400 font-medium px-2">Target Incident:</span>
          {incidents.map((inc) => (
            <button
              key={inc.id}
              onClick={() => handleIncidentChange(inc.id)}
              className={`px-3 py-1.5 rounded transition flex items-center gap-2 font-mono text-xs ${
                inc.id === activeIncidentId
                  ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-semibold'
                  : 'bg-slate-900/50 border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>#{inc.id}</span>
              <span className="text-[10px] opacity-75">({inc.status})</span>
            </button>
          ))}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Remediation Recommendation & Safe Simulation Console
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Incident #{activeIncidentId}: Review mitigation rationale, verify preconditions, authorize human approval, and execute synthetic sandbox validation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetSandbox}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-xs font-medium transition flex items-center gap-1.5"
            title="Safe reset path: Revert simulation state to baseline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Safe Reset</span>
          </button>
          <span className="text-[11px] font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-1 rounded">
            Sandbox Mode: Synthetic Telemetry
          </span>
        </div>
      </div>

      {/* Primary Remediation Recommendation Card */}
      <div className="p-6 rounded-lg bg-[#0c1220] border border-slate-800/90 space-y-6">
        {/* Recommendation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 text-cyan-400">
                REC-{localRecommendation?.id ?? 1}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-xs text-slate-400 font-mono">
                Target Incident #{localRecommendation?.incident_id ?? activeIncidentId}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-xs font-semibold text-slate-300">
                {activeIncident?.service_name || 'Checkout Service'}
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span>{localRecommendation?.proposed_action || "Restore simulated DB_POOL_SIZE from 10 to 50 and execute rolling restart"}</span>
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Risk Badge */}
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Risk: {localRecommendation?.risk_level || 'LOW'}
            </span>

            {/* Approval Status Badge */}
            <span
              className={`text-xs font-mono px-3 py-1 rounded flex items-center gap-1.5 ${
                isExecuted
                  ? 'text-emerald-400 bg-emerald-950/50 border border-emerald-800/50'
                  : isApproved
                  ? 'text-cyan-400 bg-cyan-950/50 border border-cyan-800/50'
                  : 'text-amber-400 bg-amber-950/50 border border-amber-800/50 animate-pulse'
              }`}
            >
              {isExecuted && <CheckCircle2 className="w-3.5 h-3.5" />}
              {isApproved && <ShieldCheck className="w-3.5 h-3.5" />}
              {isPending && <ShieldAlert className="w-3.5 h-3.5" />}
              Approval Status: {currentApprovalStatus}
            </span>
          </div>
        </div>

        {/* 8 Required Fields Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          {/* 1. Proposed Action & Command Preview */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              1. Proposed Action & Allowlisted Command
            </span>
            <p className="text-slate-200 leading-relaxed">
              {localRecommendation?.proposed_action || "Restore simulated DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods"}
            </p>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300 select-all overflow-x-auto">
              {localRecommendation?.action_command || "kubectl set env deployment/checkout-service DB_POOL_SIZE=50 && kubectl rollout restart deployment/checkout-service [SIMULATION ONLY]"}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Allowlist Tag: <code className="text-slate-300">{localRecommendation?.allowlisted_action_type || 'RESTORE_DB_POOL_SIZE'}</code> (Verified in safe simulation catalog)</span>
            </div>
          </div>

          {/* 2. Reason and Supporting Evidence */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-amber-400" />
              2. Reason & Supporting Evidence
            </span>
            <p className="text-slate-300 leading-relaxed">
              {localRecommendation?.reason_and_supporting_evidence || "Deployment v2.4.1-rc1 reduced DB_POOL_SIZE from 50 to 10 right before an 850 RPS ingress traffic surge, causing 100% pool saturation and thread starvation."}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded bg-purple-950/40 border border-purple-800/40 text-[10px] font-mono text-purple-300">
                EVD-DEP-2: Pool Config Diff
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-[10px] font-mono text-amber-300">
                EVD-LOG-104: HikariPool Timeouts
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/40 text-[10px] font-mono text-rose-300">
                EVD-METRIC-POOL: 100% Saturation
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-[10px] font-mono text-cyan-300">
                EVD-RUNBOOK-002: Minimum Sizing &gt;= 50
              </span>
            </div>
          </div>

          {/* 3. Expected Impact */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              3. Expected Operational Impact
            </span>
            <p className="text-slate-200 leading-relaxed">
              {localRecommendation?.expected_impact || "Restores concurrent JDBC connection capacity to 50 slots (+400%). Eliminates HikariPool wait queue starvation, dropping p95 latency from 3450ms to ~42ms and reducing HTTP 504 errors from 18.5% to <0.02%."}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">Capacity</span>
                <span className="text-emerald-400 font-semibold">10 &rarr; 50 (+400%)</span>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">p95 Latency</span>
                <span className="text-emerald-400 font-semibold">3450ms &rarr; ~42ms</span>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">5xx Errors</span>
                <span className="text-emerald-400 font-semibold">18.5% &rarr; &lt;0.02%</span>
              </div>
            </div>
          </div>

          {/* 4. Preconditions & Rollback Plan */}
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-3">
            <div>
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1.5">
                <Check className="w-3.5 h-3.5 text-cyan-400" />
                4. Safety Preconditions Checklist
              </span>
              <ul className="space-y-1 text-slate-300">
                {(localRecommendation?.preconditions || [
                  "Checkout Service is in DEGRADED or OUTAGE state",
                  "Target PostgreSQL instance has >= 100 available connection slots",
                  "Action is verified against the server remediation allowlist",
                  "Operator identity authenticated in prototype"
                ]).map((pre, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{pre}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-800/60">
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1">
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                5. Rollback Plan
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {localRecommendation?.rollback_plan || "If database container memory exceeds 80% or connection contention shifts to database CPU thrashing, revert DB_POOL_SIZE to 25 and horizontally scale pod replicas from 3 to 6."}
              </p>
            </div>
          </div>
        </div>

        {/* Human Authorization and Execution Control Bar */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-semibold text-slate-200 text-xs flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              SRE Operator Human Authorization &amp; Gating Status
            </span>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>Authorizing Operator:</span>
              <span className="font-semibold text-slate-200">
                {activeAction?.approved_by || (isApproved ? operatorName : 'Unapproved')}
              </span>
              {activeAction?.approved_at && (
                <span className="text-slate-500 font-mono text-[11px]">
                  · Approved at {new Date(activeAction.approved_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Cancel / Safe Reset Path */}
            {(isPending || isApproved) && (
              <button
                onClick={() => setCancelModalOpen(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs font-medium transition"
              >
                Cancel Remediation
              </button>
            )}

            {/* PENDING: Authorize Button */}
            {isPending && (
              <button
                onClick={() => handleOpenApproval(activeAction)}
                disabled={isProcessing}
                className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition flex items-center gap-2 shadow-sm"
              >
                <FileCheck className="w-4 h-4" />
                <span>Authorize Operator Approval</span>
              </button>
            )}

            {/* APPROVED: Run Simulation Button */}
            {isApproved && (
              <button
                onClick={handleSimulateExecution}
                disabled={isProcessing}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isProcessing ? 'Simulating...' : 'Run Safe Sandbox Simulation (simulate-fix)'}</span>
              </button>
            )}

            {/* EXECUTED / RESOLVED */}
            {isExecuted && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Simulation Complete · Incident Resolved</span>
              </div>
            )}
          </div>
        </div>

        {/* Validation Against Predefined Recovery Thresholds (Before vs After Comparison) */}
        {(isExecuted || activeAction?.validation_results) && (
          <div className="p-4 rounded-lg bg-emerald-950/15 border border-emerald-800/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-emerald-200 text-xs uppercase tracking-wider">
                  Automated Recovery Validation Report (Predefined SLA Thresholds)
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Status: ALL CHECKS SATISFIED (INCIDENT RESOLVED)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Transaction Latency p95</span>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400">3450.0 ms</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-emerald-400 font-bold">42.5 ms</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">Target: &lt;= 50.0 ms [PASS]</span>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">HTTP 5xx Error Rate</span>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400">18.5 %</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-emerald-400 font-bold">0.02 %</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">Target: &lt;= 0.1 % [PASS]</span>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Database Pool Saturation</span>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400">100.0 % (10 slots)</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-emerald-400 font-bold">36.0 % (50 slots)</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">Target: &lt;= 80.0 % [PASS]</span>
              </div>
            </div>

            <p className="text-[11px] text-emerald-300/80 leading-relaxed font-mono">
              Synthetic configuration update verified: DB_POOL_SIZE restored to 50. Telemetry stream returned to nominal baselines. Zero production connections or cloud infrastructure touched.
            </p>
          </div>
        )}

        {/* Execution Output Console / Result Log */}
        {activeAction?.result && (
          <div className="rounded bg-slate-950 border border-slate-800/80 overflow-hidden text-xs">
            <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between font-mono text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Remediation Execution &amp; Audit Result
              </span>
              <span className="text-[10px] text-slate-500">Sandbox Log</span>
            </div>
            <pre className="p-3 text-[11px] font-mono text-emerald-300/90 whitespace-pre-wrap overflow-x-auto leading-relaxed">
              {activeAction.result}
            </pre>
          </div>
        )}
      </div>

      {/* Safety Requirement 6: Immutable SRE Operator Audit Log */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Immutable Operator Audit Log (Incident #{activeIncidentId})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {auditLogs.length} events logged
          </span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="p-4 rounded bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400 text-center font-mono">
            No audit records logged for this incident yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="pb-2 font-medium">Timestamp</th>
                  <th className="pb-2 font-medium">Action Type</th>
                  <th className="pb-2 font-medium">Operator</th>
                  <th className="pb-2 font-medium">Details &amp; Guardrail Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-[11px]">
                {auditLogs.map((log) => {
                  const isApproval = log.action_type === 'APPROVAL_GRANTED';
                  const isSim = log.action_type === 'SIMULATION_STARTED' || log.action_type === 'REMEDIATION_EXECUTED';
                  const isReject = log.action_type.includes('REJECTED') || log.action_type.includes('CANCELLED') || log.action_type.includes('FAILED');

                  return (
                    <tr key={log.id} className="hover:bg-slate-900/30">
                      <td className="py-2.5 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isApproval
                              ? 'text-cyan-400 bg-cyan-950/50 border border-cyan-800/40'
                              : isSim
                              ? 'text-emerald-400 bg-emerald-950/50 border border-emerald-800/40'
                              : isReject
                              ? 'text-rose-400 bg-rose-950/50 border border-rose-800/40'
                              : 'text-slate-300 bg-slate-800/60'
                          }`}
                        >
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300 font-semibold whitespace-nowrap">
                        {log.operator}
                      </td>
                      <td className="py-2.5 text-slate-300/90 pr-2">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operator Approval Modal */}
      {activeActionForApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Authorize Remediation Action for Incident #{activeIncidentId}
                </h3>
              </div>
              <button
                onClick={() => setActiveActionForApproval(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded bg-amber-950/30 border border-amber-900/50 text-amber-200/90 text-[11px] leading-relaxed">
                <strong>Safety Verification:</strong> Authorizing this remediation will queue synthetic DB_POOL_SIZE restoration (10 &rarr; 50) in the simulation sandbox. Real infrastructure execution is permanently disabled.
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Authorizing SRE Operator Name / ID:
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="e.g. Alice Chen (Principal SRE)"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Confirmation Phrase (Required for Human Gating):
                </label>
                <div className="text-[11px] font-mono text-cyan-400 mb-1">
                  Type exactly: <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 select-all font-bold">{REQUIRED_PHRASE}</span>
                </div>
                <input
                  type="text"
                  placeholder="Type 'APPROVE REMEDIATION'"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                />
              </div>

              {approvalError && (
                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
                  {approvalError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveActionForApproval(null)}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={isProcessing || confirmationInput.trim().toUpperCase() !== REQUIRED_PHRASE || !operatorName.trim()}
                className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs disabled:opacity-40 transition"
              >
                {isProcessing ? 'Verifying...' : 'Confirm Human Authorization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Remediation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Cancel Remediation Execution
                </h3>
              </div>
              <button
                onClick={() => setCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Are you sure you want to cancel remediation for Incident #{activeIncidentId}? This will return the incident state to <code className="text-amber-300">awaiting_approval</code> and record a cancellation audit entry.
              </p>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Reason for Cancellation:
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="e.g. Investigation reassessment needed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelRemediation}
                disabled={isProcessing}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs disabled:opacity-50 transition"
              >
                {isProcessing ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
