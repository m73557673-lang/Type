import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BM25Retriever, chunkDocument, getSeedKnowledgeDocuments } from './src/rag_engine';
import { KnowledgeDocument, DocumentChunk, IndexingStatus, Postmortem } from './src/types';
import { InvestigationOrchestrator } from './src/ai/orchestrator';
import { AIInvestigationReport } from './src/ai/types';
import { buildChronologicalEvidenceChain, deriveRootCauseAnalysis, RootCauseAnalysisResult } from './src/ai/evidence_chain';
import { generateIncidentPostmortem, formatPostmortemToMarkdown } from './src/ai/postmortem_generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

// Structured logging helper
function logEvent(action: string, details: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [INFO] [IncidentCommander] ${action}: ${details}`);
}

// ---------------- DATABASE MODELS & IN-MEMORY STORE ----------------
interface Service {
  id: number;
  name: string;
  environment: string;
  owner: string;
  status: string; // HEALTHY, DEGRADED, OUTAGE
}

// 7 Incident States: detected, investigating, awaiting_approval, remediating, validating, resolved, failed
interface Incident {
  id: number;
  title: string;
  severity: string; // CRITICAL, HIGH, MEDIUM, LOW
  status: string;
  service_id: number;
  created_at: string;
  resolved_at: string | null;
}

interface IncidentTimeline {
  id: number;
  incident_id: number;
  from_state: string | null;
  to_state: string;
  actor: string;
  message: string;
  timestamp: string;
}

interface LogEvent {
  id: number;
  service_id: number;
  timestamp: string;
  level: string; // INFO, WARN, ERROR, FATAL
  message: string;
}

interface Deployment {
  id: number;
  service_id: number;
  version: string;
  changes: string;
  timestamp: string;
}

interface Metric {
  id: number;
  service_id: number;
  timestamp: string;
  metric_name: string;
  value: number;
}

interface Evidence {
  id: number;
  incident_id: number;
  stable_id: string;
  source_type: string;
  source_id: number | null;
  source_ref: string;
  timestamp: string | null;
  title: string;
  excerpt_or_value: string;
  relevance: number;
  detail?: string | null;
  supporting_hypotheses?: string[];
  contradicting_hypotheses?: string[];
  raw_record?: any;
}

interface Recommendation {
  id: number;
  incident_id: number;
  proposed_action: string;
  action: string;
  reason_and_supporting_evidence: string;
  expected_impact: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk: string;
  preconditions: string[];
  rollback_plan: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  confidence: number;
  action_command?: string;
  allowlisted_action_type?: string;
}

interface Action {
  id: number;
  incident_id: number;
  approved_by: string | null;
  status: string; // PENDING, APPROVED, REJECTED, SIMULATED, FAILED
  result: string | null;
  proposed_action?: string;
  risk_level?: string;
  created_at?: string;
  approved_at?: string | null;
  executed_at?: string | null;
  rejection_reason?: string | null;
  validation_results?: any | null;
}

interface AuditLogEntry {
  id: number;
  timestamp: string;
  incident_id: number;
  action_type: string;
  operator: string;
  details: string;
  metadata?: Record<string, any>;
}

interface DatabaseStore {
  services: Service[];
  incidents: Incident[];
  timelines: IncidentTimeline[];
  log_events: LogEvent[];
  deployments: Deployment[];
  metrics: Metric[];
  knowledge_documents: KnowledgeDocument[];
  evidences: Evidence[];
  recommendations: Recommendation[];
  actions: Action[];
  postmortems: Postmortem[];
  ai_investigations: Record<number, AIInvestigationReport>;
  persisted_evidence_chains: Record<number, Evidence[]>;
  persisted_root_causes: Record<number, RootCauseAnalysisResult>;
  audit_logs: AuditLogEntry[];
}

function getInitialDatabase(): DatabaseStore {
  const now = new Date();
  const subMinutes = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  // 1. Synthetic E-Commerce Checkout Services
  const services: Service[] = [
    {
      id: 1,
      name: "API Gateway",
      environment: "production-synthetic",
      owner: "Edge Networking Team",
      status: "DEGRADED"
    },
    {
      id: 2,
      name: "Checkout Service",
      environment: "production-synthetic",
      owner: "Checkout Chapter",
      status: "OUTAGE"
    },
    {
      id: 3,
      name: "Order Service",
      environment: "production-synthetic",
      owner: "Orders Platform Team",
      status: "DEGRADED"
    },
    {
      id: 4,
      name: "Database Service",
      environment: "production-synthetic",
      owner: "Data SRE Infrastructure",
      status: "DEGRADED"
    }
  ];

  // 2. Initial Incident in 'detected' state
  const incidents: Incident[] = [
    {
      id: 1,
      title: "[SYNTHETIC] Database Connection Pool Exhaustion on Checkout Service",
      severity: "CRITICAL",
      status: "detected",
      service_id: 2,
      created_at: subMinutes(14),
      resolved_at: null
    }
  ];

  // Timelines
  const timelines: IncidentTimeline[] = [
    {
      id: 1,
      incident_id: 1,
      from_state: null,
      to_state: "detected",
      actor: "DetectionEngine",
      message: "Threshold breach detected: p95 latency > 3400ms (threshold >= 2000ms) and DB pool saturation at 100%.",
      timestamp: subMinutes(14)
    }
  ];

  // 3. Application Logs
  const log_events: LogEvent[] = [
    {
      id: 101,
      service_id: 2,
      timestamp: subMinutes(16),
      level: "INFO",
      message: "Deployment v2.4.1-rc1 applied. Setting DB_POOL_SIZE=10. Reinitializing HikariCP DataSource."
    },
    {
      id: 102,
      service_id: 1,
      timestamp: subMinutes(14),
      level: "INFO",
      message: "Traffic surge detected on POST /v1/checkout/pay: ingress throughput climbed from 250 RPS to 850 RPS"
    },
    {
      id: 103,
      service_id: 2,
      timestamp: subMinutes(13),
      level: "WARN",
      message: "HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms; active connections: 10/10 (100% capacity)"
    },
    {
      id: 104,
      service_id: 2,
      timestamp: subMinutes(12),
      level: "ERROR",
      message: "PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections (max_connections=10)"
    },
    {
      id: 105,
      service_id: 2,
      timestamp: subMinutes(10),
      level: "ERROR",
      message: "HikariPool-1 - Connection is not available, request timed out after 3000ms"
    },
    {
      id: 106,
      service_id: 1,
      timestamp: subMinutes(8),
      level: "ERROR",
      message: "HTTP 504 Gateway Timeout: upstream Checkout Service failed to complete within 3000ms deadline (error rate 18.5%)"
    }
  ];

  // 4. Deployments
  const deployments: Deployment[] = [
    {
      id: 1,
      service_id: 2,
      version: "v2.4.0",
      changes: "commit 3b1e94a: feat: stable checkout baseline (DB_POOL_SIZE=50)",
      timestamp: subHours(2)
    },
    {
      id: 2,
      service_id: 2,
      version: "v2.4.1-rc1",
      changes: "commit 8f31c2a: perf(db): tune DB_POOL_SIZE from 50 to 10 to reduce idle memory",
      timestamp: subMinutes(16)
    }
  ];

  // 5. Deterministic Metrics
  const metrics: Metric[] = [];
  let mId = 1;
  for (let i = 15; i >= 0; i--) {
    const ts = subMinutes(i * 2);
    const isIncident = (i <= 7);
    const isTrans = (i === 8);

    const lat = isIncident ? 3450.0 + (i % 4) * 85 : (isTrans ? 950.0 : 45.0 + (i % 3) * 1.5);
    const err = isIncident ? 18.5 + (i % 3) * 1.2 : (isTrans ? 4.2 : 0.02);
    const pool = isIncident ? 100.0 : (isTrans ? 90.0 : 36.0);
    const vol = isIncident ? 850.0 + (i % 5) * 12 : (isTrans ? 620.0 : 250.0 + (i % 4) * 5);

    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "latency_p95", value: lat + 20 });
    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "error_rate", value: err });
    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "request_volume", value: vol });

    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "latency_p95", value: lat });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "error_rate", value: err });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "pool_utilization", value: pool });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "request_volume", value: vol });

    metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "pool_utilization", value: pool });
    metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "latency_p95", value: isIncident ? 1800.0 : 12.0 });
  }

// 5. Knowledge Documents Seed
  const knowledge_documents = getSeedKnowledgeDocuments();

  // 7. Evidence
  const evidences: Evidence[] = buildChronologicalEvidenceChain(1, {
    services,
    incidents,
    deployments,
    metrics,
    log_events,
    knowledge_documents
  });

  // 8. Recommendation
  const recommendations: Recommendation[] = [
    {
      id: 1,
      incident_id: 1,
      proposed_action: "Restore DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods",
      action: "Restore DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods",
      reason_and_supporting_evidence: "Deployment v2.4.1-rc1 reduced DB_POOL_SIZE from 50 to 10 (commit 8f31c2a8d). Concurrently, ingress traffic surged to 850 RPS, starving the 10 JDBC slots. Supported by culprit config diff (EVD-DEP-2), 100% pool saturation (EVD-METRIC-POOL), HikariPool wait timeouts (EVD-LOG-104), and runbook guidance (EVD-RUNBOOK-002).",
      expected_impact: "Restores concurrent JDBC connection capacity to 50 slots (+400%). Eliminates HikariPool wait queue starvation, dropping p95 latency from 3450ms to ~42ms and reducing HTTP 504 errors from 18.5% to <0.02%.",
      risk_level: "LOW",
      risk: "LOW",
      preconditions: [
        "Checkout Service is in DEGRADED or OUTAGE state",
        "Target PostgreSQL instance has >= 100 available connection slots",
        "Action is verified against the server remediation allowlist",
        "Incident state is 'awaiting_approval' or 'investigating'"
      ],
      rollback_plan: "If database container memory exceeds 80% or connection contention shifts to database CPU thrashing, revert DB_POOL_SIZE to 25 and horizontally scale pod replicas from 3 to 6.",
      approval_status: "PENDING",
      confidence: 0.97,
      action_command: "kubectl set env deployment/checkout-service DB_POOL_SIZE=50 && kubectl rollout restart deployment/checkout-service",
      allowlisted_action_type: "RESTORE_DB_POOL_SIZE"
    }
  ];

  // 9. Action
  const actions: Action[] = [
    {
      id: 1,
      incident_id: 1,
      approved_by: null,
      status: "PENDING",
      result: "Awaiting SRE operator authorization. Human approval phrase required: 'APPROVE REMEDIATION'. Action: Restore DB_POOL_SIZE from 10 to 50.",
      proposed_action: "Restore DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods",
      risk_level: "LOW",
      created_at: subMinutes(14),
      approved_at: null,
      executed_at: null,
      rejection_reason: null,
      validation_results: null
    }
  ];

  // 10. Audit Logs
  const audit_logs: AuditLogEntry[] = [
    {
      id: 1,
      timestamp: subMinutes(14),
      incident_id: 1,
      action_type: "RECOMMENDATION_CREATED",
      operator: "InvestigationEngine",
      details: "Formulated recommendation to restore DB_POOL_SIZE from 10 to 50 based on telemetry evidence EVD-DEP-2 and EVD-METRIC-POOL.",
      metadata: { proposed_action: "Restore DB_POOL_SIZE from 10 to 50", risk: "LOW" }
    }
  ];

  // 11. Postmortem
  const postmortems: Postmortem[] = [];
  const initialPostmortem = generateIncidentPostmortem(1, {
    services,
    incidents,
    timelines,
    log_events,
    deployments,
    metrics,
    knowledge_documents,
    evidences,
    recommendations,
    actions,
    audit_logs
  }, 1);
  postmortems.push(initialPostmortem);

  const root_cause_1 = deriveRootCauseAnalysis(1, {
    services,
    incidents,
    deployments,
    metrics,
    log_events,
    knowledge_documents
  });

  return {
    services,
    incidents,
    timelines,
    log_events,
    deployments,
    metrics,
    knowledge_documents,
    evidences,
    recommendations,
    actions,
    postmortems,
    ai_investigations: {},
    persisted_evidence_chains: {
      1: evidences
    },
    persisted_root_causes: {
      1: root_cause_1
    },
    audit_logs
  };
}

let db = getInitialDatabase();

// Audit log helper
function addAuditLog(
  incidentId: number,
  actionType: AuditLogEntry['action_type'],
  operator: string,
  details: string,
  metadata?: Record<string, any>
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: db.audit_logs.length + 1,
    timestamp: new Date().toISOString(),
    incident_id: incidentId,
    action_type: actionType,
    operator,
    details,
    metadata
  };
  db.audit_logs.unshift(entry);
  logEvent('AUDIT_LOG', `[${actionType}] Incident #${incidentId} by ${operator}: ${details}`);
  return entry;
}

// Strict Allowlist validation for simulation remediation actions
function isActionAllowlisted(actionString: string): boolean {
  if (!actionString || typeof actionString !== 'string') return false;
  const s = actionString.toLowerCase();
  
  // Forbidden dangerous commands (Real infrastructure execution is strictly disabled)
  const forbiddenPatterns = [
    /\brm\s+-rf\b/,
    /\bdrop\s+table\b/,
    /\bshutdown\b/,
    /\bkubectl\s+delete\b/,
    /\bcurl\s+-x\b/,
    /\baws\s+/,
    /\bgcloud\s+/,
    /\bkill\s+-9\b/,
    /\bdelete\s+from\b/,
    /\btruncate\b/,
    /\beval\s*\(/,
    /\bexec\s+/,
    /\bsh\s+-c\b/,
    /\bbash\s+-c\b/,
    /\bsudo\b/,
    /\breboot\b/,
    /\bdd\s+if=/
  ];
  if (forbiddenPatterns.some(pattern => pattern.test(s))) {
    return false;
  }

  // Must match allowlisted operational actions in safe simulation catalog
  return (
    s.includes('db_pool_size') ||
    s.includes('pool_size') ||
    s.includes('restore db_pool_size from 10 to 50') ||
    s.includes('rollback deployment') ||
    s.includes('rolling restart') ||
    s.includes('drain')
  );
}

const ragRetriever = new BM25Retriever();

function refreshRAGIndex() {
  const allChunks: DocumentChunk[] = [];
  for (const doc of db.knowledge_documents) {
    const chunks = chunkDocument(doc);
    doc.chunks = chunks;
    doc.chunks_count = chunks.length;
    doc.word_count = doc.content.split(/\s+/).length;
    doc.indexed_at = new Date().toISOString();
    allChunks.push(...chunks);
  }
  ragRetriever.indexChunks(allChunks);
  logEvent('RAG_INDEX_UPDATED', `Indexed ${allChunks.length} chunks across ${db.knowledge_documents.length} operational documents.`);
}

refreshRAGIndex();

function addTimeline(incidentId: number, toState: string, fromState: string | null, actor: string, message: string) {
  const newTimeline: IncidentTimeline = {
    id: db.timelines.length + 1,
    incident_id: incidentId,
    from_state: fromState,
    to_state: toState,
    actor,
    message,
    timestamp: new Date().toISOString()
  };
  db.timelines.push(newTimeline);
  return newTimeline;
}

// ---------------- REST API & INCIDENT ENDPOINTS ----------------

// GET /health
app.get(['/health', '/api/health'], (req: Request, res: Response) => {
  const activeIncidents = db.incidents.filter(i => i.status !== 'resolved' && i.status !== 'failed').length;
  res.json({
    status: "UP",
    timestamp: new Date().toISOString(),
    database: "healthy (sqlite/in-memory)",
    active_incidents: activeIncidents,
    services_count: db.services.length,
    version: "1.0.0",
    synthetic_mode: true
  });
});

// GET /services
app.get(['/services', '/api/services'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const status = req.query.status as string;

  let result = [...db.services];
  if (status) {
    result = result.filter(s => s.status.toLowerCase() === status.toLowerCase());
  }
  res.json(result.slice(skip, skip + limit));
});

// GET /incidents (with pagination & filters)
app.get(['/incidents', '/api/incidents'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const status = req.query.status as string;
  const severity = req.query.severity as string;
  const service_id = req.query.service_id ? parseInt(req.query.service_id as string, 10) : null;

  let result = [...db.incidents];
  if (status && status.toUpperCase() !== 'ALL') {
    result = result.filter(i => i.status.toLowerCase() === status.toLowerCase());
  }
  if (severity && severity.toUpperCase() !== 'ALL') {
    result = result.filter(i => i.severity.toUpperCase() === severity.toUpperCase());
  }
  if (service_id !== null) {
    result = result.filter(i => i.service_id === service_id);
  }

  const enriched = result.slice(skip, skip + limit).map(inc => {
    const svc = db.services.find(s => s.id === inc.service_id);
    return {
      ...inc,
      service_name: svc ? svc.name : `service-${inc.service_id}`
    };
  });

  res.json(enriched);
});

// POST /incidents
app.post(['/incidents', '/api/incidents'], (req: Request, res: Response) => {
  const { title, severity = 'HIGH', status = 'detected', service_id } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'title' is required and must not be empty." });
  }

  const sId = parseInt(service_id, 10);
  const service = db.services.find(s => s.id === sId);
  if (!service) {
    return res.status(404).json({ detail: `Service with id ${service_id} not found.` });
  }

  const newId = db.incidents.length > 0 ? Math.max(...db.incidents.map(i => i.id)) + 1 : 1;
  const initialStatus = status.toLowerCase();

  const newIncident: Incident = {
    id: newId,
    title: title.startsWith('[SYNTHETIC]') ? title : `[SYNTHETIC] ${title}`,
    severity: severity.toUpperCase(),
    status: initialStatus,
    service_id: sId,
    created_at: new Date().toISOString(),
    resolved_at: null
  };

  db.incidents.unshift(newIncident);
  addTimeline(newId, initialStatus, null, "Operator", `Incident manually created with severity ${severity}.`);

  if (['CRITICAL', 'HIGH'].includes(newIncident.severity)) {
    service.status = 'DEGRADED';
  }

  logEvent('INCIDENT_CREATED', `Created incident #${newId} on ${service.name}`);
  res.status(201).json({
    ...newIncident,
    service_name: service.name
  });
});

// ---------------- DETECTION & DEDUPLICATION ENDPOINT ----------------
app.post(['/incidents/detect', '/api/incidents/detect'], (req: Request, res: Response) => {
  const created: Incident[] = [];
  let deduplicated = 0;
  const breaches = [];

  // Configurable rules
  const thresholds = {
    error_rate_crit: 5.0,
    error_rate_high: 1.0,
    latency_crit: 2000.0,
    latency_high: 500.0,
    pool_crit: 95.0
  };

  for (const svc of db.services) {
    const recentMetrics = db.metrics.filter(m => m.service_id === svc.id);
    const maxLat = Math.max(...recentMetrics.filter(m => m.metric_name === 'latency_p95').map(m => m.value), 0);
    const maxErr = Math.max(...recentMetrics.filter(m => m.metric_name === 'error_rate').map(m => m.value), 0);
    const maxPool = Math.max(...recentMetrics.filter(m => m.metric_name === 'pool_utilization').map(m => m.value), 0);

    let severity: string | null = null;
    let reason = "";

    if (maxErr >= thresholds.error_rate_crit || maxLat >= thresholds.latency_crit || maxPool >= thresholds.pool_crit) {
      severity = "CRITICAL";
      reason = `Breached critical thresholds: Latency ${maxLat}ms (limit 2000ms), Pool ${maxPool}% (limit 95%)`;
    } else if (maxErr >= thresholds.error_rate_high || maxLat >= thresholds.latency_high) {
      severity = "HIGH";
      reason = `Breached high thresholds: Latency ${maxLat}ms (limit 500ms)`;
    }

    if (severity) {
      breaches.push({ service_id: svc.id, service_name: svc.name, severity, reason });

      // Deduplication check: Avoid duplicate incident for same active event
      const existing = db.incidents.find(i => i.service_id === svc.id && i.status !== 'resolved' && i.status !== 'failed');
      if (existing) {
        deduplicated++;
        addTimeline(existing.id, existing.status, existing.status, "DetectionEngine", `Deduplication: Active incident already tracking this event. Breach reaffirmed: ${reason}`);
      } else {
        const newId = db.incidents.length > 0 ? Math.max(...db.incidents.map(i => i.id)) + 1 : 1;
        const inc: Incident = {
          id: newId,
          title: `[SYNTHETIC] ${severity} Threshold Breach on ${svc.name}`,
          severity,
          status: "detected",
          service_id: svc.id,
          created_at: new Date().toISOString(),
          resolved_at: null
        };
        db.incidents.unshift(inc);
        addTimeline(newId, "detected", null, "DetectionEngine", reason);
        created.push(inc);
        svc.status = severity === "CRITICAL" ? "OUTAGE" : "DEGRADED";
      }
    }
  }

  res.json({
    breaches_detected: breaches.length,
    incidents_created: created.length,
    deduplicated,
    created_incident_ids: created.map(i => i.id),
    details: breaches
  });
});

// ---------------- INVESTIGATION ORCHESTRATION ENDPOINTS ----------------
app.post(['/incidents/:id/investigate', '/api/incidents/:id/investigate'], async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const actor = (req.query.actor as string) || "Operator";
  const oldState = inc.status;

  // Step 1: Transition to 'investigating'
  inc.status = "investigating";
  addTimeline(id, "investigating", oldState, actor, `Investigation launched by ${actor}. Initializing 8-agent AI investigation layer.`);

  // Step 2: Gather context
  const svc = db.services.find(s => s.id === inc.service_id) || db.services[0];
  const serviceMetrics = db.metrics.filter(m => m.service_id === inc.service_id);
  const serviceLogs = db.log_events.filter(l => l.service_id === inc.service_id);
  const serviceDeployments = db.deployments.filter(d => d.service_id === inc.service_id);

  // Step 3: Run Multi-Agent Investigation Orchestrator
  let report: AIInvestigationReport;
  try {
    report = await InvestigationOrchestrator.execute({
      incident: {
        id: inc.id,
        title: inc.title,
        severity: inc.severity,
        status: inc.status,
        service_id: inc.service_id,
        created_at: inc.created_at
      },
      service: {
        id: svc.id,
        name: svc.name,
        environment: svc.environment
      },
      metrics: serviceMetrics,
      logs: serviceLogs,
      deployments: serviceDeployments,
      searchRAG: async (query: string, topK = 5) => {
        const passages = ragRetriever.search(query, topK);
        return {
          query,
          results_count: passages.length,
          algorithm: "BM25 (Ranked Lexical)",
          passages
        };
      }
    });
  } catch (err: any) {
    console.error("[Investigation] Orchestrator error, falling back:", err);
    report = await InvestigationOrchestrator.execute({
      incident: {
        id: inc.id,
        title: inc.title,
        severity: inc.severity,
        status: inc.status,
        service_id: inc.service_id,
        created_at: inc.created_at
      },
      service: {
        id: svc.id,
        name: svc.name,
        environment: svc.environment
      },
      metrics: serviceMetrics,
      logs: serviceLogs,
      deployments: serviceDeployments,
      searchRAG: async (query: string, topK = 5) => ({
        query,
        results_count: 5,
        algorithm: "BM25",
        passages: ragRetriever.search(query, topK)
      })
    });
  }

  // Persist investigation results
  db.ai_investigations[id] = report;

  // Step 4: Populate & persist evidence chain and root cause analysis from stored database records
  db.persisted_evidence_chains[id] = buildChronologicalEvidenceChain(id, db);
  db.persisted_root_causes[id] = deriveRootCauseAnalysis(id, db);
  db.evidences = db.persisted_evidence_chains[id];

  // Step 5: Formulate recommendation with calibrated confidence
  db.recommendations = db.recommendations.filter(r => r.incident_id !== id);
  const culpritDiff = report.change_analysis.config_diff || "DB_POOL_SIZE 50 -> 10";
  const primaryHypo = report.root_cause.primary_hypothesis;
  const actionText = `${report.remediation.action_title}. ${report.remediation.proposed_plan[1] || ''} ${report.remediation.proposed_plan[2] || ''}`.trim();

  db.recommendations.push({
    id: db.recommendations.length + 1,
    incident_id: id,
    proposed_action: "Restore DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods",
    action: actionText,
    reason_and_supporting_evidence: `Culprit configuration diff (${culpritDiff}) reduced concurrent JDBC capacity by 80%. Under peak traffic surge, connection acquisition queue starved (>1500ms). Supported by HikariPool timeout exceptions, 100% pool utilization telemetry, and runbook sizing rules.`,
    expected_impact: "Restores concurrent JDBC connection capacity to 50 slots (+400%). Eliminates HikariPool wait queue starvation, dropping p95 latency from 3450ms to ~42ms and reducing HTTP 504 errors from 18.5% to <0.02%.",
    risk_level: (report.remediation.assessed_risk as any) || "LOW",
    risk: (report.remediation.assessed_risk as any) || "LOW",
    preconditions: [
      `Service '${svc.name}' is currently in DEGRADED or OUTAGE state`,
      "Target PostgreSQL cluster has available connection capacity (max_connections >= 150)",
      "Action is verified against the server remediation allowlist",
      "Incident state is 'awaiting_approval' or 'investigating'"
    ],
    rollback_plan: "If database container memory exceeds 80% or connection contention shifts to database CPU thrashing, revert DB_POOL_SIZE to 25 and horizontally scale pod replicas from 3 to 6.",
    approval_status: "PENDING",
    confidence: primaryHypo ? primaryHypo.confidence : 0.95,
    action_command: report.remediation.action_command,
    allowlisted_action_type: "RESTORE_DB_POOL_SIZE"
  });

  // Step 6: Create action awaiting approval (NEVER AUTO-EXECUTED)
  db.actions = db.actions.filter(a => a.incident_id !== id);
  db.actions.push({
    id: db.actions.length + 1,
    incident_id: id,
    approved_by: null,
    status: "PENDING",
    result: `Awaiting SRE operator authorization. Human approval phrase required: "${report.remediation.safety_gating.approval_phrase_required}". Action: Restore DB_POOL_SIZE from 10 to 50.`,
    proposed_action: "Restore DB_POOL_SIZE from 10 to 50 and execute rolling restart of Checkout Service pods",
    risk_level: report.remediation.assessed_risk || "LOW",
    created_at: new Date().toISOString(),
    approved_at: null,
    executed_at: null,
    rejection_reason: null,
    validation_results: null
  });

  addAuditLog(id, 'RECOMMENDATION_CREATED', 'InvestigationOrchestrator', 'Generated remediation recommendation: Restore DB_POOL_SIZE from 10 to 50.', {
    proposed_action: "Restore DB_POOL_SIZE from 10 to 50",
    risk: report.remediation.assessed_risk || "LOW"
  });

  // Step 7: Persist drafted postmortem
  db.postmortems = db.postmortems.filter(p => p.incident_id !== id);
  db.postmortems.unshift({
    id: db.postmortems.length + 1,
    incident_id: id,
    summary: report.postmortem.executive_summary,
    root_cause: report.postmortem.root_cause_analysis,
    prevention: report.postmortem.preventive_actions.join('\n')
  });

  // Step 8: Transition to 'awaiting_approval'
  inc.status = "awaiting_approval";
  addTimeline(
    id,
    "awaiting_approval",
    "investigating",
    actor,
    `Multi-agent investigation completed (${(report.root_cause.primary_hypothesis.confidence * 100).toFixed(0)}% calibrated confidence). Root cause: ${report.root_cause.primary_hypothesis.title}. Remediation gated behind operator approval.`
  );

  logEvent('INVESTIGATION_COMPLETED', `Completed investigation for incident #${id}. State: awaiting_approval. Calibrated score: ${report.root_cause.primary_hypothesis.confidence}`);

  res.json({
    status: "completed",
    incident_state: inc.status,
    progress_pct: 100,
    current_step: "Awaiting human operator approval",
    steps_log: report.agent_pipeline.map(p => `[${p.agent_name}] ${p.summary}`),
    report,
    findings: {
      incident_id: id,
      culprit_deployment: report.change_analysis.culprit_deployment,
      culprit_changes: report.change_analysis.config_diff,
      recommendation: actionText,
      primary_hypothesis: report.root_cause.primary_hypothesis.title,
      calibrated_confidence: report.root_cause.primary_hypothesis.confidence,
      observed_facts_count: report.root_cause.observed_facts.length,
      ai_status: report.ai_status,
      provider: report.provider,
      model_used: report.model_name
    }
  });
});

app.get(['/incidents/:id/investigation', '/api/incidents/:id/investigation'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const rec = db.recommendations.find(r => r.incident_id === id);
  const evCount = db.evidences.filter(e => e.incident_id === id).length;
  const timelines = db.timelines.filter(t => t.incident_id === id);
  const isCompleted = ["awaiting_approval", "remediating", "validating", "resolved"].includes(inc.status);

  res.json({
    incident_id: id,
    status: isCompleted ? "completed" : (inc.status === "investigating" ? "running" : "idle"),
    incident_state: inc.status,
    progress_pct: isCompleted ? 100 : (inc.status === "investigating" ? 50 : 0),
    current_step: isCompleted ? "Awaiting human operator approval" : (
      inc.status === "investigating" ? "Analyzing telemetry and logs" : "Ready to investigate"
    ),
    steps_log: [
      `Current state: ${inc.status}`,
      `Correlated evidence count: ${evCount}`,
      `Recommendation available: ${rec ? 'Yes' : 'No'}`
    ],
    findings: {
      evidence_count: evCount,
      has_recommendation: !!rec,
      recommendation_action: rec ? rec.action : null
    },
    timeline: timelines,
    report: db.ai_investigations[id] || null
  });
});

app.get(['/incidents/:id/ai-investigation', '/api/incidents/:id/ai-investigation'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const report = db.ai_investigations[id];
  if (!report) {
    return res.status(404).json({ detail: `No AI investigation report generated for incident #${id} yet.` });
  }
  res.json(report);
});

// ---------------- TIMELINE & STATE TRANSITIONS ----------------
app.get(['/incidents/:id/timeline', '/api/incidents/:id/timeline'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }
  const timeline = db.timelines.filter(t => t.incident_id === id);
  res.json(timeline);
});

app.post(['/incidents/:id/transition', '/api/incidents/:id/transition'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const { to_state, actor = "Operator", message = "Manual state transition" } = req.body;
  const valid = ["detected", "investigating", "awaiting_approval", "remediating", "validating", "resolved", "failed"];
  const cleanTo = to_state.toLowerCase();

  if (!valid.includes(cleanTo)) {
    return res.status(400).json({ detail: `Invalid state '${to_state}'. Must be one of: ${valid.join(', ')}` });
  }

  const old = inc.status;
  inc.status = cleanTo;
  if (cleanTo === "resolved") {
    inc.resolved_at = new Date().toISOString();
  }

  addTimeline(id, cleanTo, old, actor, message);
  logEvent('STATE_TRANSITION', `Incident #${id}: ${old} -> ${cleanTo} by ${actor}`);

  const svc = db.services.find(s => s.id === inc.service_id);
  res.json({
    ...inc,
    service_name: svc ? svc.name : `service-${inc.service_id}`
  });
});

// GET /incidents/{id}
app.get(['/incidents/:id', '/api/incidents/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }
  const svc = db.services.find(s => s.id === inc.service_id);
  res.json({
    ...inc,
    service_name: svc ? svc.name : `service-${inc.service_id}`
  });
});

// GET /incidents/{id}/evidence
app.get(['/incidents/:id/evidence', '/api/incidents/:id/evidence'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 100);
  const typeFilter = (req.query.type as string || 'ALL').toUpperCase();

  // Retrieve persisted evidence chain or dynamically build and persist
  if (!db.persisted_evidence_chains[id]) {
    db.persisted_evidence_chains[id] = buildChronologicalEvidenceChain(id, db);
  }

  let chain = db.persisted_evidence_chains[id];
  if (typeFilter !== 'ALL') {
    chain = chain.filter(e => e.source_type.toUpperCase() === typeFilter);
  }

  res.json(chain.slice(skip, skip + limit));
});

// GET /incidents/{id}/root-cause
app.get(['/incidents/:id/root-cause', '/api/incidents/:id/root-cause'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  // Retrieve persisted root cause analysis or dynamically derive and persist
  if (!db.persisted_root_causes[id]) {
    db.persisted_root_causes[id] = deriveRootCauseAnalysis(id, db);
  }

  const rootCause = db.persisted_root_causes[id];
  res.json(rootCause);
});

// GET /incidents/{id}/metrics
app.get(['/incidents/:id/metrics', '/api/incidents/:id/metrics'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);
  const metric_name = req.query.metric_name as string;

  let metricList = db.metrics.filter(m => m.service_id === inc.service_id);
  if (metric_name) {
    metricList = metricList.filter(m => m.metric_name === metric_name);
  }

  metricList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(metricList.slice(skip, skip + limit));
});

// GET /incidents/{id}/recommendation
app.get(['/incidents/:id/recommendation', '/api/incidents/:id/recommendation', '/incidents/:id/recommendations', '/api/incidents/:id/recommendations'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const rec = db.recommendations
    .filter(r => r.incident_id === id)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!rec) {
    return res.status(404).json({ detail: `No recommendation found for incident ${req.params.id}.` });
  }
  res.json(rec);
});

// GET /recommendations
app.get(['/recommendations', '/api/recommendations'], (req: Request, res: Response) => {
  const incident_id = req.query.incident_id ? parseInt(req.query.incident_id as string, 10) : null;
  let items = db.recommendations;
  if (incident_id) {
    items = items.filter(r => r.incident_id === incident_id);
  }
  res.json(items);
});

// GET /incidents/{id}/postmortem
app.get(['/incidents/:id/postmortem', '/api/incidents/:id/postmortem'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  let pm = db.postmortems.find(p => p.incident_id === id);
  if (!pm) {
    // Generate draft on demand from persisted incident events and evidence
    pm = generateIncidentPostmortem(id, db, db.postmortems.length + 1);
    db.postmortems.push(pm);
  }
  res.json(pm);
});

// ---------------- RAG & KNOWLEDGE BASE ENDPOINTS ----------------

// GET /knowledge/indexing-status
app.get(['/knowledge/indexing-status', '/api/knowledge/indexing-status'], (req: Request, res: Response) => {
  res.json(ragRetriever.getIndexingStatus());
});

// GET /knowledge (list documents with metadata & chunk counts)
app.get(['/knowledge', '/api/knowledge', '/api/knowledge-base'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const typeFilter = req.query.type as string;

  let results = [...db.knowledge_documents];
  if (typeFilter && typeFilter.toUpperCase() !== 'ALL') {
    results = results.filter(d => d.type.toUpperCase() === typeFilter.toUpperCase());
  }

  const enriched = results.slice(skip, skip + limit).map(doc => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    source: doc.source,
    content: doc.content,
    chunks_count: doc.chunks ? doc.chunks.length : doc.chunks_count || 1,
    word_count: doc.word_count || doc.content.split(/\s+/).length,
    indexed_at: doc.indexed_at || new Date().toISOString()
  }));

  res.json(enriched);
});

// GET /knowledge/:id (document detail with chunks)
app.get(['/knowledge/:id', '/api/knowledge/:id', '/api/knowledge-base/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const doc = db.knowledge_documents.find(d => d.id === id);
  if (!doc) {
    return res.status(404).json({ detail: `Knowledge document with id ${req.params.id} not found.` });
  }

  if (!doc.chunks || doc.chunks.length === 0) {
    doc.chunks = chunkDocument(doc);
  }

  res.json({
    ...doc,
    chunks_count: doc.chunks.length,
    word_count: doc.word_count || doc.content.split(/\s+/).length
  });
});

// POST /knowledge/upload (upload and index operational documents)
app.post(['/knowledge/upload', '/api/knowledge/upload', '/api/knowledge-base/upload'], (req: Request, res: Response) => {
  const { title, type = 'RUNBOOK', content, source = 'manual://upload', filename } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'title' is required." });
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'content' is required and must not be empty." });
  }

  const newId = db.knowledge_documents.length > 0
    ? Math.max(...db.knowledge_documents.map(d => d.id)) + 1
    : 1;

  const validTypes = ['RUNBOOK', 'TROUBLESHOOTING', 'ARCHITECTURE', 'CHANGE_RECORD', 'POSTMORTEM', 'POLICY', 'PROCEDURE'];
  const docType = validTypes.includes(type.toUpperCase()) ? type.toUpperCase() : 'RUNBOOK';

  const newDoc: KnowledgeDocument = {
    id: newId,
    title: title.trim(),
    type: docType,
    source: source || (filename ? `file://${filename}` : `manual://doc-${newId}.md`),
    content: content.trim()
  };

  db.knowledge_documents.push(newDoc);
  refreshRAGIndex();

  logEvent('DOCUMENT_UPLOADED', `Uploaded and indexed operational document #${newId}: "${newDoc.title}" (${newDoc.chunks_count} chunks)`);

  res.status(201).json({
    document: newDoc,
    indexing_status: ragRetriever.getIndexingStatus()
  });
});

// DELETE /knowledge/:id
app.delete(['/knowledge/:id', '/api/knowledge/:id', '/api/knowledge-base/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const idx = db.knowledge_documents.findIndex(d => d.id === id);
  if (idx === -1) {
    return res.status(404).json({ detail: `Knowledge document with id ${req.params.id} not found.` });
  }

  const removed = db.knowledge_documents.splice(idx, 1)[0];
  refreshRAGIndex();
  logEvent('DOCUMENT_DELETED', `Deleted document #${id}: "${removed.title}"`);

  res.json({
    message: `Document #${id} deleted successfully.`,
    indexing_status: ragRetriever.getIndexingStatus()
  });
});

// POST /knowledge/search (BM25 keyword/passage retrieval)
app.post(['/knowledge/search', '/api/knowledge/search', '/api/knowledge-base/search'], (req: Request, res: Response) => {
  const { query, top_k = 5, type = 'ALL' } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.json({
      query: "",
      results_count: 0,
      algorithm: "BM25 (Ranked Lexical)",
      passages: [],
      safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
    });
  }

  const k = Math.min(Math.max(parseInt(top_k as string, 10) || 5, 1), 20);
  const passages = ragRetriever.search(query.trim(), k, type);

  res.json({
    query: query.trim(),
    results_count: passages.length,
    algorithm: "BM25 (Ranked Lexical)",
    passages,
    safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
  });
});

// GET /incidents/:id/rag-context (retrieve relevant operational documents for active incident)
app.get(['/incidents/:id/rag-context', '/api/incidents/:id/rag-context'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  // Construct targeted retrieval query from incident title and symptom
  const query = `${inc.title} connection pool HikariCP starvation timeout rollback`;
  const passages = ragRetriever.search(query, 4);

  res.json({
    incident_id: id,
    incident_title: inc.title,
    query_used: query,
    algorithm: "BM25 (Ranked Lexical)",
    passages,
    safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
  });
});

// GET /actions
app.get(['/actions', '/api/actions', '/api/remediation'], (req: Request, res: Response) => {
  const incident_id = req.query.incident_id ? parseInt(req.query.incident_id as string, 10) : null;
  let items = db.actions;
  if (incident_id) {
    items = items.filter(a => a.incident_id === incident_id);
  }
  res.json(items);
});

// GET /audit-logs
app.get(['/audit-logs', '/api/audit-logs'], (req: Request, res: Response) => {
  const incident_id = req.query.incident_id ? parseInt(req.query.incident_id as string, 10) : null;
  let items = db.audit_logs;
  if (incident_id) {
    items = items.filter(a => a.incident_id === incident_id);
  }
  res.json(items);
});

// GET /incidents/:id/audit-logs
app.get(['/incidents/:id/audit-logs', '/api/incidents/:id/audit-logs'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const items = db.audit_logs.filter(a => a.incident_id === id);
  res.json(items);
});

// Shared server-side approval handler with strict security checks
function handleApproveRemediation(incidentId: number, approvedBy?: string, confirmationPhrase?: string) {
  const inc = db.incidents.find(i => i.id === incidentId);
  if (!inc) {
    return { status: 404, error: `Incident with id ${incidentId} not found.` };
  }

  // Safety Requirement 3: Operator identification
  if (!approvedBy || typeof approvedBy !== 'string' || approvedBy.trim().length === 0) {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', 'UNKNOWN', "Authorization rejected: Missing operator identity 'approved_by'.");
    return { status: 400, error: "Safety violation: Operator identity 'approved_by' is required to authorize remediation." };
  }

  const cleanOperator = approvedBy.trim();

  // Safety Requirement: Human confirmation phrase check (if provided, must match)
  if (confirmationPhrase !== undefined && confirmationPhrase.trim().toUpperCase() !== "APPROVE REMEDIATION") {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', cleanOperator, "Authorization rejected: Invalid or missing confirmation phrase.");
    return { status: 400, error: "Human approval requires exact confirmation phrase: 'APPROVE REMEDIATION'" };
  }

  // Safety Requirement 4: Server-side Incident State Validation
  if (inc.status === "resolved") {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', cleanOperator, "Approval rejected: Incident is already resolved.");
    return { status: 400, error: `Cannot approve remediation: Incident #${incidentId} is already resolved.` };
  }

  if (inc.status === "remediating" || inc.status === "validating") {
    return { status: 409, error: `Remediation is already approved and underway for Incident #${incidentId}. Duplicate approval prevented.` };
  }

  const validPreStates = ["detected", "investigating", "awaiting_approval"];
  if (!validPreStates.includes(inc.status.toLowerCase())) {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', cleanOperator, `Approval rejected: Invalid incident state '${inc.status}'.`);
    return { status: 400, error: `Cannot approve remediation: Incident #${incidentId} is in invalid state '${inc.status}'.` };
  }

  // Safety Requirement 4: Recommendation Validation
  const rec = db.recommendations.find(r => r.incident_id === incidentId);
  if (!rec) {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', cleanOperator, "Approval rejected: No recommendation exists for incident.");
    return { status: 400, error: `No recommendation found for Incident #${incidentId}. Run investigation first.` };
  }

  // Safety Requirement 4: Server-side Action Allowlist Validation
  const actionText = rec.proposed_action || rec.action;
  if (!isActionAllowlisted(actionText)) {
    addAuditLog(incidentId, 'APPROVAL_REJECTED', cleanOperator, `Approval rejected: Action '${actionText}' is not in safe simulation allowlist.`);
    return { status: 403, error: `Safety violation: Proposed action is not permit-listed in safe simulation catalog.` };
  }

  // Find or create Action entry
  let action = db.actions.find(a => a.incident_id === incidentId);
  if (!action) {
    action = {
      id: db.actions.length + 1,
      incident_id: incidentId,
      approved_by: null,
      status: "PENDING",
      result: null,
      proposed_action: actionText,
      risk_level: rec.risk_level || "LOW",
      created_at: new Date().toISOString(),
      approved_at: null,
      executed_at: null,
      rejection_reason: null,
      validation_results: null
    };
    db.actions.push(action);
  }

  // Safety Requirement 7: Prevent duplicate execution
  if (action.status === "SIMULATED") {
    return { status: 409, error: `Remediation action has already been executed for Incident #${incidentId}.` };
  }

  // Update Action & Recommendation
  action.status = "APPROVED";
  action.approved_by = cleanOperator;
  action.approved_at = new Date().toISOString();
  action.result = `Remediation authorized by ${cleanOperator}. Ready to safely simulate DB_POOL_SIZE restoration (10 -> 50) in sandbox.`;
  rec.approval_status = "APPROVED";

  // State Transition: -> remediating
  const oldState = inc.status;
  inc.status = "remediating";
  addTimeline(incidentId, "remediating", oldState, cleanOperator, `Remediation approved by ${cleanOperator}. Sandbox execution queued.`);

  // Safety Requirement 6: Audit Log Recording
  addAuditLog(
    incidentId,
    'APPROVAL_GRANTED',
    cleanOperator,
    `Remediation action approved: '${actionText}'. Preconditions verified. Ready for safe synthetic simulation.`,
    { proposed_action: actionText, risk: rec.risk_level, incident_state: inc.status }
  );

  logEvent('ACTION_APPROVED', `Action for incident #${incidentId} approved by ${cleanOperator}`);
  return { status: 200, action, incident: inc, recommendation: rec };
}

// Shared server-side simulation execution handler with independent safety checks
function handleSimulateRemediation(incidentId: number) {
  const inc = db.incidents.find(i => i.id === incidentId);
  if (!inc) {
    return { status: 404, error: `Incident with id ${incidentId} not found.` };
  }

  const action = db.actions.find(a => a.incident_id === incidentId);
  if (!action) {
    return { status: 404, error: `No remediation action found for incident #${incidentId}.` };
  }

  // Safety Requirement 7: Prevent duplicate execution
  if (action.status === "SIMULATED" || inc.status === "resolved") {
    return { status: 409, error: `Remediation action has already been executed for Incident #${incidentId}. Duplicate execution rejected.` };
  }

  // Safety Requirement 5: Independent Server-Side Verification
  // 1. Must be approved by human operator
  if (action.status !== "APPROVED") {
    addAuditLog(incidentId, 'VALIDATION_FAILED', 'SecurityEnforcer', `Execution blocked: Action #${action.id} has status '${action.status}', not APPROVED.`);
    return { status: 400, error: "Safety guardrail: Action cannot be executed without prior human SRE operator approval." };
  }

  // 2. Incident must be in 'remediating' state
  if (inc.status !== "remediating") {
    addAuditLog(incidentId, 'VALIDATION_FAILED', 'SecurityEnforcer', `Execution blocked: Incident #${incidentId} is in '${inc.status}', not 'remediating'.`);
    return { status: 400, error: `Safety guardrail: Incident #${incidentId} is in '${inc.status}'. Must be in 'remediating' state.` };
  }

  // 3. Action allowlist re-check
  const actionText = action.proposed_action || "Restore DB_POOL_SIZE from 10 to 50";
  if (!isActionAllowlisted(actionText)) {
    addAuditLog(incidentId, 'VALIDATION_FAILED', 'SecurityEnforcer', `Execution blocked: Action '${actionText}' is not in allowlist.`);
    return { status: 403, error: `Safety violation: Execution not permitted for non-allowlisted action.` };
  }

  // Step 1: Transition to 'validating'
  inc.status = "validating";
  addTimeline(inc.id, "validating", "remediating", "SimulationRunner", "Applying synthetic configuration update (DB_POOL_SIZE=50). Validating recovery telemetry against SLA criteria.");
  addAuditLog(incidentId, 'SIMULATION_STARTED', 'SimulationRunner', "Started synthetic remediation simulation in sandbox.");

  // Step 2: Record BEFORE metrics
  const before_metrics = {
    db_pool_size: 10,
    pool_utilization_pct: 100.0,
    latency_p95_ms: 3450.0,
    error_rate_pct: 18.5,
    request_volume_rps: 850.0
  };

  // Step 3: Update ONLY synthetic configuration and telemetry (NO real infrastructure execution)
  // Synthetic deployment update
  const culpritDep = db.deployments.find(d => d.service_id === inc.service_id && d.version.includes('rc1'));
  if (culpritDep) {
    culpritDep.changes = "commit 3b1e94a: [SIMULATED ROLLBACK] Restore DB_POOL_SIZE=50. Rolling pod restart completed.";
  }

  // Synthetic telemetry update (nominal after-metrics)
  const after_metrics = {
    db_pool_size: 50,
    pool_utilization_pct: 36.0,
    latency_p95_ms: 42.5,
    error_rate_pct: 0.02,
    request_volume_rps: 850.0
  };

  const now = new Date().toISOString();
  db.metrics.unshift(
    { id: db.metrics.length + 1, service_id: inc.service_id, timestamp: now, metric_name: "latency_p95", value: after_metrics.latency_p95_ms },
    { id: db.metrics.length + 2, service_id: inc.service_id, timestamp: now, metric_name: "error_rate", value: after_metrics.error_rate_pct },
    { id: db.metrics.length + 3, service_id: inc.service_id, timestamp: now, metric_name: "pool_utilization", value: after_metrics.pool_utilization_pct },
    { id: db.metrics.length + 4, service_id: inc.service_id, timestamp: now, metric_name: "request_volume", value: after_metrics.request_volume_rps }
  );

  // Step 4: Run validation against predefined recovery thresholds
  const recoveryThresholds = {
    latency_p95_target: 50.0,
    error_rate_target: 0.1,
    pool_utilization_target: 80.0
  };

  const checks = [
    {
      name: "Transaction Latency p95",
      target: "<= 50.0 ms",
      observed: `${after_metrics.latency_p95_ms.toFixed(1)} ms`,
      passed: after_metrics.latency_p95_ms <= recoveryThresholds.latency_p95_target
    },
    {
      name: "HTTP 5xx Error Rate",
      target: "<= 0.1 %",
      observed: `${after_metrics.error_rate_pct.toFixed(2)} %`,
      passed: after_metrics.error_rate_pct <= recoveryThresholds.error_rate_target
    },
    {
      name: "Database Pool Saturation",
      target: "<= 80.0 %",
      observed: `${after_metrics.pool_utilization_pct.toFixed(1)} %`,
      passed: after_metrics.pool_utilization_pct <= recoveryThresholds.pool_utilization_target
    }
  ];

  const allChecksPassed = checks.every(c => c.passed);

  const validationResults = {
    passed: allChecksPassed,
    validated_at: now,
    before_metrics,
    after_metrics,
    thresholds: recoveryThresholds,
    checks
  };

  // Step 5: Mark incident resolved ONLY when validation passes
  if (allChecksPassed) {
    inc.status = "resolved";
    inc.resolved_at = now;
    addTimeline(
      inc.id,
      "resolved",
      "validating",
      "AutomatedRecoveryValidator",
      `Validation checks passed. Latency: ${after_metrics.latency_p95_ms}ms (target <=50ms), Errors: ${after_metrics.error_rate_pct}% (target <=0.1%), Pool: ${after_metrics.pool_utilization_pct}% (target <=80%). Incident marked as resolved.`
    );

    // Update target service to HEALTHY
    const svc = db.services.find(s => s.id === inc.service_id);
    if (svc) {
      svc.status = "HEALTHY";
    }

    action.status = "SIMULATED";
    action.executed_at = now;
    action.validation_results = validationResults;
    action.result = `=== [SIMULATED REMEDIATION COMPLETE & VALIDATED] ===\n1. Reconfigured synthetic DB_POOL_SIZE: 10 -> 50.\n2. Rolling pod drain and restart simulation completed.\n3. Telemetry recovery validated across 3 SLA thresholds:\n   • Latency p95: ${before_metrics.latency_p95_ms}ms -> ${after_metrics.latency_p95_ms}ms (PASS <= 50.0ms)\n   • Error rate: ${before_metrics.error_rate_pct}% -> ${after_metrics.error_rate_pct}% (PASS <= 0.1%)\n   • Pool saturation: ${before_metrics.pool_utilization_pct}% -> ${after_metrics.pool_utilization_pct}% (PASS <= 80.0%)\n4. Incident #${incidentId} officially resolved.`;

    const rec = db.recommendations.find(r => r.incident_id === incidentId);
    if (rec) {
      rec.approval_status = "EXECUTED";
    }

    // Refresh persisted evidence & root-cause to reflect resolved status
    db.persisted_evidence_chains[incidentId] = buildChronologicalEvidenceChain(incidentId, db);
    db.persisted_root_causes[incidentId] = deriveRootCauseAnalysis(incidentId, db);

    addAuditLog(incidentId, 'VALIDATION_PASSED', 'AutomatedRecoveryValidator', "Predefined recovery thresholds satisfied. Incident marked as resolved.", validationResults);
    addAuditLog(incidentId, 'REMEDIATION_EXECUTED', 'SimulationRunner', "Synthetic remediation completed. Restored DB_POOL_SIZE=50. Zero real infrastructure touched.");

    logEvent('ACTION_SIMULATED', `Simulated execution completed for incident #${incidentId}. Incident resolved.`);
    return { status: 200, action, incident: inc, validation: validationResults };
  } else {
    inc.status = "failed";
    action.status = "FAILED";
    action.validation_results = validationResults;
    addAuditLog(incidentId, 'VALIDATION_FAILED', 'AutomatedRecoveryValidator', "Recovery validation failed.", validationResults);
    return { status: 500, error: "Validation failed to satisfy recovery thresholds.", validation: validationResults };
  }
}

// POST /incidents/{id}/approve (User-requested standard endpoint)
app.post(['/incidents/:id/approve', '/api/incidents/:id/approve'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const approvedBy = req.body?.approved_by ?? req.body?.operator ?? req.body?.user;
  const confirmationPhrase = req.body?.confirmation_phrase ?? req.body?.confirmationPhrase;
  const outcome = handleApproveRemediation(id, approvedBy, confirmationPhrase);
  if (outcome.error) {
    return res.status(outcome.status).json({ detail: outcome.error, error: outcome.error });
  }
  res.status(outcome.status).json(outcome.action);
});

// POST /incidents/{id}/simulate-fix (User-requested standard endpoint)
app.post(['/incidents/:id/simulate-fix', '/api/incidents/:id/simulate-fix'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const outcome = handleSimulateRemediation(id);
  if (outcome.error) {
    return res.status(outcome.status).json({ detail: outcome.error, validation: outcome.validation });
  }
  res.status(outcome.status).json(outcome.action);
});

// POST /actions/{id}/approve (Backward compatibility)
app.post(['/actions/:id/approve', '/api/actions/:id/approve', '/api/remediation/:id/approve'], (req: Request, res: Response) => {
  const actionId = parseInt(req.params.id, 10);
  const action = db.actions.find(a => a.id === actionId);
  if (!action) {
    return res.status(404).json({ detail: `Action with id ${req.params.id} not found.` });
  }
  const { approved_by = "On-Call SRE", confirmation_phrase } = req.body;
  const outcome = handleApproveRemediation(action.incident_id, approved_by, confirmation_phrase);
  if (outcome.error) {
    return res.status(outcome.status).json({ detail: outcome.error });
  }
  res.status(outcome.status).json(outcome.action);
});

// POST /actions/{id}/simulate (Backward compatibility)
app.post(['/actions/:id/simulate', '/api/actions/:id/simulate', '/api/remediation/:id/simulate-execution'], (req: Request, res: Response) => {
  const actionId = parseInt(req.params.id, 10);
  const action = db.actions.find(a => a.id === actionId);
  if (!action) {
    return res.status(404).json({ detail: `Action with id ${req.params.id} not found.` });
  }
  const outcome = handleSimulateRemediation(action.incident_id);
  if (outcome.error) {
    return res.status(outcome.status).json({ detail: outcome.error, validation: outcome.validation });
  }
  res.status(outcome.status).json(outcome.action);
});

// POST /incidents/{id}/cancel-remediation (Safety requirement 8: Cancel or safe reset path)
app.post(['/incidents/:id/cancel-remediation', '/api/incidents/:id/cancel-remediation', '/actions/:id/reject', '/api/actions/:id/reject'], (req: Request, res: Response) => {
  const paramId = parseInt(req.params.id, 10);
  const { operator = "On-Call SRE", reason = "Cancelled by operator" } = req.body;

  // Search by incident id or action id
  let inc = db.incidents.find(i => i.id === paramId);
  let action = db.actions.find(a => a.incident_id === paramId);

  if (!inc) {
    action = db.actions.find(a => a.id === paramId);
    if (action) {
      inc = db.incidents.find(i => i.id === action?.incident_id);
    }
  }

  if (!inc) {
    return res.status(404).json({ detail: `Incident or action with id ${paramId} not found.` });
  }

  if (action) {
    action.status = "REJECTED";
    action.rejection_reason = reason;
    action.result = `Remediation cancelled by ${operator}: ${reason}`;
  }

  const rec = db.recommendations.find(r => r.incident_id === inc!.id);
  if (rec) {
    rec.approval_status = "REJECTED";
  }

  const old = inc.status;
  inc.status = "awaiting_approval";
  addTimeline(inc.id, "awaiting_approval", old, operator, `Remediation cancelled/rejected by ${operator}: ${reason}`);
  addAuditLog(inc.id, 'ACTION_CANCELLED', operator, `Remediation cancelled: ${reason}`, { previous_state: old });

  res.json({
    message: "Remediation cancelled. Incident returned to awaiting_approval.",
    incident: inc,
    action
  });
});

// POST /postmortems/generate/{id}
app.post(['/postmortems/generate/:id', '/api/postmortems/generate/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const existingIdx = db.postmortems.findIndex(p => p.incident_id === id);
  const pmId = existingIdx >= 0 ? db.postmortems[existingIdx].id : db.postmortems.length + 1;

  // Generate comprehensive, evidence-backed postmortem from persisted database entities
  const newPm = generateIncidentPostmortem(id, db, pmId);

  if (existingIdx >= 0) {
    db.postmortems[existingIdx] = newPm;
  } else {
    db.postmortems.unshift(newPm);
  }

  addAuditLog(id, 'POSTMORTEM_GENERATED', 'PostmortemEngine', `Generated comprehensive postmortem report for incident #${id}.`);
  logEvent('POSTMORTEM_GENERATED', `Generated postmortem for incident #${id}`);
  res.json(newPm);
});

// GET /postmortems
app.get(['/postmortems', '/api/postmortems'], (req: Request, res: Response) => {
  res.json(db.postmortems);
});

// GET /postmortems/:id/export
app.get(['/postmortems/:id/export', '/api/postmortems/:id/export'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  let pm = db.postmortems.find(p => p.id === id || p.incident_id === id);
  if (!pm) {
    const inc = db.incidents.find(i => i.id === id);
    if (inc) {
      pm = generateIncidentPostmortem(id, db, db.postmortems.length + 1);
      db.postmortems.push(pm);
    } else {
      return res.status(404).json({ detail: `Postmortem with id ${req.params.id} not found.` });
    }
  }

  const format = (req.query.format as string || 'markdown').toLowerCase();
  if (format === 'markdown' || format === 'md') {
    const md = formatPostmortemToMarkdown(pm);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="postmortem-INC-${pm.incident_id}.md"`);
    return res.send(md);
  }

  res.json(pm);
});

// ---------------- DETERMINISTIC SIMULATION ENGINE ENDPOINTS ----------------
function applyScenario(scenario: 'incident' | 'healthy') {
  const now = new Date();
  const subMinutes = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  if (scenario === 'healthy') {
    for (const s of db.services) {
      s.status = 'HEALTHY';
    }

    for (const inc of db.incidents) {
      if (inc.status !== 'resolved') {
        const old = inc.status;
        inc.status = 'resolved';
        inc.resolved_at = now.toISOString();
        addTimeline(inc.id, 'resolved', old, 'SimulationEngine', 'Healthy baseline restored.');
      }
    }

    db.deployments = [
      {
        id: 1,
        service_id: 2,
        version: "v2.4.0",
        changes: "commit 3b1e94a: chore: standard health checks & nominal config (DB_POOL_SIZE=50)",
        timestamp: subHours(2)
      }
    ];

    db.metrics = [];
    let mId = 1;
    for (let i = 15; i >= 0; i--) {
      const ts = subMinutes(i * 2);
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "latency_p95", value: 45.0 + (i % 3) * 1.5 });
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "error_rate", value: 0.02 });
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "request_volume", value: 250.0 + (i % 5) * 4 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "latency_p95", value: 38.0 + (i % 3) * 1.2 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "error_rate", value: 0.01 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "pool_utilization", value: 36.0 + (i % 4) * 2.0 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "request_volume", value: 250.0 + (i % 5) * 4 });
      db.metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "pool_utilization", value: 36.0 + (i % 4) * 2.0 });
      db.metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "latency_p95", value: 12.0 + (i % 2) * 0.8 });
    }

    for (const inc of db.incidents) {
      db.persisted_evidence_chains[inc.id] = buildChronologicalEvidenceChain(inc.id, db);
      db.persisted_root_causes[inc.id] = deriveRootCauseAnalysis(inc.id, db);
    }

    logEvent('SIMULATION_SET', 'Simulation state set to HEALTHY baseline.');
  } else {
    db = getInitialDatabase();
    refreshRAGIndex();
    logEvent('SIMULATION_SET', 'Simulation state set to INCIDENT (DB Pool Exhaustion).');
  }
}

app.post(['/simulation/start', '/api/simulation/start'], (req: Request, res: Response) => {
  const scenario = (req.body.scenario || 'incident').toLowerCase();
  if (scenario !== 'incident' && scenario !== 'healthy') {
    return res.status(400).json({ detail: "Scenario must be either 'incident' or 'healthy'." });
  }

  applyScenario(scenario as 'incident' | 'healthy');

  const activeInc = db.incidents.find(i => i.status !== 'resolved' && i.status !== 'failed');
  res.json({
    simulation_mode: "SYNTHETIC_SIMULATOR",
    state: scenario.toUpperCase(),
    active_incident_id: activeInc ? activeInc.id : null,
    active_incident_title: activeInc ? activeInc.title : null,
    db_pool_size: scenario === 'incident' ? 10 : 50,
    db_pool_utilization_pct: scenario === 'incident' ? 100.0 : 36.0,
    traffic_rps: scenario === 'incident' ? 850 : 250,
    latency_p95_ms: scenario === 'incident' ? 3450.0 : 45.0,
    error_rate_pct: scenario === 'incident' ? 18.5 : 0.02,
    active_version: scenario === 'incident' ? "v2.4.1-rc1" : "v2.4.0",
    is_synthetic: true
  });
});

app.get(['/simulation/status', '/api/simulation/status'], (req: Request, res: Response) => {
  const activeInc = db.incidents.find(i => i.status !== 'resolved' && i.status !== 'failed');
  const isIncident = !!activeInc;

  res.json({
    simulation_mode: "SYNTHETIC_SIMULATOR",
    state: isIncident ? "INCIDENT" : "HEALTHY",
    active_incident_id: activeInc ? activeInc.id : null,
    active_incident_title: activeInc ? activeInc.title : null,
    db_pool_size: isIncident ? 10 : 50,
    db_pool_utilization_pct: isIncident ? 100.0 : 36.0,
    traffic_rps: isIncident ? 850 : 250,
    latency_p95_ms: isIncident ? 3450.0 : 45.0,
    error_rate_pct: isIncident ? 18.5 : 0.02,
    active_version: isIncident ? "v2.4.1-rc1" : "v2.4.0",
    services_count: db.services.length,
    is_synthetic: true
  });
});

app.get(['/simulation/events', '/api/simulation/events'], (req: Request, res: Response) => {
  const events = [];

  for (const d of db.deployments) {
    events.push({
      type: "DEPLOYMENT",
      timestamp: d.timestamp,
      title: `Deployment ${d.version}`,
      detail: d.changes,
      service_id: d.service_id,
      is_synthetic: true
    });
  }

  for (const l of db.log_events) {
    events.push({
      type: "LOG",
      timestamp: l.timestamp,
      title: `[${l.level}] in Service #${l.service_id}`,
      detail: l.message,
      service_id: l.service_id,
      is_synthetic: true
    });
  }

  for (const i of db.incidents) {
    events.push({
      type: "INCIDENT",
      timestamp: i.created_at,
      title: `Incident #${i.id} (${i.severity})`,
      detail: i.title,
      service_id: i.service_id,
      is_synthetic: true
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(events);
});

app.post(['/simulation/reset', '/api/simulation/reset', '/reset-synthetic-data', '/api/reset-synthetic-data'], (req: Request, res: Response) => {
  applyScenario('healthy');
  res.json({ message: "Simulation reset to healthy baseline (DB_POOL_SIZE=50)." });
});

// ---------------- VITE DEV SERVER MIDDLEWARE & LAUNCH ----------------
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logEvent('BOOT_READY', `Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
