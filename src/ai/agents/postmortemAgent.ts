/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIProvider } from '../provider';
import { AgentExecutionLog } from '../types';
import { ChangeAnalysisOutput } from './changeAnalysisAgent';
import { LogAnalysisOutput } from './logAnalysisAgent';
import { RootCauseOutput } from './rootCauseAgent';
import { TriageOutput } from './triageAgent';

export interface PostmortemInput {
  incidentId: number;
  serviceName: string;
  triage: TriageOutput;
  logAnalysis: LogAnalysisOutput;
  changeAnalysis: ChangeAnalysisOutput;
  rootCause: RootCauseOutput;
}

export interface PostmortemOutput {
  title: string;
  executive_summary: string;
  root_cause_analysis: string;
  five_whys: string[];
  preventive_actions: string[];
}

export async function runPostmortemAgent(
  provider: AIProvider,
  input: PostmortemInput
): Promise<{ output: PostmortemOutput; log: AgentExecutionLog }> {
  const start = Date.now();

  const fallbackOutput: PostmortemOutput = {
    title: `Autonomous SRE Postmortem: INC-${input.incidentId} (${input.serviceName})`,
    executive_summary: `On ${new Date().toLocaleDateString()}, Checkout Service suffered a CRITICAL outage. Latency surged to 3,450ms and error rates reached 18.5%, directly impacting consumer cart fulfillments. The incident was detected autonomously by telemetry probes and mitigated through configuration rollback after human SRE authorization.`,
    root_cause_analysis: `Deployment ${input.changeAnalysis.culprit_deployment} applied commit 8f31c2a8d, reducing DB_POOL_SIZE from 50 to 10 to reduce idle container memory footprint. When organic checkout traffic surged from 250 RPS to 850 RPS, connection concurrency requirements exceeded the newly capped pool limit of 10. Worker threads stalled waiting for connection acquisitions, causing cascading HikariPool timeouts and upstream HTTP 504 Gateway errors.`,
    five_whys: [
      '1. Why did the checkout service fail? -> Incoming transactions stalled with HTTP 504 gateway timeouts.',
      '2. Why did transactions stall? -> Worker threads queued for over 1500ms waiting for an available JDBC database connection.',
      '3. Why were no database connections available? -> All 10 connection pool slots were continuously occupied by active queries.',
      '4. Why was the pool size set to only 10? -> Deployment v2.4.1-rc1 reduced DB_POOL_SIZE from 50 to 10 to optimize container memory.',
      '5. Why was an undersized pool deployed to production? -> The CI/CD canary verification suite evaluated low-traffic synthetic idle conditions without stress-testing peak concurrency thresholds.'
    ],
    preventive_actions: [
      '1. Enforce minimum connection pool sizing validation (DB_POOL_SIZE >= 50) in Helm chart CI linters.',
      '2. Implement automated peak-load synthetic stress canary tests before promoting releases.',
      '3. Configure Prometheus alert for pool saturation exceeding 80% for > 2 consecutive intervals.',
      '4. Mandate SRE architectural sign-off for changes modifying database connection ceilings.'
    ]
  };

  const systemPrompt = `You are the Postmortem Agent. Draft an enterprise SRE postmortem report.
Output JSON with:
- title (string)
- executive_summary (string)
- root_cause_analysis (string)
- five_whys (array of 5 strings)
- preventive_actions (array of strings)`;

  const userPrompt = JSON.stringify({
    incident_id: input.incidentId,
    service: input.serviceName,
    severity: input.triage.classified_severity,
    culprit_deployment: input.changeAnalysis.culprit_deployment,
    culprit_config: input.changeAnalysis.config_diff,
    primary_hypothesis: input.rootCause.primary_hypothesis.title
  });

  const response = await provider.generateJSON<PostmortemOutput>(systemPrompt, userPrompt, fallbackOutput);
  const finalOutput = response.data || fallbackOutput;

  const duration = Date.now() - start;
  return {
    output: finalOutput,
    log: {
      agent: 'postmortem',
      agent_name: 'Postmortem Agent',
      status: response.success ? 'SUCCESS' : 'FALLBACK',
      duration_ms: duration,
      summary: `Drafted postmortem with ${finalOutput.five_whys?.length || 5} Whys & ${finalOutput.preventive_actions?.length || 4} Action Items`,
      timestamp: new Date().toISOString(),
      details: { ...finalOutput }
    }
  };
}
