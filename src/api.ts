import {
  Service,
  Incident,
  LogEvent,
  Deployment,
  Metric,
  KnowledgeDocument,
  DocumentChunk,
  IndexingStatus,
  RAGSearchResult,
  Evidence,
  Recommendation,
  Action,
  Postmortem,
  HealthCheck
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  // GET /health
  async getHealth(): Promise<HealthCheck> {
    const res = await fetch(`${BASE_URL}/health`);
    return handleResponse<HealthCheck>(res);
  },

  // GET /services
  async getServices(skip = 0, limit = 50, status?: string): Promise<Service[]> {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (status && status !== 'ALL') params.append('status', status);
    const res = await fetch(`${BASE_URL}/services?${params.toString()}`);
    return handleResponse<Service[]>(res);
  },

  // GET /incidents
  async getIncidents(skip = 0, limit = 50, status?: string, severity?: string, serviceId?: number): Promise<Incident[]> {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (status && status !== 'ALL') params.append('status', status);
    if (severity && severity !== 'ALL') params.append('severity', severity);
    if (serviceId !== undefined) params.append('service_id', serviceId.toString());
    const res = await fetch(`${BASE_URL}/incidents?${params.toString()}`);
    return handleResponse<Incident[]>(res);
  },

  // POST /incidents
  async createIncident(data: {
    title: string;
    severity?: string;
    status?: string;
    service_id: number;
  }): Promise<Incident> {
    const res = await fetch(`${BASE_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Incident>(res);
  },

  // POST /incidents/detect
  async detectIncidents(): Promise<{
    breaches_detected: number;
    incidents_created: number;
    deduplicated: number;
    created_incident_ids: number[];
    details: any[];
  }> {
    const res = await fetch(`${BASE_URL}/incidents/detect`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  // POST /incidents/{id}/investigate
  async investigateIncident(id: number, actor = 'Operator'): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/investigate?actor=${encodeURIComponent(actor)}`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  // GET /incidents/{id}/investigation
  async getInvestigationStatus(id: number): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/investigation`);
    return handleResponse<any>(res);
  },

  // GET /incidents/{id}/timeline
  async getIncidentTimeline(id: number): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/timeline`);
    return handleResponse<any[]>(res);
  },

  // POST /incidents/{id}/transition
  async transitionIncident(id: number, toState: string, actor = 'Operator', message = 'State transition'): Promise<Incident> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_state: toState, actor, message }),
    });
    return handleResponse<Incident>(res);
  },

  // GET /incidents/{id}
  async getIncident(id: number): Promise<Incident> {
    const res = await fetch(`${BASE_URL}/incidents/${id}`);
    return handleResponse<Incident>(res);
  },

  // GET /incidents/{id}/evidence
  async getIncidentEvidence(id: number, skip = 0, limit = 100, type?: string): Promise<Evidence[]> {
    const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
    if (type && type !== 'ALL') params.append('type', type);
    const res = await fetch(`${BASE_URL}/incidents/${id}/evidence?${params.toString()}`);
    return handleResponse<Evidence[]>(res);
  },

  // GET /incidents/{id}/root-cause
  async getRootCauseAnalysis(id: number): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/root-cause`);
    return handleResponse<any>(res);
  },

  // GET /incidents/{id}/metrics
  async getIncidentMetrics(id: number, skip = 0, limit = 100, metricName?: string): Promise<Metric[]> {
    const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
    if (metricName) params.append('metric_name', metricName);
    const res = await fetch(`${BASE_URL}/incidents/${id}/metrics?${params.toString()}`);
    return handleResponse<Metric[]>(res);
  },

  // GET /incidents/{id}/recommendation
  async getIncidentRecommendation(id: number): Promise<Recommendation | null> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/recommendation`);
    if (res.status === 404) return null;
    return handleResponse<Recommendation>(res);
  },

  // GET /incidents/{id}/postmortem
  async getIncidentPostmortem(id: number): Promise<Postmortem | null> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/postmortem`);
    if (res.status === 404) return null;
    return handleResponse<Postmortem>(res);
  },

  // Knowledge Documents & RAG Engine
  async getIndexingStatus(): Promise<IndexingStatus> {
    const res = await fetch(`${BASE_URL}/knowledge/indexing-status`);
    return handleResponse<IndexingStatus>(res);
  },

  async getKnowledgeDocuments(skip = 0, limit = 50, type?: string): Promise<KnowledgeDocument[]> {
    const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
    if (type && type !== 'ALL') params.append('type', type);
    const res = await fetch(`${BASE_URL}/knowledge?${params.toString()}`);
    return handleResponse<KnowledgeDocument[]>(res);
  },

  async getKnowledgeDocument(id: number): Promise<KnowledgeDocument> {
    const res = await fetch(`${BASE_URL}/knowledge/${id}`);
    return handleResponse<KnowledgeDocument>(res);
  },

  async uploadKnowledgeDocument(data: {
    title: string;
    type?: string;
    content: string;
    source?: string;
    filename?: string;
  }): Promise<{ document: KnowledgeDocument; indexing_status: IndexingStatus }> {
    const res = await fetch(`${BASE_URL}/knowledge/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ document: KnowledgeDocument; indexing_status: IndexingStatus }>(res);
  },

  async deleteKnowledgeDocument(id: number): Promise<{ message: string; indexing_status: IndexingStatus }> {
    const res = await fetch(`${BASE_URL}/knowledge/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ message: string; indexing_status: IndexingStatus }>(res);
  },

  async searchKnowledge(query: string, topK = 5, type = 'ALL'): Promise<RAGSearchResult> {
    const res = await fetch(`${BASE_URL}/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK, type }),
    });
    return handleResponse<RAGSearchResult>(res);
  },

  async getIncidentRAGContext(incidentId: number): Promise<RAGSearchResult> {
    const res = await fetch(`${BASE_URL}/incidents/${incidentId}/rag-context`);
    return handleResponse<RAGSearchResult>(res);
  },

  // Actions (Human-gated remediation & safe simulation)
  async getActions(incidentId?: number): Promise<Action[]> {
    const query = incidentId ? `?incident_id=${incidentId}` : '';
    const res = await fetch(`${BASE_URL}/actions${query}`);
    return handleResponse<Action[]>(res);
  },

  async approveAction(id: number, approvedBy: string, confirmationPhrase: string): Promise<Action> {
    const res = await fetch(`${BASE_URL}/actions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: approvedBy, confirmation_phrase: confirmationPhrase }),
    });
    return handleResponse<Action>(res);
  },

  async simulateAction(id: number): Promise<Action> {
    const res = await fetch(`${BASE_URL}/actions/${id}/simulate`, {
      method: 'POST',
    });
    return handleResponse<Action>(res);
  },

  // Direct Incident-level Remediation Workflow endpoints
  async approveIncidentRemediation(incidentId: number, approvedBy: string, confirmationPhrase: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${incidentId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: approvedBy, confirmation_phrase: confirmationPhrase }),
    });
    return handleResponse<any>(res);
  },

  async simulateFixIncident(incidentId: number): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${incidentId}/simulate-fix`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async cancelIncidentRemediation(incidentId: number, operator = 'Operator', reason = 'Cancelled by operator'): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${incidentId}/cancel-remediation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator, reason }),
    });
    return handleResponse<any>(res);
  },

  async getAuditLogs(incidentId?: number): Promise<any[]> {
    const query = incidentId ? `?incident_id=${incidentId}` : '';
    const res = await fetch(`${BASE_URL}/audit-logs${query}`);
    return handleResponse<any[]>(res);
  },

  // Generate Postmortem
  async generatePostmortem(incidentId: number): Promise<Postmortem> {
    const res = await fetch(`${BASE_URL}/postmortems/generate/${incidentId}`, {
      method: 'POST',
    });
    return handleResponse<Postmortem>(res);
  },

  async getPostmortems(): Promise<Postmortem[]> {
    const res = await fetch(`${BASE_URL}/postmortems`);
    return handleResponse<Postmortem[]>(res);
  },

  async exportPostmortemMarkdown(incidentOrPmId: number): Promise<string> {
    const res = await fetch(`${BASE_URL}/postmortems/${incidentOrPmId}/export?format=markdown`);
    return res.text();
  },

  // Reset database state to seed
  async resetSyntheticData(): Promise<{ message: string }> {
    const res = await fetch(`${BASE_URL}/reset-synthetic-data`, {
      method: 'POST',
    });
    return handleResponse<{ message: string }>(res);
  },

  // ---------------- Simulation Engine Endpoints ----------------
  async startSimulation(scenario: 'incident' | 'healthy'): Promise<any> {
    const res = await fetch(`${BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    return handleResponse<any>(res);
  },

  async getSimulationStatus(): Promise<any> {
    const res = await fetch(`${BASE_URL}/simulation/status`);
    return handleResponse<any>(res);
  },

  async getSimulationEvents(): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/simulation/events`);
    return handleResponse<any[]>(res);
  },

  async resetSimulation(): Promise<{ message: string }> {
    const res = await fetch(`${BASE_URL}/simulation/reset`, {
      method: 'POST',
    });
    return handleResponse<{ message: string }>(res);
  },
};
