// 10 Core Database Models matching SQLite / SQLAlchemy schemas

export interface Service {
  id: number;
  name: string;
  environment: string;
  owner: string;
  status: string; // HEALTHY, DEGRADED, OUTAGE
}

export interface Incident {
  id: number;
  title: string;
  severity: string; // CRITICAL, HIGH, MEDIUM, LOW
  // 7 States: detected, investigating, awaiting_approval, remediating, validating, resolved, failed
  status: 'detected' | 'investigating' | 'awaiting_approval' | 'remediating' | 'validating' | 'resolved' | 'failed' | string;
  service_id: number;
  created_at: string;
  resolved_at: string | null;
  service_name?: string;
}

export interface IncidentTimeline {
  id: number;
  incident_id: number;
  from_state: string | null;
  to_state: string;
  actor: string;
  message: string;
  timestamp: string;
}

export interface LogEvent {
  id: number;
  service_id: number;
  timestamp: string;
  level: string; // INFO, WARN, ERROR, FATAL
  message: string;
}

export interface Deployment {
  id: number;
  service_id: number;
  version: string;
  changes: string;
  timestamp: string;
}

export interface Metric {
  id: number;
  service_id: number;
  timestamp: string;
  metric_name: string; // latency_p95, error_rate, pool_utilization, request_volume
  value: number;
}

export interface DocumentChunk {
  id: string;
  document_id: number;
  document_title: string;
  source: string;
  type: string;
  section: string;
  content: string;
  score?: number;
  relevance_excerpt?: string;
  word_count?: number;
}

export interface KnowledgeDocument {
  id: number;
  title: string;
  type: string; // RUNBOOK, TROUBLESHOOTING, ARCHITECTURE, CHANGE_RECORD, POSTMORTEM, POLICY, PROCEDURE
  content: string;
  source: string;
  chunks_count?: number;
  word_count?: number;
  indexed_at?: string;
  chunks?: DocumentChunk[];
}

export interface IndexingStatus {
  total_documents: number;
  total_chunks: number;
  vocabulary_size: number;
  avg_chunk_length: number;
  algorithm: string;
  last_indexed: string;
  status: string;
}

export interface RAGSearchResult {
  query: string;
  results_count: number;
  algorithm: string;
  passages: DocumentChunk[];
  incident_context?: string;
}

export interface Evidence {
  id: number;
  incident_id: number;
  stable_id: string;
  source_type: 'DEPLOYMENT' | 'LOG' | 'METRIC' | 'RUNBOOK' | 'HISTORICAL_INCIDENT' | 'ALERT' | string;
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

export interface Recommendation {
  id: number;
  incident_id: number;
  proposed_action: string;
  action: string; // alias for proposed_action
  reason_and_supporting_evidence: string;
  expected_impact: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk: string; // alias for risk_level
  preconditions: string[];
  rollback_plan: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  confidence: number;
  action_command?: string;
  allowlisted_action_type?: string;
}

export interface ValidationMetrics {
  db_pool_size: number;
  pool_utilization_pct: number;
  latency_p95_ms: number;
  error_rate_pct: number;
  request_volume_rps?: number;
}

export interface ValidationComparison {
  passed: boolean;
  validated_at: string;
  before_metrics: ValidationMetrics;
  after_metrics: ValidationMetrics;
  thresholds: {
    latency_p95_target: number;
    error_rate_target: number;
    pool_utilization_target: number;
  };
  checks: Array<{
    name: string;
    target: string;
    observed: string;
    passed: boolean;
  }>;
}

export interface Action {
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
  validation_results?: ValidationComparison | null;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  incident_id: number;
  action_type:
    | 'RECOMMENDATION_CREATED'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_REJECTED'
    | 'SIMULATION_STARTED'
    | 'VALIDATION_PASSED'
    | 'VALIDATION_FAILED'
    | 'REMEDIATION_EXECUTED'
    | 'SIMULATION_RESET'
    | 'ACTION_CANCELLED';
  operator: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface PostmortemTimelineEntry {
  timestamp: string;
  state: string;
  actor: string;
  description: string;
}

export interface PostmortemPreventiveAction {
  id: string;
  action: string;
  priority: 'P0' | 'P1' | 'P2';
  owner: string;
  deadline: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface PostmortemAlternativeHypothesis {
  id: string;
  title: string;
  likelihood: string;
  reason_rejected_or_unsupported: string;
}

export interface PostmortemSupportingEvidence {
  id: string;
  title: string;
  excerpt: string;
  source_ref: string;
}

export interface Postmortem {
  id: number;
  incident_id: number;
  title?: string;
  summary: string;
  executive_summary?: string;
  root_cause: string;
  root_cause_details?: {
    summary: string;
    primary_hypothesis: string;
    alternative_hypotheses: PostmortemAlternativeHypothesis[];
    supporting_evidence: PostmortemSupportingEvidence[];
  };
  prevention: string;
  severity?: string;
  affected_services?: string[];
  investigation_status?: 'INCOMPLETE' | 'FAILED' | 'RESOLVED';
  timestamps?: {
    start: string;
    detection: string;
    recovery: string | null;
    duration_minutes: number;
  };
  customer_impact?: {
    summary: string;
    affected_users_estimate: string;
    synthetic_label: string;
    is_synthetic: boolean;
  };
  timeline?: PostmortemTimelineEntry[];
  resolution_and_approval?: {
    proposed_action: string;
    approved_by: string | null;
    approved_at: string | null;
    approval_phrase?: string;
    allowlist_verified: boolean;
    executed_at: string | null;
    execution_result: string;
  };
  before_after_metrics?: {
    before: {
      latency_p95: string;
      error_rate: string;
      pool_utilization: string;
      request_volume: string;
    };
    after: {
      latency_p95: string;
      error_rate: string;
      pool_utilization: string;
      request_volume: string;
    };
    recovery_validated: boolean;
  };
  what_went_well?: string[];
  what_needs_improvement?: string[];
  preventive_actions?: PostmortemPreventiveAction[];
  linked_resources?: {
    runbooks: Array<{ id: number; title: string; source: string; excerpt: string }>;
    historical_incidents: Array<{ id: string; title: string; similarity: string }>;
  };
  generated_at?: string;
  ai_enhanced?: boolean;
  ai_provider?: string;
}

export interface HealthCheck {
  status: string;
  timestamp: string;
  database: string;
  active_incidents: number;
  services_count: number;
  version: string;
  environment?: string;
  synthetic_mode: boolean;
}

export interface SimulationStatus {
  simulation_mode: string;
  state: 'HEALTHY' | 'INCIDENT';
  active_incident_id: number | null;
  active_incident_title: string | null;
  db_pool_size: number;
  db_pool_utilization_pct: number;
  traffic_rps: number;
  latency_p95_ms: number;
  error_rate_pct: number;
  active_version: string;
  services_count?: number;
  is_synthetic: boolean;
  description?: string;
}

export interface SimulationEvent {
  type: 'DEPLOYMENT' | 'LOG' | 'INCIDENT';
  timestamp: string;
  title: string;
  detail: string;
  service_id: number;
  is_synthetic: boolean;
}

export interface InvestigationStatus {
  incident_id: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | string;
  incident_state: string;
  progress_pct: number;
  current_step: string;
  steps_log: string[];
  findings: Record<string, any>;
  timeline: IncidentTimeline[];
  report?: any;
}

export * from './ai/types';

