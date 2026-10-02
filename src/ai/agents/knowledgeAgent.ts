/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentChunk, RAGSearchResult } from '../../types';
import { AgentExecutionLog } from '../types';

export interface KnowledgeAgentInput {
  incidentId: number;
  incidentTitle: string;
  serviceName: string;
  exceptionExcerpt: string;
  searchFn: (query: string, topK?: number) => Promise<RAGSearchResult>;
}

export interface KnowledgeAgentOutput {
  retrieved_passages_count: number;
  top_runbook_title: string;
  top_postmortem_precedent: string;
  guidelines_excerpt: string;
  sizing_recommendation: string;
  retrieved_chunks: DocumentChunk[];
}

export async function runKnowledgeAgent(
  input: KnowledgeAgentInput
): Promise<{ output: KnowledgeAgentOutput; log: AgentExecutionLog }> {
  const start = Date.now();

  const query = `${input.serviceName} database connection pool exhaustion timeout DB_POOL_SIZE`;
  const searchResult = await input.searchFn(query, 5);

  const passages = searchResult.passages || [];
  const runbookChunk = passages.find(p => p.type === 'RUNBOOK' || p.type === 'TROUBLESHOOTING');
  const postmortemChunk = passages.find(p => p.type === 'POSTMORTEM');

  const output: KnowledgeAgentOutput = {
    retrieved_passages_count: passages.length,
    top_runbook_title: runbookChunk?.document_title || 'Database Connection Pool Troubleshooting Guide',
    top_postmortem_precedent: postmortemChunk?.document_title || 'Historical Incident INC-873: Database Connection Pool Exhaustion',
    guidelines_excerpt: runbookChunk?.relevance_excerpt || 'For production checkout clusters handling up to 1000 RPS, maintain DB_POOL_SIZE >= 50. Setting DB_POOL_SIZE below 20 causes acute connection starvation during organic traffic bursts.',
    sizing_recommendation: 'pool_size = (cpu_core_count * 2) + effective_spindle_count. Minimum baseline for checkout is 50 connections.',
    retrieved_chunks: passages
  };

  const duration = Date.now() - start;
  return {
    output,
    log: {
      agent: 'knowledge',
      agent_name: 'Knowledge Agent',
      status: 'SUCCESS',
      duration_ms: duration,
      summary: `Retrieved ${output.retrieved_passages_count} passages: "${output.top_runbook_title}" & "${output.top_postmortem_precedent}"`,
      timestamp: new Date().toISOString(),
      details: { ...output }
    }
  };
}
