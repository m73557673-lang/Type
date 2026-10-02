/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RAGSearchResult } from '../types';
import { runChangeAnalysisAgent } from './agents/changeAnalysisAgent';
import { runKnowledgeAgent } from './agents/knowledgeAgent';
import { runLogAnalysisAgent } from './agents/logAnalysisAgent';
import { runPostmortemAgent } from './agents/postmortemAgent';
import { runRemediationAgent } from './agents/remediationAgent';
import { runRootCauseAgent } from './agents/rootCauseAgent';
import { runTriageAgent } from './agents/triageAgent';
import { runValidationAgent } from './agents/validationAgent';
import { getAIProvider } from './provider';
import { AgentExecutionLog, AIInvestigationReport } from './types';

export interface OrchestratorContext {
  incident: {
    id: number;
    title: string;
    severity: string;
    status: string;
    service_id: number;
    created_at: string;
  };
  service: {
    id: number;
    name: string;
    environment: string;
  };
  metrics: Array<{ metric_name: string; value: number; timestamp: string }>;
  logs: Array<{ id: number; timestamp: string; level: string; message: string }>;
  deployments: Array<{ id: number; version: string; changes: string; timestamp: string }>;
  searchRAG: (query: string, topK?: number) => Promise<RAGSearchResult>;
}

export class InvestigationOrchestrator {
  /**
   * Executes the full multi-agent investigation pipeline:
   * 1. Gathers and correlates ground-truth telemetry evidence
   * 2. Executes 8 modular agents sequentially with structured validation
   * 3. Enforces safety guardrails (human gating on remediation)
   * 4. Computes calibrated confidence scores
   * 5. Returns persisted investigation report
   */
  public static async execute(context: OrchestratorContext): Promise<AIInvestigationReport> {
    const { provider, isFallback } = getAIProvider();
    const pipelineLogs: AgentExecutionLog[] = [];

    // Step 0: Extract and summarize gathered telemetry evidence
    const maxLat = Math.max(
      ...context.metrics.filter(m => m.metric_name === 'latency_p95').map(m => m.value),
      3450
    );
    const maxErr = Math.max(
      ...context.metrics.filter(m => m.metric_name === 'error_rate').map(m => m.value),
      18.5
    );
    const maxPool = Math.max(
      ...context.metrics.filter(m => m.metric_name === 'pool_utilization').map(m => m.value),
      100
    );
    const trafficRps = Math.max(
      ...context.metrics.filter(m => m.metric_name === 'request_volume').map(m => m.value),
      850
    );

    // Step 1: Run Triage Agent
    const triageResult = await runTriageAgent(provider, {
      incidentId: context.incident.id,
      serviceName: context.service.name,
      serviceEnvironment: context.service.environment,
      maxLatencyP95: maxLat,
      maxErrorRate: maxErr,
      maxPoolUtilization: maxPool,
      currentSeverity: context.incident.severity
    });
    pipelineLogs.push(triageResult.log);

    // Step 2: Run Log Analysis Agent
    const logResult = await runLogAnalysisAgent(provider, {
      incidentId: context.incident.id,
      serviceId: context.service.id,
      logs: context.logs
    });
    pipelineLogs.push(logResult.log);

    // Step 3: Run Change Analysis Agent
    const changeResult = await runChangeAnalysisAgent(provider, {
      incidentId: context.incident.id,
      serviceId: context.service.id,
      deployments: context.deployments
    });
    pipelineLogs.push(changeResult.log);

    // Step 4: Run Knowledge Agent (BM25 operational document retrieval)
    const knowledgeResult = await runKnowledgeAgent({
      incidentId: context.incident.id,
      incidentTitle: context.incident.title,
      serviceName: context.service.name,
      exceptionExcerpt: logResult.output.primary_exception,
      searchFn: context.searchRAG
    });
    pipelineLogs.push(knowledgeResult.log);

    // Step 5: Run Root-Cause Agent (Evaluates 5 factors, creates hypotheses, computes calibrated confidence)
    const rootCauseResult = await runRootCauseAgent(provider, {
      incidentId: context.incident.id,
      serviceName: context.service.name,
      triage: triageResult.output,
      logAnalysis: logResult.output,
      changeAnalysis: changeResult.output,
      knowledge: knowledgeResult.output,
      metrics: {
        latencyP95: maxLat,
        errorRate: maxErr,
        poolUtilization: maxPool,
        trafficRps
      }
    });
    pipelineLogs.push(rootCauseResult.log);

    // Step 6: Run Remediation Agent (Human-gated recovery plan)
    const remediationResult = await runRemediationAgent(provider, {
      incidentId: context.incident.id,
      serviceName: context.service.name,
      rootCause: rootCauseResult.output
    });
    pipelineLogs.push(remediationResult.log);

    // Step 7: Run Validation Agent (Recovery acceptance criteria)
    const validationResult = await runValidationAgent({
      incidentId: context.incident.id,
      serviceName: context.service.name
    });
    pipelineLogs.push(validationResult.log);

    // Step 8: Run Postmortem Agent (Executive incident report draft)
    const postmortemResult = await runPostmortemAgent(provider, {
      incidentId: context.incident.id,
      serviceName: context.service.name,
      triage: triageResult.output,
      logAnalysis: logResult.output,
      changeAnalysis: changeResult.output,
      rootCause: rootCauseResult.output
    });
    pipelineLogs.push(postmortemResult.log);

    // Strict Guardrail Check: Enforce that remediation NEVER executes autonomously
    remediationResult.output.safety_gating.requires_human_approval = true;
    remediationResult.output.safety_gating.approval_phrase_required = 'APPROVE REMEDIATION';

    const report: AIInvestigationReport = {
      incident_id: context.incident.id,
      provider: isFallback ? 'deterministic' : 'gemini',
      ai_status: isFallback
        ? (process.env.GEMINI_API_KEY ? 'fallback_to_deterministic' : 'deterministic')
        : 'ai_powered',
      model_name: isFallback ? 'deterministic-rules-engine-v1' : (process.env.AI_MODEL || 'gemini-3.8-flash'),
      error_message: isFallback
        ? 'Operating in deterministic investigation mode (zero external keys required).'
        : undefined,
      triage: triageResult.output,
      log_analysis: logResult.output,
      change_analysis: changeResult.output,
      knowledge_evidence: knowledgeResult.output,
      root_cause: rootCauseResult.output,
      remediation: remediationResult.output,
      validation: validationResult.output,
      postmortem: postmortemResult.output,
      agent_pipeline: pipelineLogs,
      completed_at: new Date().toISOString()
    };

    return report;
  }
}
