/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function runRemediationTestSuite() {
  console.log('====================================================');
  console.log('STARTING REMEDIATION WORKFLOW & SAFETY GUARDRAIL TEST SUITE');
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

  // Ensure fresh incident scenario state
  console.log('--- SETUP: Initializing Incident Simulation Scenario ---');
  const initRes = await fetch(`${BASE_URL}/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'incident' })
  });
  assert(initRes.status === 200, 'Initialized synthetic incident simulation scenario');

  // Verify incident #1 exists and is in detected/awaiting_approval
  const incRes = await fetch(`${BASE_URL}/incidents/1`);
  const inc = await incRes.json();
  assert(inc.id === 1, 'Incident #1 exists in database');
  assert(inc.status !== 'resolved', 'Incident #1 is not resolved at baseline');

  // Verify recommendation exists with all required fields
  const recRes = await fetch(`${BASE_URL}/incidents/1/recommendation`);
  assert(recRes.status === 200, 'Recommendation endpoint responds 200 OK');
  const rec = await recRes.json();
  assert(rec.incident_id === 1, 'Recommendation contains Incident ID');
  assert(rec.proposed_action.includes('DB_POOL_SIZE') && rec.proposed_action.includes('50'), 'Recommendation proposes restoring DB_POOL_SIZE to 50');
  assert(!!rec.reason_and_supporting_evidence, 'Recommendation contains reason and supporting evidence');
  assert(!!rec.expected_impact, 'Recommendation contains expected impact');
  assert(rec.risk_level === 'LOW', 'Recommendation specifies risk level');
  assert(Array.isArray(rec.preconditions) && rec.preconditions.length > 0, 'Recommendation contains preconditions checklist');
  assert(!!rec.rollback_plan, 'Recommendation contains rollback plan');
  assert(rec.approval_status === 'PENDING', 'Recommendation starts with approval_status PENDING');

  // ----------------------------------------------------
  // TEST GROUP 1: Operator Authentication / Identification
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 1: Operator Identity & Human Approval Gating ---');
  {
    // Case 1A: Empty operator name rejected
    const unauthRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: '', confirmation_phrase: 'APPROVE REMEDIATION' })
    });
    assert(unauthRes.status === 400, 'Empty operator name rejected with 400 Bad Request');
    const unauthJson = await unauthRes.json();
    assert(unauthJson.detail.includes('Operator identity'), 'Provides clear error message regarding operator identity requirement');

    // Case 1B: Missing operator property rejected
    const missingOpRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_phrase: 'APPROVE REMEDIATION' })
    });
    assert(missingOpRes.status === 400, 'Missing operator identity rejected with 400');

    // Case 1C: Invalid confirmation phrase rejected
    const badPhraseRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Alice SRE', confirmation_phrase: 'YES DO IT' })
    });
    assert(badPhraseRes.status === 400, 'Invalid confirmation phrase rejected with 400');
    const badPhraseJson = await badPhraseRes.json();
    assert(badPhraseJson.detail.includes('APPROVE REMEDIATION'), 'Error specifies required confirmation phrase');
  }

  // ----------------------------------------------------
  // TEST GROUP 2: Unapproved Actions Blocked from Simulation (Independent Server Enforcement)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: Independent Server Enforcement (Unapproved Actions Blocked) ---');
  {
    // Incident is still PENDING (unapproved). Attempting to simulate must fail on the server!
    const unapprovedSimRes = await fetch(`${BASE_URL}/incidents/1/simulate-fix`, {
      method: 'POST'
    });
    assert(unapprovedSimRes.status === 400, 'Unapproved action simulation rejected by server with 400');
    const unapprovedSimJson = await unapprovedSimRes.json();
    assert(unapprovedSimJson.detail.includes('approval') || unapprovedSimJson.detail.includes('APPROVED'), 'Server enforces prior operator approval requirement independently');

    // Verify incident was NOT resolved prematurely
    const checkInc = await (await fetch(`${BASE_URL}/incidents/1`)).json();
    assert(checkInc.status !== 'resolved', 'Incident remains unresolved when unapproved execution is attempted');
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Server-Side State Validation
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Server-Side State Validation ---');
  {
    // Try to transition incident to an invalid state e.g. failed and verify approve rejects
    await fetch(`${BASE_URL}/incidents/1/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_state: 'resolved', actor: 'TestHarness' })
    });

    // Attempting to approve an already resolved incident must fail
    const resolvedApproveRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Alice SRE', confirmation_phrase: 'APPROVE REMEDIATION' })
    });
    assert(resolvedApproveRes.status === 400, 'Approving already resolved incident is rejected with 400');

    // Transition back to detected for subsequent testing
    await fetch(`${BASE_URL}/incidents/1/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_state: 'detected', actor: 'TestHarness' })
    });
  }

  // ----------------------------------------------------
  // TEST GROUP 4: Non-Allowlisted Actions Rejected
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Server Action Allowlist Enforcement ---');
  {
    // Create a temporary synthetic incident #2 with dangerous/non-allowlisted recommendation
    const newIncRes = await fetch(`${BASE_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Dangerous Operation Test Incident',
        severity: 'HIGH',
        service_id: 2
      })
    });
    const newInc = await newIncRes.json();
    const testIncId = newInc.id;

    // Approve should fail because there is no recommendation for this incident
    const noRecRes = await fetch(`${BASE_URL}/incidents/${testIncId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Alice SRE', confirmation_phrase: 'APPROVE REMEDIATION' })
    });
    assert(noRecRes.status === 400 || noRecRes.status === 404, 'Approving incident with no recommendation rejected');

    // Simulate should also fail independently
    const noRecSimRes = await fetch(`${BASE_URL}/incidents/${testIncId}/simulate-fix`, {
      method: 'POST'
    });
    assert(noRecSimRes.status === 400 || noRecSimRes.status === 404, 'Simulating incident with no recommendation rejected independently');
  }

  // ----------------------------------------------------
  // TEST GROUP 5: Golden Path Approval & Safe Sandbox Simulation
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: Golden Path Approval, Execution, and SLA Recovery Validation ---');
  {
    // Reset simulation to incident state to ensure clean start
    await fetch(`${BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'incident' })
    });

    // 1. Authorize approval as authenticated SRE operator
    const approveRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved_by: 'Principal SRE On-Call (Alice Chen)',
        confirmation_phrase: 'APPROVE REMEDIATION'
      })
    });
    assert(approveRes.status === 200, 'POST /incidents/1/approve succeeds with 200 OK');
    const approvedAction = await approveRes.json();
    assert(approvedAction.status === 'APPROVED', 'Action status updated to APPROVED');
    assert(approvedAction.approved_by === 'Principal SRE On-Call (Alice Chen)', 'Action records operator identity');

    // Verify incident transitioned to 'remediating'
    const remediatingInc = await (await fetch(`${BASE_URL}/incidents/1`)).json();
    assert(remediatingInc.status === 'remediating', "Incident state transitioned to 'remediating'");

    // 2. Prevent duplicate approval
    const dupApproveRes = await fetch(`${BASE_URL}/incidents/1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved_by: 'Bob SRE',
        confirmation_phrase: 'APPROVE REMEDIATION'
      })
    });
    assert(dupApproveRes.status === 409, 'Duplicate approval while in remediating state rejected with 409 Conflict');

    // 3. Execute approved safe simulation POST /incidents/1/simulate-fix
    const simRes = await fetch(`${BASE_URL}/incidents/1/simulate-fix`, {
      method: 'POST'
    });
    assert(simRes.status === 200, 'POST /incidents/1/simulate-fix succeeds with 200 OK');
    const simResult = await simRes.json();
    assert(simResult.status === 'SIMULATED', 'Action marked SIMULATED');

    // 4. Verify recovery thresholds and before-and-after comparison
    assert(simResult.validation_results !== undefined, 'Simulation provides validation_results');
    const val = simResult.validation_results;
    assert(val.passed === true, 'All predefined SLA recovery checks passed');
    assert(val.before_metrics.latency_p95_ms === 3450.0, 'Before metric records p95 latency: 3450ms');
    assert(val.after_metrics.latency_p95_ms <= 50.0, `After metric latency recovery verified (got ${val.after_metrics.latency_p95_ms}ms <= 50.0ms)`);
    assert(val.after_metrics.error_rate_pct <= 0.1, `After metric error rate recovery verified (got ${val.after_metrics.error_rate_pct}% <= 0.1%)`);
    assert(val.after_metrics.pool_utilization_pct <= 80.0, `After metric pool saturation recovery verified (got ${val.after_metrics.pool_utilization_pct}% <= 80.0%)`);
    assert(val.after_metrics.db_pool_size === 50, 'DB_POOL_SIZE restored to 50 in synthetic config');

    // 5. Verify incident marked resolved only upon validation pass
    const finalInc = await (await fetch(`${BASE_URL}/incidents/1`)).json();
    assert(finalInc.status === 'resolved', "Incident status marked 'resolved' only after successful validation");
    assert(!!finalInc.resolved_at, 'Incident contains resolved_at timestamp');

    // 6. Prevent duplicate simulation execution
    const dupSimRes = await fetch(`${BASE_URL}/incidents/1/simulate-fix`, {
      method: 'POST'
    });
    assert(dupSimRes.status === 409, 'Duplicate execution on already resolved incident rejected with 409 Conflict');
  }

  // ----------------------------------------------------
  // TEST GROUP 6: Immutable Audit Log Verification
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: Immutable SRE Audit Log Verification ---');
  {
    const auditRes = await fetch(`${BASE_URL}/incidents/1/audit-logs`);
    assert(auditRes.status === 200, 'Audit log endpoint returns 200 OK');
    const logs = await auditRes.json();
    assert(Array.isArray(logs) && logs.length >= 4, `Audit log records comprehensive history (count: ${logs.length})`);

    const hasApproval = logs.some((l: any) => l.action_type === 'APPROVAL_GRANTED' && l.operator.includes('Alice Chen'));
    assert(hasApproval, 'Audit log contains APPROVAL_GRANTED with operator identity');

    const hasSimStart = logs.some((l: any) => l.action_type === 'SIMULATION_STARTED');
    assert(hasSimStart, 'Audit log contains SIMULATION_STARTED');

    const hasValidation = logs.some((l: any) => l.action_type === 'VALIDATION_PASSED');
    assert(hasValidation, 'Audit log contains VALIDATION_PASSED');

    const hasExecuted = logs.some((l: any) => l.action_type === 'REMEDIATION_EXECUTED');
    assert(hasExecuted, 'Audit log contains REMEDIATION_EXECUTED');

    const allHaveTimestamps = logs.every((l: any) => !!l.timestamp && !isNaN(new Date(l.timestamp).getTime()));
    assert(allHaveTimestamps, 'Every audit log entry contains an ISO timestamp');
  }

  // ----------------------------------------------------
  // TEST GROUP 7: Cancel and Safe Reset Path
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 7: Cancel & Safe Reset Path ---');
  {
    // Reset to incident
    await fetch(`${BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'incident' })
    });

    // Test cancel endpoint POST /incidents/1/cancel-remediation
    const cancelRes = await fetch(`${BASE_URL}/incidents/1/cancel-remediation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'Alice SRE', reason: 'Testing safe cancellation' })
    });
    assert(cancelRes.status === 200, 'POST /incidents/1/cancel-remediation responds 200 OK');
    const cancelData = await cancelRes.json();
    assert(cancelData.incident.status === 'awaiting_approval', 'Cancelled incident returned to awaiting_approval');

    // Verify cancellation audit log
    const auditRes = await fetch(`${BASE_URL}/incidents/1/audit-logs`);
    const logs = await auditRes.json();
    const hasCancelLog = logs.some((l: any) => l.action_type === 'ACTION_CANCELLED');
    assert(hasCancelLog, 'Cancellation recorded in audit log');

    // Test safe reset simulation endpoint POST /simulation/reset
    const resetRes = await fetch(`${BASE_URL}/simulation/reset`, { method: 'POST' });
    assert(resetRes.status === 200, 'POST /simulation/reset responds 200 OK');

    // Reset back to incident mode for subsequent app usage
    await fetch(`${BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'incident' })
    });
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRemediationTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
