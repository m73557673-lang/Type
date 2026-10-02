/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIProvider } from '../provider';
import { AgentExecutionLog } from '../types';

export interface TriageInput {
  incidentId: number;
  serviceName: string;
  serviceEnvironment: string;
  maxLatencyP95: number;
  maxErrorRate: number;
  maxPoolUtilization: number;
  currentSeverity: string;
}

export interface TriageOutput {
  classified_severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  blast_radius: string;
  impacted_services: string[];
  priority_level: 'P0' | 'P1' | 'P2' | 'P3';
  rationale: string;
}

export async function runTriageAgent(
  provider: AIProvider,
  input: TriageInput
): Promise<{ output: TriageOutput; log: AgentExecutionLog }> {
  const start = Date.now();

  const isCrit = input.maxLatencyP95 >= 2000 || input.maxErrorRate >= 5.0 || input.maxPoolUtilization >= 95;
  const isHigh = input.maxLatencyP95 >= 500 || input.maxErrorRate >= 1.0;

  const fallbackOutput: TriageOutput = {
    classified_severity: isCrit ? 'CRITICAL' : isHigh ? 'HIGH' : 'MEDIUM',
    blast_radius: 'Transactional checkout path: customer cart checkout, payment authorization, downstream order placement',
    impacted_services: [input.serviceName, 'API Gateway', 'Payment Gateway (Cascading)'],
    priority_level: isCrit ? 'P0' : isHigh ? 'P1' : 'P2',
    rationale: `Breached operational thresholds: Latency ${input.maxLatencyP95}ms (crit: 2000ms), Error rate ${input.maxErrorRate}% (crit: 5.0%), Pool utilization ${input.maxPoolUtilization}% (crit: 95%). Core revenue transaction path compromised.`
  };

  const systemPrompt = `You are the Triage Agent in an enterprise SRE incident response system.
Analyze the telemetry incident signals and output a JSON object with:
- classified_severity ("CRITICAL", "HIGH", "MEDIUM", "LOW")
- blast_radius (description of business/technical impact)
- impacted_services (list of affected services)
- priority_level ("P0", "P1", "P2", "P3")
- rationale (concise SRE rationale)`;

  const userPrompt = JSON.stringify({
    service: input.serviceName,
    environment: input.serviceEnvironment,
    metrics: {
      latency_p95_ms: input.maxLatencyP95,
      error_rate_pct: input.maxErrorRate,
      pool_utilization_pct: input.maxPoolUtilization,
    },
    reported_severity: input.currentSeverity
  });

  const response = await provider.generateJSON<TriageOutput>(systemPrompt, userPrompt, fallbackOutput);
  const finalOutput = response.data || fallbackOutput;

  // Enforce schema sanity
  if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(finalOutput.classified_severity)) {
    finalOutput.classified_severity = fallbackOutput.classified_severity;
  }
  if (!['P0', 'P1', 'P2', 'P3'].includes(finalOutput.priority_level)) {
    finalOutput.priority_level = fallbackOutput.priority_level;
  }

  const duration = Date.now() - start;
  return {
    output: finalOutput,
    log: {
      agent: 'triage',
      agent_name: 'Triage Agent',
      status: response.success ? 'SUCCESS' : 'FALLBACK',
      duration_ms: duration,
      summary: `Classified as ${finalOutput.classified_severity} (${finalOutput.priority_level}) - Blast radius: ${finalOutput.impacted_services.length} services`,
      timestamp: new Date().toISOString(),
      details: { ...finalOutput }
    }
  };
}
