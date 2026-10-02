/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateAlternativeConfidence, calculateCalibratedConfidence } from '../src/ai/confidence';
import { InvestigationOrchestrator } from '../src/ai/orchestrator';
import { DeterministicProvider, MockAIProvider, getAIProvider, parseAndValidateModelOutput } from '../src/ai/provider';

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING AI INVESTIGATION LAYER TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Missing Credentials & Graceful Deterministic Fallback
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Missing Credentials & Deterministic Fallback ---');
  {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const { provider, isFallback } = getAIProvider();
    assert(isFallback === true, 'getAIProvider falls back when GEMINI_API_KEY is unset');
    assert(provider.name === 'deterministic', 'Fallback provider name is deterministic');

    // Run full orchestrator in zero-credential mode
    const report = await InvestigationOrchestrator.execute({
      incident: {
        id: 1,
        title: 'Synthetic Connection Pool Exhaustion',
        severity: 'CRITICAL',
        status: 'detected',
        service_id: 2,
        created_at: new Date().toISOString()
      },
      service: {
        id: 2,
        name: 'Checkout Service',
        environment: 'production'
      },
      metrics: [
        { metric_name: 'latency_p95', value: 3450, timestamp: new Date().toISOString() },
        { metric_name: 'error_rate', value: 18.5, timestamp: new Date().toISOString() },
        { metric_name: 'pool_utilization', value: 100, timestamp: new Date().toISOString() },
        { metric_name: 'request_volume', value: 850, timestamp: new Date().toISOString() }
      ],
      logs: [
        { id: 1, timestamp: new Date().toISOString(), level: 'ERROR', message: 'HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms' }
      ],
      deployments: [
        { id: 1, version: 'v2.4.1-rc1', changes: 'commit 8f31c2a8d: tune DB_POOL_SIZE (50 -> 10)', timestamp: new Date().toISOString() }
      ],
      searchRAG: async () => ({
        query: 'test',
        results_count: 1,
        algorithm: 'BM25',
        passages: []
      })
    });

    assert(report.provider === 'deterministic', 'Report indicates deterministic provider without API key');
    assert(report.ai_status === 'deterministic', 'Report ai_status is deterministic');
    assert(report.agent_pipeline.length === 8, 'All 8 modular agents executed successfully in fallback mode');

    // Restore key
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    process.env.AI_PROVIDER = 'deterministic';
  }

  // ----------------------------------------------------
  // TEST 2: Malformed Model Output & Schema Recovery
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: Malformed Model Output & Safe Recovery ---');
  {
    const fallbackObj = { status: 'DEGRADED', reason: 'Safe fallback' };

    // Case 2A: Corrupt, non-parseable JSON string
    const corruptOutput = '{"status": "OUTAGE", "reason": unclosed string';
    const mockCorruptProvider = new MockAIProvider(corruptOutput);
    const resA = await mockCorruptProvider.generateJSON('System', 'User', fallbackObj);

    assert(resA.success === false, 'Detects malformed/unparseable JSON from model');
    assert(resA.data?.status === 'DEGRADED', 'Safely returns default fallback on corrupt JSON');
    assert(!!resA.error, 'Contains descriptive error message regarding malformed model output');

    // Case 2B: Schema violation (parsed JSON missing expected required properties)
    const invalidSchemaOutput = '{"unrelated_data": [1, 2, 3]}';
    const mockSchemaProvider = new MockAIProvider(invalidSchemaOutput);
    const resB = await mockSchemaProvider.generateJSON(
      'System',
      'User',
      fallbackObj,
      (data: any) => typeof data.status === 'string' && typeof data.reason === 'string'
    );

    assert(resB.success === false, 'Detects schema violation where required properties are missing');
    assert(resB.data?.status === 'DEGRADED', 'Reverts to deterministic fallback when schema validation fails');

    // Case 2C: Markdown wrapped JSON (```json ... ```) commonly emitted by models
    const wrappedOutput = '```json\n{"status": "OUTAGE", "reason": "Successfully parsed markdown fence"}\n```';
    const parsedC = parseAndValidateModelOutput(wrappedOutput, fallbackObj);
    assert(parsedC.success === true, 'Successfully cleans and parses markdown fenced JSON');
    assert(parsedC.data.status === 'OUTAGE', 'Preserves data inside markdown code blocks');
  }

  // ----------------------------------------------------
  // TEST 3: Safety Guardrails & Human-Gated Remediation
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Safety Guardrails (Never Autonomous Execution) ---');
  {
    const report = await InvestigationOrchestrator.execute({
      incident: { id: 1, title: 'Test Inc', severity: 'CRITICAL', status: 'detected', service_id: 2, created_at: new Date().toISOString() },
      service: { id: 2, name: 'Checkout Service', environment: 'production' },
      metrics: [],
      logs: [],
      deployments: [],
      searchRAG: async () => ({ query: '', results_count: 0, algorithm: 'BM25', passages: [] })
    });

    assert(
      report.remediation.safety_gating.requires_human_approval === true,
      'Safety check: Remediation requires explicit human approval'
    );
    assert(
      report.remediation.safety_gating.approval_phrase_required === 'APPROVE REMEDIATION',
      'Safety check: Remediation requires exact confirmation phrase "APPROVE REMEDIATION"'
    );
  }

  // ----------------------------------------------------
  // TEST 4: Unsupported Conclusions Penalized
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Unsupported Conclusions & Rival Hypotheses ---');
  {
    // Alternative hypotheses (e.g. DB locks or Upstream Gateway without matching logs/deployments)
    const lockConfidence = calculateAlternativeConfidence('db_locks');
    const gatewayConfidence = calculateAlternativeConfidence('upstream_gateway');

    assert(
      lockConfidence.total_score <= 0.25,
      `Unsupported hypothesis "db_locks" receives low confidence (${lockConfidence.total_score} <= 0.25)`
    );
    assert(
      gatewayConfidence.total_score <= 0.15,
      `Unsupported hypothesis "upstream_gateway" receives low confidence (${gatewayConfidence.total_score} <= 0.15)`
    );
    assert(
      lockConfidence.uncertainty_penalty > 0,
      'Unsupported hypotheses have explicit uncertainty penalties deducted'
    );
  }

  // ----------------------------------------------------
  // TEST 5: Comprehensive 5-Factor Root Cause Analysis
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: 5-Factor Root Cause Analysis Verification ---');
  {
    const report = await InvestigationOrchestrator.execute({
      incident: { id: 1, title: 'Checkout Outage', severity: 'CRITICAL', status: 'detected', service_id: 2, created_at: new Date().toISOString() },
      service: { id: 2, name: 'Checkout Service', environment: 'production' },
      metrics: [
        { metric_name: 'latency_p95', value: 3450, timestamp: new Date().toISOString() },
        { metric_name: 'pool_utilization', value: 100, timestamp: new Date().toISOString() },
        { metric_name: 'request_volume', value: 850, timestamp: new Date().toISOString() }
      ],
      logs: [
        { id: 1, timestamp: new Date().toISOString(), level: 'ERROR', message: 'HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms' }
      ],
      deployments: [
        { id: 1, version: 'v2.4.1-rc1', changes: 'commit 8f31c2a8d: tune DB_POOL_SIZE (50 -> 10)', timestamp: new Date().toISOString() }
      ],
      searchRAG: async () => ({ query: '', results_count: 0, algorithm: 'BM25', passages: [] })
    });

    const f = report.root_cause.five_factors_analyzed;
    assert(!!f.db_timeout_frequency.observed, 'Factor 1 present: Database timeout frequency analyzed');
    assert(f.pool_size_reduction.observed.includes('50 to 10'), 'Factor 2 present: DB_POOL_SIZE changing 50 to 10 analyzed');
    assert(f.increased_checkout_traffic.observed.includes('850 RPS'), 'Factor 3 present: Increased checkout traffic analyzed');
    assert(f.similar_historical_incidents.matched_incident.includes('INC-873'), 'Factor 4 present: Similar historical incident INC-873 analyzed');
    assert(!!f.troubleshooting_documentation.matched_runbook, 'Factor 5 present: Troubleshooting documentation analyzed');
  }

  // ----------------------------------------------------
  // TEST 6: Explicit Calibrated Confidence Scoring Formula
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: Calibrated Confidence Scoring Formula ---');
  {
    const scoring = calculateCalibratedConfidence({
      hasDirectConfigChange: true,     // 30
      hasRecentDeployment: true,
      hasMatchingErrorSignatures: true,
      errorCount: 15,                  // 25
      poolUtilizationPct: 100,         // 25
      p95LatencyMs: 3450,
      trafficSurgeDetected: true,
      hasMatchingRunbook: true,        // 20
      hasHistoricalIncidentMatch: true,
      hasUncheckedDownstream: true,    // -4
      hasCompetingHypotheses: true,    // -3
      limitedTelemetryWindow: false
    });

    // 30 + 25 + 25 + 20 - 4 - 3 = 93% = 0.93
    assert(scoring.total_score >= 0.90 && scoring.total_score <= 0.96, `Calibrated score matches formula: got ${scoring.total_score}`);
    assert(scoring.scoring_rationale.length >= 4, 'Scoring rationale includes detailed breakdown per factor');
    assert(scoring.deployment_score === 30, 'Deployment factor weighted at 30%');
    assert(scoring.log_score === 25, 'Log analysis factor weighted at 25%');
    assert(scoring.metric_score === 25, 'Telemetry metric factor weighted at 25%');
    assert(scoring.knowledge_score === 20, 'Knowledge & historical factor weighted at 20%');
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
