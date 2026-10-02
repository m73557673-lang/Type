/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildChronologicalEvidenceChain, deriveRootCauseAnalysis, DatabaseSnapshot } from '../src/ai/evidence_chain';
import { getSeedKnowledgeDocuments } from '../src/rag_engine';

function createMockDatabase(isIncidentScenario = true): DatabaseSnapshot {
  const now = new Date();
  const subMinutes = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  const services = [
    { id: 1, name: "API Gateway", environment: "production-synthetic", status: isIncidentScenario ? "DEGRADED" : "HEALTHY" },
    { id: 2, name: "Checkout Service", environment: "production-synthetic", status: isIncidentScenario ? "OUTAGE" : "HEALTHY" },
    { id: 3, name: "Order Service", environment: "production-synthetic", status: "HEALTHY" },
    { id: 4, name: "Database Service", environment: "production-synthetic", status: "HEALTHY" }
  ];

  const incidents = [
    {
      id: 1,
      title: "[SYNTHETIC] Database Connection Pool Exhaustion on Checkout Service",
      severity: "CRITICAL",
      status: "detected",
      service_id: 2,
      created_at: subMinutes(14),
      resolved_at: isIncidentScenario ? null : now.toISOString()
    }
  ];

  const deployments = isIncidentScenario ? [
    {
      id: 1,
      service_id: 2,
      version: "v2.4.0",
      changes: "commit 3b1e94a: chore: standard health checks & nominal config (DB_POOL_SIZE=50)",
      timestamp: subHours(2)
    },
    {
      id: 2,
      service_id: 2,
      version: "v2.4.1-rc1",
      changes: "commit 8f31c2a8d: tune DB_POOL_SIZE (50 -> 10) to conserve container memory",
      timestamp: subMinutes(18)
    }
  ] : [
    {
      id: 1,
      service_id: 2,
      version: "v2.4.0",
      changes: "commit 3b1e94a: chore: standard health checks & nominal config (DB_POOL_SIZE=50)",
      timestamp: subHours(2)
    }
  ];

  const log_events = isIncidentScenario ? [
    {
      id: 101,
      service_id: 2,
      timestamp: subMinutes(15),
      level: "WARN",
      message: "HikariPool-1 - Connection pool acquisition wait time approaching threshold (850ms)"
    },
    {
      id: 104,
      service_id: 2,
      timestamp: subMinutes(13),
      level: "ERROR",
      message: "com.zaxxer.hikari.pool.HikariPool$PoolAcquisitionException: Connection acquisition wait time exceeded 1500ms for thread CheckoutWorker-14"
    },
    {
      id: 108,
      service_id: 2,
      timestamp: subMinutes(10),
      level: "ERROR",
      message: "org.postgresql.util.PSQLException: Connection pool exhausted (active=10/10, pending=45)"
    }
  ] : [
    {
      id: 100,
      service_id: 2,
      timestamp: subMinutes(15),
      level: "INFO",
      message: "Health check nominal, pool utilization 32%"
    }
  ];

  const metrics = [
    { id: 201, service_id: 2, timestamp: subMinutes(12), metric_name: "pool_utilization", value: isIncidentScenario ? 100.0 : 36.0 },
    { id: 202, service_id: 2, timestamp: subMinutes(12), metric_name: "latency_p95", value: isIncidentScenario ? 3450.0 : 45.0 },
    { id: 203, service_id: 2, timestamp: subMinutes(12), metric_name: "request_volume", value: isIncidentScenario ? 850.0 : 250.0 },
    { id: 204, service_id: 2, timestamp: subMinutes(12), metric_name: "error_rate", value: isIncidentScenario ? 18.5 : 0.02 }
  ];

  const knowledge_documents = getSeedKnowledgeDocuments();

  return {
    services,
    incidents,
    deployments,
    metrics,
    log_events,
    knowledge_documents
  };
}

async function runEvidenceChainTestSuite() {
  console.log('====================================================');
  console.log('STARTING EVIDENCE CHAIN & ROOT CAUSE TEST SUITE');
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

  const db = createMockDatabase(true);
  const evidenceList = buildChronologicalEvidenceChain(1, db);

  // ----------------------------------------------------
  // TEST GROUP 1: Every Evidence Item Corresponds to Actual Stored DB Record
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Database Record Verification (No Fabricated Data) ---');
  {
    assert(evidenceList.length >= 6, `Evidence chain contains comprehensive items (count: ${evidenceList.length})`);

    // Verify Deployment Evidence matches actual deployment record in DB
    const depEv = evidenceList.find(e =>
      e.source_type === 'DEPLOYMENT' && (e.excerpt_or_value.includes('50 to 10') || e.excerpt_or_value.includes('50 -> 10'))
    );
    assert(!!depEv, 'Culprit deployment evidence item present');
    if (depEv) {
      const dbDep = db.deployments.find(d => d.id === depEv.source_id);
      assert(!!dbDep, 'Deployment evidence source_id references an existing record in db.deployments');
      assert(dbDep?.changes === depEv.excerpt_or_value, 'Deployment evidence excerpt exactly matches db.deployments record changes');
      assert(dbDep?.timestamp === depEv.timestamp, 'Deployment evidence timestamp matches db.deployments record timestamp');
      assert(depEv.raw_record !== undefined, 'Evidence item provides raw_record for opening original stored entity');
      assert(depEv.raw_record.id === dbDep?.id, 'raw_record id matches database record id');
    }

    // Verify Log Evidence matches actual log_events record in DB
    const logEv = evidenceList.find(e => e.source_type === 'LOG' && e.excerpt_or_value.includes('HikariPool'));
    assert(!!logEv, 'Error log evidence item present');
    if (logEv) {
      const dbLog = db.log_events.find(l => l.id === logEv.source_id);
      assert(!!dbLog, 'Log evidence source_id references an existing record in db.log_events');
      assert(logEv.excerpt_or_value.includes(dbLog?.message || ''), 'Log evidence excerpt contains actual db.log_events message');
      assert(dbLog?.timestamp === logEv.timestamp, 'Log evidence timestamp matches db.log_events record timestamp');
      assert(logEv.raw_record?.id === dbLog?.id, 'Log raw_record matches database log record');
    }

    // Verify Metric Evidence matches actual metrics record in DB
    const metricPoolEv = evidenceList.find(e => e.stable_id === 'EVD-METRIC-POOL');
    assert(!!metricPoolEv, 'Pool metric evidence item present');
    if (metricPoolEv) {
      const dbMetric = db.metrics.find(m => m.id === metricPoolEv.source_id);
      assert(!!dbMetric, 'Metric evidence source_id references an existing record in db.metrics');
      assert(dbMetric?.metric_name === 'pool_utilization', 'Metric evidence references pool_utilization');
      assert(metricPoolEv.excerpt_or_value.includes('100.0%'), 'Metric evidence displays actual measured value (100%)');
      assert(metricPoolEv.raw_record?.id === dbMetric?.id, 'Metric raw_record matches database metric record');
    }

    // Verify Runbook Evidence matches actual knowledge_documents record in DB
    const runbookEv = evidenceList.find(e => e.source_type === 'RUNBOOK');
    assert(!!runbookEv, 'Runbook guidance evidence item present');
    if (runbookEv) {
      const dbDoc = db.knowledge_documents.find(d => d.id === runbookEv.source_id);
      assert(!!dbDoc, 'Runbook evidence source_id references an existing record in db.knowledge_documents');
      assert(dbDoc?.title === 'Database Connection Pool Troubleshooting Guide', 'Runbook evidence references correct troubleshooting doc');
      assert(runbookEv.excerpt_or_value.includes('DB_POOL_SIZE >= 50'), 'Runbook excerpt contains actual sizing guidance');
      assert(runbookEv.raw_record?.id === dbDoc?.id, 'Runbook raw_record matches database document record');
    }

    // Verify Historical Incident Evidence matches actual knowledge_documents record in DB
    const histEv = evidenceList.find(e => e.source_type === 'HISTORICAL_INCIDENT');
    assert(!!histEv, 'Historical incident evidence item present');
    if (histEv) {
      const dbDoc = db.knowledge_documents.find(d => d.id === histEv.source_id);
      assert(!!dbDoc, 'Historical incident evidence source_id references existing record in db.knowledge_documents');
      assert(!!dbDoc && dbDoc.title.includes('INC-873'), 'Historical evidence references INC-873');
      assert(histEv.raw_record?.id === dbDoc?.id, 'Historical raw_record matches database document record');
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 2: Chronological Timeline Ordering & Stable Identifiers
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: Chronological Ordering & Stable Identifiers ---');
  {
    let isChronological = true;
    for (let i = 0; i < evidenceList.length - 1; i++) {
      const t1 = evidenceList[i].timestamp ? new Date(evidenceList[i].timestamp!).getTime() : 0;
      const t2 = evidenceList[i + 1].timestamp ? new Date(evidenceList[i + 1].timestamp!).getTime() : 0;
      if (t1 > t2) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, 'Evidence chain items are strictly sorted in chronological order');

    // Verify all items have stable identifiers and source references
    const allHaveStableIds = evidenceList.every(e => typeof e.stable_id === 'string' && e.stable_id.startsWith('EVD-'));
    assert(allHaveStableIds, 'Every evidence item has a valid stable identifier starting with EVD-');

    const allHaveSourceRefs = evidenceList.every(e => typeof e.source_ref === 'string' && e.source_ref.length > 0);
    assert(allHaveSourceRefs, 'Every evidence item provides an explicit source reference (table#id)');

    const allHaveExcerpts = evidenceList.every(e => typeof e.excerpt_or_value === 'string' && e.excerpt_or_value.length > 0);
    assert(allHaveExcerpts, 'Every evidence item provides a non-empty excerpt or telemetry value');
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Dynamic Derivation (Not Hardcoded 94%)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Dynamic Derivation from Simulated Database State ---');
  {
    const incidentAnalysis = deriveRootCauseAnalysis(1, db);
    const primaryHypo = incidentAnalysis.hypotheses.find(h => h.is_primary);
    assert(!!primaryHypo, 'Primary hypothesis derived');
    assert(primaryHypo?.likelihood === 'VERY_HIGH', 'Primary hypothesis likelihood evaluated as VERY_HIGH under incident scenario');
    assert(primaryHypo?.confidence_score! >= 0.85, `Dynamic confidence is high under incident state (${primaryHypo?.confidence_score})`);

    // Now test a HEALTHY baseline database (where DB_POOL_SIZE was NOT reduced and error logs are 0)
    const healthyDb = createMockDatabase(false);
    const healthyAnalysis = deriveRootCauseAnalysis(1, healthyDb);
    const healthyPrimary = healthyAnalysis.hypotheses.find(h => h.is_primary);

    assert(
      healthyPrimary?.confidence_score! < primaryHypo?.confidence_score!,
      `Confidence score dynamically drops in healthy scenario when evidence is absent (Incident: ${primaryHypo?.confidence_score} vs Healthy: ${healthyPrimary?.confidence_score})`
    );
    assert(
      healthyPrimary?.confidence_score !== 0.94,
      'System dynamically computes score from database state rather than hardcoding 94%'
    );
  }

  // ----------------------------------------------------
  // TEST GROUP 4: Methodology Distinction (Heuristic Score vs. Statistically Calibrated Probability)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Methodology Distinction & Investigation Summary ---');
  {
    const analysis = deriveRootCauseAnalysis(1, db);
    const summary = analysis.investigation_summary;

    assert(summary.principal_demo_scenario.includes('DB_POOL_SIZE reduction from 50 to 10'), 'Summary states principal demo scenario');
    assert(summary.why_primary_is_supported.length > 50, 'Summary explains why primary hypothesis is supported');
    assert(summary.evidence_missing.length >= 2, 'Summary specifies missing evidence (e.g. pg_stat_activity locks)');
    assert(summary.plausible_alternatives.length >= 2, 'Summary explains plausible alternatives');

    const method = analysis.scoring_methodology;
    assert(method.formula.includes('Deploy: 30%'), 'Scoring methodology displays explicit formula');
    assert(
      method.heuristic_vs_calibrated_distinction.heuristic_evidence_coverage_title.includes('Heuristic'),
      'Distinguishes heuristic evidence alignment score'
    );
    assert(
      method.heuristic_vs_calibrated_distinction.calibrated_probability_title.includes('Calibrated Probability'),
      'Distinguishes statistically calibrated probability'
    );
    assert(
      method.heuristic_vs_calibrated_distinction.operational_takeaway.includes('not uncalibrated model-hallucinated'),
      'Warns against uncalibrated model hallucinated probabilities'
    );
  }

  // ----------------------------------------------------
  // TEST GROUP 5: Hypothesis Evidence Linkages (Supporting vs Contradicting)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: Supporting & Contradicting Evidence Linkages ---');
  {
    const analysis = deriveRootCauseAnalysis(1, db);
    const hypo1 = analysis.hypotheses.find(h => h.id === 'HYPO-1');
    const hypo2 = analysis.hypotheses.find(h => h.id === 'HYPO-2');

    assert(hypo1?.supporting_evidence_ids.length! >= 4, 'HYPO-1 links to multiple supporting evidence IDs');
    assert(Boolean(hypo1?.supporting_evidence_ids.some(id => id.includes('DEP'))), 'HYPO-1 supported by deployment evidence');
    assert(Boolean(hypo1?.supporting_evidence_ids.some(id => id.includes('LOG'))), 'HYPO-1 supported by log evidence');

    // Check rival hypothesis has contradicting evidence
    assert(hypo2?.contradicting_evidence_ids.length! >= 1, 'HYPO-2 links to contradicting evidence (no SQL changes in deployment)');
  }

  // ----------------------------------------------------
  // TEST GROUP 6: Hypotheses as First-Class Evidence Items
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: Root-Cause Hypotheses in Evidence Chain ---');
  {
    const hypoItems = evidenceList.filter(e => e.source_type === 'HYPOTHESIS');
    assert(hypoItems.length >= 3, `Evidence chain contains first-class hypothesis items (count: ${hypoItems.length})`);

    const primaryHypoItem = hypoItems.find(e => e.stable_id === 'EVD-HYPO-1');
    assert(!!primaryHypoItem, 'Primary hypothesis item EVD-HYPO-1 present in evidence chain');
    assert(primaryHypoItem?.source_ref === 'hypotheses#HYPO-1', 'Primary hypothesis item references hypotheses#HYPO-1');
    assert(primaryHypoItem?.raw_record?.testable_prediction !== undefined, 'Hypothesis item provides raw_record with testable prediction');
    assert(primaryHypoItem?.supporting_hypotheses?.includes('HYPO-1') === true, 'Hypothesis item links to supporting hypothesis');

    const rivalHypoItem = hypoItems.find(e => e.stable_id === 'EVD-HYPO-2');
    assert(!!rivalHypoItem, 'Rival hypothesis item EVD-HYPO-2 present in evidence chain');
    assert(rivalHypoItem?.contradicting_hypotheses?.includes('HYPO-1') === true, 'Rival hypothesis marks contradiction with primary');
  }

  // ----------------------------------------------------
  // TEST GROUP 7: Type Filtering and Empty States
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 7: Evidence Type Filtering & Empty State Robustness ---');
  {
    const filterTypes = ['DEPLOYMENT', 'LOG', 'METRIC', 'RUNBOOK', 'HISTORICAL_INCIDENT', 'HYPOTHESIS', 'ALERT'];
    for (const t of filterTypes) {
      const filtered = evidenceList.filter(e => e.source_type === t);
      assert(filtered.length > 0, `Filter by type '${t}' returns matching items (count: ${filtered.length})`);
      assert(filtered.every(e => e.source_type === t), `All items in '${t}' filter strictly match requested type`);
    }

    // Empty Database / Uncorrelated Incident Test
    const emptyDb: DatabaseSnapshot = {
      services: [{ id: 99, name: "Empty Service", environment: "prod", status: "HEALTHY" }],
      incidents: [{ id: 99, title: "Uncorrelated Incident", severity: "LOW", status: "detected", service_id: 99, created_at: new Date().toISOString(), resolved_at: null }],
      deployments: [],
      metrics: [],
      log_events: [],
      knowledge_documents: []
    };

    const emptyEvidence = buildChronologicalEvidenceChain(99, emptyDb);
    assert(Array.isArray(emptyEvidence), 'Empty incident returns an array for clear empty-state rendering');
    // An incident not matching known failure scenario or with no logs/metrics should gracefully handle zero data
    const nonExistentEvidence = buildChronologicalEvidenceChain(9999, emptyDb);
    assert(nonExistentEvidence.length === 0, 'Non-existent incident returns empty array (triggering clean empty state)');
  }

  // ----------------------------------------------------
  // TEST GROUP 8: Absolute Zero Fabrication Confirmation
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 8: Zero Fabrication Verification Across Full Chain ---');
  {
    let fabricatedCount = 0;
    for (const ev of evidenceList) {
      if (ev.source_type === 'DEPLOYMENT') {
        const match = db.deployments.some(d => d.id === ev.source_id);
        if (!match) fabricatedCount++;
      } else if (ev.source_type === 'LOG') {
        const match = db.log_events.some(l => l.id === ev.source_id);
        if (!match) fabricatedCount++;
      } else if (ev.source_type === 'METRIC') {
        const match = db.metrics.some(m => m.id === ev.source_id);
        if (!match) fabricatedCount++;
      } else if (ev.source_type === 'RUNBOOK' || ev.source_type === 'HISTORICAL_INCIDENT') {
        const match = db.knowledge_documents.some(k => k.id === ev.source_id);
        if (!match) fabricatedCount++;
      }
    }
    assert(fabricatedCount === 0, 'Zero fabricated database citations confirmed: 100% of telemetry, log, deploy, and knowledge citations map to genuine database entities');
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEvidenceChainTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
