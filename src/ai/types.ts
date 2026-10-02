/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentRole =
  | 'triage'
  | 'log_analysis'
  | 'change_analysis'
  | 'knowledge'
  | 'root_cause'
  | 'remediation'
  | 'validation'
  | 'postmortem';

export interface ObservedFact {
  id: string;
  category: 'METRIC' | 'LOG' | 'DEPLOYMENT' | 'HISTORICAL_INCIDENT' | 'RUNBOOK';
  title: string;
  detail: string;
  source: string;
  is_verified_fact: true; // Distinguishes ground truth from AI hypothesis
  timestamp?: string;
  telemetry_value?: string | number;
}

export interface ConfidenceBreakdown {
  formula: string;
  deployment_score: number;     // 0 - 30 pts (Weight: 0.30)
  log_score: number;            // 0 - 25 pts (Weight: 0.25)
  metric_score: number;         // 0 - 25 pts (Weight: 0.25)
  knowledge_score: number;      // 0 - 20 pts (Weight: 0.20)
  uncertainty_penalty: number;  // 0 - 20 pts deduction
  total_score: number;          // Clamped 0.05 to 0.98
  scoring_rationale: string[];
}

export interface Hypothesis {
  id: string;
  title: string;
  is_primary: boolean;
  likelihood: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNLIKELY';
  summary: string;
  failure_mechanism: string;
  testable_prediction: string;
  supporting_facts: string[]; // references to ObservedFact.id
  confidence: number;         // Calibrated 0.0 - 1.0 from explicit scoring
  confidence_breakdown: ConfidenceBreakdown;
  uncertainty_factors: string[];
  status: 'SUPPORTED_BY_EVIDENCE' | 'PLAUSIBLE_ALTERNATIVE' | 'REFUTED_BY_EVIDENCE';
}

export interface FiveFactorAnalysis {
  db_timeout_frequency: {
    observed: string;
    threshold_breached: boolean;
    analysis: string;
  };
  pool_size_reduction: {
    observed: string; // e.g. "DB_POOL_SIZE 50 -> 10 in v2.4.1-rc1"
    commit_reference: string;
    analysis: string;
  };
  increased_checkout_traffic: {
    observed: string; // e.g. "Organic surge from 250 RPS to 850 RPS"
    multiplier: string;
    analysis: string;
  };
  similar_historical_incidents: {
    matched_incident: string; // e.g. "INC-873 (November 2025)"
    precedent_similarity_pct: number;
    lessons_applied: string;
  };
  troubleshooting_documentation: {
    matched_runbook: string; // e.g. "Database Connection Pool Troubleshooting Guide"
    sizing_formula_recommended: string;
    prescribed_mitigation: string;
  };
}

export interface AgentExecutionLog {
  agent: AgentRole;
  agent_name: string;
  status: 'SUCCESS' | 'FALLBACK' | 'ERROR';
  duration_ms: number;
  summary: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface AIInvestigationReport {
  incident_id: number;
  provider: 'gemini' | 'deterministic';
  ai_status: 'ai_powered' | 'fallback_to_deterministic' | 'deterministic';
  model_name?: string;
  error_message?: string;
  triage: {
    classified_severity: string;
    blast_radius: string;
    impacted_services: string[];
    priority_level: string;
    rationale: string;
  };
  log_analysis: {
    primary_exception: string;
    error_burst_rate: string;
    total_exceptions_detected: number;
    error_signatures: string[];
    log_sample: string;
  };
  change_analysis: {
    culprit_deployment: string;
    culprit_commit: string;
    config_diff: string;
    time_to_incident_minutes: number;
    direct_correlation: boolean;
  };
  knowledge_evidence: {
    retrieved_passages_count: number;
    top_runbook_title: string;
    top_postmortem_precedent: string;
    guidelines_excerpt: string;
  };
  root_cause: {
    observed_facts: ObservedFact[];
    primary_hypothesis: Hypothesis;
    alternative_hypotheses: Hypothesis[];
    five_factors_analyzed: FiveFactorAnalysis;
  };
  remediation: {
    action_title: string;
    action_command: string;
    proposed_plan: string[];
    assessed_risk: 'LOW' | 'MEDIUM' | 'HIGH';
    safety_gating: {
      requires_human_approval: true; // NEVER auto-executed
      approval_phrase_required: string;
      blast_radius_containment: string;
    };
  };
  validation: {
    post_remediation_checks: string[];
    acceptance_criteria: {
      target_p95_latency_ms: number;
      target_error_rate_pct: number;
      target_pool_utilization_pct: number;
    };
  };
  postmortem: {
    title: string;
    executive_summary: string;
    root_cause_analysis: string;
    five_whys: string[];
    preventive_actions: string[];
  };
  agent_pipeline: AgentExecutionLog[];
  completed_at: string;
}
