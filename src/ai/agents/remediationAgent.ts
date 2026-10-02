/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIProvider } from '../provider';
import { AgentExecutionLog } from '../types';
import { RootCauseOutput } from './rootCauseAgent';

export interface RemediationInput {
  incidentId: number;
  serviceName: string;
  rootCause: RootCauseOutput;
}

export interface RemediationOutput {
  action_title: string;
  action_command: string;
  proposed_plan: string[];
  assessed_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  safety_gating: {
    requires_human_approval: true;
    approval_phrase_required: string;
    blast_radius_containment: string;
  };
  rollback_parameters: {
    target_version: string;
    target_pool_size: number;
    estimated_recovery_seconds: number;
  };
}

export async function runRemediationAgent(
  provider: AIProvider,
  input: RemediationInput
): Promise<{ output: RemediationOutput; log: AgentExecutionLog }> {
  const start = Date.now();

  const fallbackOutput: RemediationOutput = {
    action_title: 'Rollback Deployment v2.4.1-rc1 -> v2.4.0 & Restore DB_POOL_SIZE=50',
    action_command: 'kubectl rollout undo deployment/checkout-service -n production && kubectl scale deployment checkout-service --replicas=4',
    proposed_plan: [
      '1. Human SRE reviews evidence chain and types confirmation phrase ("APPROVE REMEDIATION").',
      '2. Revert configuration override: restore DB_POOL_SIZE from 10 back to 50.',
      '3. Revert deployment image to previous stable release v2.4.0.',
      '4. Trigger rolling restart of Checkout Service pods with 25% max-unavailable to avoid customer dropping.',
      '5. Validate telemetry recovery: ensure p95 latency drops < 50ms and active pool saturation drops < 40%.'
    ],
    assessed_risk: 'LOW',
    safety_gating: {
      requires_human_approval: true, // Strict safety guarantee
      approval_phrase_required: 'APPROVE REMEDIATION',
      blast_radius_containment: 'Rolling restart confined to Checkout Service pods; database cluster remains untouched.'
    },
    rollback_parameters: {
      target_version: 'v2.4.0',
      target_pool_size: 50,
      estimated_recovery_seconds: 45
    }
  };

  const systemPrompt = `You are the Remediation Agent for SRE incidents.
Propose a safe recovery plan and assess operational risk.
MANDATORY SAFETY GUARDRAIL: Automated systems and AI agents must NEVER execute destructive rollback or scaling operations directly.
All actions require human authorization.`;

  const userPrompt = JSON.stringify({
    service: input.serviceName,
    hypothesis: input.rootCause.primary_hypothesis.title,
    failure_mechanism: input.rootCause.primary_hypothesis.failure_mechanism
  });

  const response = await provider.generateJSON<RemediationOutput>(systemPrompt, userPrompt, fallbackOutput);
  const finalOutput = response.data || fallbackOutput;

  // Enforce safety guardrails programmatically: Never allow AI to bypass human approval
  finalOutput.safety_gating = {
    requires_human_approval: true,
    approval_phrase_required: 'APPROVE REMEDIATION',
    blast_radius_containment: finalOutput.safety_gating?.blast_radius_containment || fallbackOutput.safety_gating.blast_radius_containment
  };

  const duration = Date.now() - start;
  return {
    output: finalOutput,
    log: {
      agent: 'remediation',
      agent_name: 'Remediation Agent',
      status: response.success ? 'SUCCESS' : 'FALLBACK',
      duration_ms: duration,
      summary: `Proposed recovery plan: "${finalOutput.action_title}" (Risk: ${finalOutput.assessed_risk}, Human Gating: MANDATORY)`,
      timestamp: new Date().toISOString(),
      details: { ...finalOutput }
    }
  };
}
