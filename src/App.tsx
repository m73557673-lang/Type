import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { IncidentsView } from './components/IncidentsView';
import { InvestigationView } from './components/InvestigationView';
import { EvidenceChainView } from './components/EvidenceChainView';
import { RootCauseView } from './components/RootCauseView';
import { ServicesMetricsView } from './components/ServicesMetricsView';
import { KnowledgeBaseView } from './components/KnowledgeBaseView';
import { RemediationView } from './components/RemediationView';
import { PostmortemsView } from './components/PostmortemsView';
import { SettingsView } from './components/SettingsView';
import { api } from './api';
import {
  Service,
  Incident,
  Evidence,
  Metric,
  Recommendation,
  Action,
  Postmortem,
  KnowledgeDocument,
  HealthCheck,
  SimulationStatus,
  SimulationEvent,
  IncidentTimeline,
  InvestigationStatus
} from './types';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedIncidentId, setSelectedIncidentId] = useState<number>(1);

  // Operational Data State
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);

  // Simulation Engine State
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);

  // Incident-specific state
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [timeline, setTimeline] = useState<IncidentTimeline[]>([]);
  const [investigationStatus, setInvestigationStatus] = useState<InvestigationStatus | null>(null);

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load baseline data
  const loadBaselineData = useCallback(async () => {
    try {
      setError(null);
      const [
        healthData,
        servicesData,
        incidentsData,
        actionsData,
        docsData,
        simStatus,
        simEvents
      ] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getServices(),
        api.getIncidents(),
        api.getActions(),
        api.getKnowledgeDocuments(),
        api.getSimulationStatus().catch(() => null),
        api.getSimulationEvents().catch(() => [])
      ]);

      if (healthData) setHealth(healthData);
      setServices(servicesData);
      setIncidents(incidentsData);
      setActions(actionsData);
      setKnowledgeDocuments(docsData);
      if (simStatus) setSimulationStatus(simStatus);
      setSimulationEvents(simEvents);

      // Validate selectedIncidentId
      if (incidentsData.length > 0) {
        setSelectedIncidentId(prev => incidentsData.some(i => i.id === prev) ? prev : incidentsData[0].id);
      }
    } catch (err: any) {
      console.error('Error loading baseline data:', err);
      setError(err.message || 'Failed to connect to Incident Commander API engine');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load incident-specific sub-resources
  const loadIncidentResources = useCallback(async (incId: number) => {
    if (!incId) return;
    try {
      const [evList, mList, rec, pm, tl, inv] = await Promise.all([
        api.getIncidentEvidence(incId).catch(() => []),
        api.getIncidentMetrics(incId).catch(() => []),
        api.getIncidentRecommendation(incId).catch(() => null),
        api.getIncidentPostmortem(incId).catch(() => null),
        api.getIncidentTimeline(incId).catch(() => []),
        api.getInvestigationStatus(incId).catch(() => null)
      ]);
      setEvidence(evList);
      setMetrics(mList);
      setRecommendation(rec);
      setPostmortem(pm);
      setTimeline(tl);
      setInvestigationStatus(inv);
    } catch (err) {
      console.error(`Error loading resources for incident ${incId}:`, err);
    }
  }, []);

  useEffect(() => {
    loadBaselineData();
  }, [loadBaselineData]);

  useEffect(() => {
    if (selectedIncidentId) {
      loadIncidentResources(selectedIncidentId);
    }
  }, [selectedIncidentId, loadIncidentResources]);

  // Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadBaselineData();
    if (selectedIncidentId) {
      await loadIncidentResources(selectedIncidentId);
    }
  };

  const handleSelectIncident = (id: number) => {
    setSelectedIncidentId(id);
  };

  const handleStartInvestigation = async (incidentId: number) => {
    await api.investigateIncident(incidentId, 'Principal SRE (Console)');
    await loadBaselineData();
    await loadIncidentResources(incidentId);
  };

  const handleDetectBreaches = async () => {
    const res = await api.detectIncidents();
    await loadBaselineData();
    if (res.created_incident_ids && res.created_incident_ids.length > 0) {
      setSelectedIncidentId(res.created_incident_ids[0]);
      await loadIncidentResources(res.created_incident_ids[0]);
    }
    return res;
  };

  const handleStartScenario = async (scenario: 'incident' | 'healthy') => {
    setIsRefreshing(true);
    try {
      const updatedStatus = await api.startSimulation(scenario);
      setSimulationStatus(updatedStatus);
      await loadBaselineData();
      if (selectedIncidentId) {
        await loadIncidentResources(selectedIncidentId);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetSimulation = async () => {
    setIsRefreshing(true);
    try {
      await api.resetSimulation();
      await loadBaselineData();
      if (selectedIncidentId) {
        await loadIncidentResources(selectedIncidentId);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateIncident = async (data: {
    title: string;
    severity?: string;
    status?: string;
    service_id: number;
  }) => {
    const created = await api.createIncident(data);
    setIncidents(prev => [created, ...prev]);
    setSelectedIncidentId(created.id);
    await loadIncidentResources(created.id);
  };

  const handleApproveAction = async (actionId: number, approvedBy: string, phrase: string) => {
    const updated = await api.approveAction(actionId, approvedBy, phrase);
    setActions(prev => prev.map(a => a.id === actionId ? updated : a));
    await loadBaselineData();
    if (selectedIncidentId) {
      await loadIncidentResources(selectedIncidentId);
    }
  };

  const handleSimulateAction = async (actionId: number) => {
    const updated = await api.simulateAction(actionId);
    setActions(prev => prev.map(a => a.id === actionId ? updated : a));
    await loadBaselineData();
    if (selectedIncidentId) {
      await loadIncidentResources(selectedIncidentId);
    }
  };

  const handleCancelRemediation = async (incidentId: number, reason?: string) => {
    await api.cancelIncidentRemediation(incidentId, 'On-Call SRE', reason || 'Cancelled by operator');
    await loadBaselineData();
    if (selectedIncidentId) {
      await loadIncidentResources(selectedIncidentId);
    }
  };

  const handleSearchKnowledge = async (query: string) => {
    return api.searchKnowledge(query);
  };

  const handleGeneratePostmortem = async (incidentId: number) => {
    const newPm = await api.generatePostmortem(incidentId);
    setPostmortem(newPm);
  };

  const activeIncidentsCount = incidents.filter(i => i.status !== 'resolved' && i.status !== 'failed').length;
  const pendingActionsCount = actions.filter(a => a.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans antialiased">
      {/* Top Enterprise Header */}
      <Header
        health={health}
        activeCount={activeIncidentsCount}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeIncidentsCount={activeIncidentsCount}
          pendingRemediationsCount={pendingActionsCount}
        />

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={handleRefresh}
                className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-100 font-medium transition"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs font-mono">Connecting to SQLite Database & Incident Engine...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  incidents={incidents}
                  services={services}
                  metrics={metrics}
                  actions={actions}
                  simulationStatus={simulationStatus}
                  simulationEvents={simulationEvents}
                  onStartScenario={handleStartScenario}
                  onResetSimulation={handleResetSimulation}
                  onSelectIncident={handleSelectIncident}
                  onNavigate={setActiveTab}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'incidents' && (
                <IncidentsView
                  incidents={incidents}
                  services={services}
                  onSelectIncident={handleSelectIncident}
                  onNavigate={setActiveTab}
                  onCreateIncident={handleCreateIncident}
                  onDetectBreaches={handleDetectBreaches}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'investigation' && (
                <InvestigationView
                  incidents={incidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                  recommendation={recommendation}
                  evidence={evidence}
                  timeline={timeline}
                  investigationStatus={investigationStatus}
                  onStartInvestigation={handleStartInvestigation}
                  onNavigate={setActiveTab}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'evidence' && (
                <EvidenceChainView
                  incidents={incidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                  evidence={evidence}
                  onNavigate={setActiveTab}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'root-cause' && (
                <RootCauseView
                  incidents={incidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                  onNavigate={setActiveTab}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'services' && (
                <ServicesMetricsView
                  services={services}
                  metrics={metrics}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                />
              )}

              {activeTab === 'knowledge-base' && (
                <KnowledgeBaseView
                  documents={knowledgeDocuments}
                  onSearch={handleSearchKnowledge}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'remediation' && (
                <RemediationView
                  actions={actions}
                  incidents={incidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                  recommendation={recommendation}
                  onApprove={handleApproveAction}
                  onSimulate={handleSimulateAction}
                  onCancel={handleCancelRemediation}
                  onReset={handleResetSimulation}
                  onRefresh={handleRefresh}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'postmortems' && (
                <PostmortemsView
                  postmortem={postmortem}
                  incidents={incidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                  onGeneratePostmortem={handleGeneratePostmortem}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  health={health}
                  onResetData={handleResetSimulation}
                  isLoading={isLoading}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
