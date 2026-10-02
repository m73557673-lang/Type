/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function runPostmortemTestSuite() {
  console.log('====================================================');
  console.log('STARTING SRE POSTMORTEM ENGINE TEST SUITE');
  console.log(`Target API: ${BASE_URL}`);
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
  // TEST GROUP 1: Incomplete / In-Progress Investigation Draft
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Postmortem Generation for Active / Incomplete Incident ---');
  {
    // Initialize active incident
    await fetch(`${BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'incident' })
    });

    // Generate or fetch postmortem draft for incident 1 while unresolved
    const genRes = await fetch(`${BASE_URL}/postmortems/generate/1`, { method: 'POST' });
    assert(genRes.status === 200, 'POST /postmortems/generate/1 returns 200 OK');
    const draft = await genRes.json();

    assert(draft.incident_id === 1, 'Draft contains incident ID 1');
    assert(draft.investigation_status === 'INCOMPLETE', 'Draft accurately reflects INCOMPLETE investigation status');
    assert(draft.executive_summary.length > 50, 'Draft contains comprehensive executive summary');
    assert(draft.affected_services.includes('Checkout Service'), 'Identifies affected service');
    assert(!!draft.timestamps.start && !!draft.timestamps.detection, 'Draft contains start and detection timestamps');
    assert(draft.timestamps.recovery === null, 'Recovery timestamp is null while incident is ongoing');
    assert(draft.customer_impact.is_synthetic === true, 'Customer impact explicitly flags is_synthetic');
    assert(draft.customer_impact.synthetic_label.includes('SYNTHETIC'), 'Customer impact contains clear [SYNTHETIC] notice');
  }

  // ----------------------------------------------------
  // TEST GROUP 2: Resolved Incident Full SRE Postmortem Synthesis
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: Full SRE Postmortem Synthesis for Resolved Incident ---');
  {
    // Approve and simulate fix so incident 1 is officially resolved
    await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Principal SRE On-Call (Alice Chen)', confirmation_phrase: 'APPROVE REMEDIATION' })
    });

    await fetch(`${BASE_URL}/incidents/1/simulate-fix`, { method: 'POST' });

    // Verify incident is resolved
    const inc = await (await fetch(`${BASE_URL}/incidents/1`)).json();
    assert(inc.status === 'resolved', 'Incident 1 is officially resolved');

    // Generate resolved postmortem
    const resolvedGenRes = await fetch(`${BASE_URL}/postmortems/generate/1`, { method: 'POST' });
    assert(resolvedGenRes.status === 200, 'Regenerated postmortem for resolved incident');
    const pm = await resolvedGenRes.json();

    // 1. Executive summary
    assert(!!pm.executive_summary && pm.executive_summary.includes('42.5ms'), 'Executive summary details recovery outcome');

    // 2. Incident ID, severity, affected services
    assert(pm.incident_id === 1, 'Contains Incident ID');
    assert(pm.severity === 'CRITICAL', 'Contains severity');
    assert(pm.affected_services.length >= 2, 'Contains affected services (Checkout, API Gateway)');

    // 3. Start, detection, recovery timestamps & MTTR
    assert(!!pm.timestamps.start, 'Contains start timestamp');
    assert(!!pm.timestamps.detection, 'Contains detection timestamp');
    assert(!!pm.timestamps.recovery, 'Contains recovery timestamp');
    assert(pm.timestamps.duration_minutes > 0, `Computes duration in minutes (got ${pm.timestamps.duration_minutes}m)`);

    // 4. Customer impact estimate (synthetic)
    assert(pm.customer_impact.is_synthetic === true, 'Flags customer impact as synthetic');
    assert(pm.customer_impact.synthetic_label.includes('SYNTHETIC'), 'Customer impact includes synthetic label');
    assert(pm.customer_impact.affected_users_estimate.includes('1,840'), 'Includes affected users estimate');

    // 5. Chronological incident timeline
    assert(Array.isArray(pm.timeline) && pm.timeline.length >= 4, `Chronological timeline populated (count: ${pm.timeline.length})`);
    const isSorted = pm.timeline.every((t: any, idx: number, arr: any[]) =>
      idx === 0 || new Date(arr[idx - 1].timestamp).getTime() <= new Date(t.timestamp).getTime()
    );
    assert(isSorted, 'Timeline entries strictly sorted chronologically');

    // 6. Evidence-backed root cause & rival hypotheses
    assert(pm.root_cause_details.primary_hypothesis.includes('DB_POOL_SIZE'), 'Identifies primary hypothesis');
    assert(pm.root_cause_details.supporting_evidence.length >= 4, 'Cites at least 4 supporting evidence items');
    assert(pm.root_cause_details.supporting_evidence.some((e: any) => e.id.includes('DEP')), 'Cites culprit deployment evidence');
    assert(pm.root_cause_details.supporting_evidence.some((e: any) => e.id === 'EVD-METRIC-POOL'), 'Cites pool metric evidence EVD-METRIC-POOL');
    assert(pm.root_cause_details.alternative_hypotheses.length >= 2, 'Details at least 2 alternative disproven hypotheses');

    // 7. Resolution & remediation approval details
    assert(pm.resolution_and_approval.approved_by.includes('Alice Chen'), 'Records authorizing SRE operator identity');
    assert(pm.resolution_and_approval.approval_phrase === 'APPROVE REMEDIATION', 'Records required approval phrase');
    assert(pm.resolution_and_approval.allowlist_verified === true, 'Confirms allowlist verification');
    assert(pm.resolution_and_approval.execution_result.includes('DB_POOL_SIZE'), 'Contains execution output');

    // 8. Before-and-after operational metrics
    const m = pm.before_after_metrics;
    assert(m.before.latency_p95.includes('3450'), 'Before metrics report 3450ms latency');
    assert(m.after.latency_p95.includes('42.5'), 'After metrics report 42.5ms latency');
    assert(m.before.error_rate.includes('18.5'), 'Before metrics report 18.5% errors');
    assert(m.after.error_rate.includes('0.02'), 'After metrics report 0.02% errors');
    assert(m.before.pool_utilization.includes('100.0'), 'Before metrics report 100% pool saturation');
    assert(m.after.pool_utilization.includes('36.0'), 'After metrics report 36% pool saturation');
    assert(m.recovery_validated === true, 'Recovery validated is true');

    // 9. What went well & what needs improvement
    assert(pm.what_went_well.length >= 3, 'Contains what went well items');
    assert(pm.what_needs_improvement.length >= 3, 'Contains what needs improvement items');

    // 10. Preventive actions with priorities and suggested owners
    assert(pm.preventive_actions.length >= 4, 'Contains at least 4 preventive action items');
    const p0 = pm.preventive_actions.find((a: any) => a.priority === 'P0');
    assert(!!p0, 'Contains P0 urgent action item');
    assert(!!p0.owner, 'Action item specifies suggested owner');
    assert(!!p0.deadline, 'Action item specifies target deadline');

    // 11. Links to relevant runbooks and historical incidents
    assert(pm.linked_resources.runbooks.length >= 1, 'Links to relevant runbooks');
    assert(pm.linked_resources.historical_incidents.length >= 1, 'Links to historical incident matches');
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Export Options (Markdown & JSON API)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Postmortem Export Formats ---');
  {
    // Markdown export endpoint GET /postmortems/:id/export?format=markdown
    const mdRes = await fetch(`${BASE_URL}/postmortems/1/export?format=markdown`);
    assert(mdRes.status === 200, 'GET /postmortems/1/export?format=markdown returns 200 OK');
    const md = await mdRes.text();
    assert(md.includes('# Incident Postmortem Report: INC-1'), 'Markdown export contains document title');
    assert(md.includes('## 1. Executive Summary'), 'Markdown contains Executive Summary section');
    assert(md.includes('## 4. Chronological Incident Timeline'), 'Markdown contains Timeline section');
    assert(md.includes('## 7. Before-and-After Operational Metrics'), 'Markdown contains Metrics table');
    assert(md.includes('SYNTHETIC METRIC'), 'Markdown contains synthetic disclaimer');

    // JSON export endpoint GET /postmortems/:id/export?format=json
    const jsonRes = await fetch(`${BASE_URL}/postmortems/1/export?format=json`);
    assert(jsonRes.status === 200, 'GET /postmortems/1/export?format=json returns 200 OK');
    const jsonPm = await jsonRes.json();
    assert(jsonPm.incident_id === 1, 'JSON export matches incident ID');
  }

  // ----------------------------------------------------
  // TEST GROUP 4: Zero AI Configuration / Deterministic Reliability
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Deterministic Operation Without AI Keys ---');
  {
    // Verify that generation does NOT fail or invent data when GEMINI_API_KEY is not configured
    const pm = await (await fetch(`${BASE_URL}/incidents/1/postmortem`)).json();
    assert(pm.ai_enhanced === false || pm.ai_provider === 'deterministic', 'Postmortem functions deterministically without AI credentials');
    assert(pm.root_cause_details.supporting_evidence.every((e: any) => e.id.startsWith('EVD-')), 'Evidence IDs strictly cite stored database records');
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPostmortemTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
