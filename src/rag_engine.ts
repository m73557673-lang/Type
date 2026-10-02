import { DocumentChunk, KnowledgeDocument, IndexingStatus } from './types';

// Stopwords set for token normalization
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have',
  'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into',
  'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d',
  'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where',
  'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would',
  'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

// ----------------- DOCUMENT CHUNKER -----------------
export function chunkDocument(doc: KnowledgeDocument): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const lines = doc.content.split('\n');

  let currentSection = doc.title;
  let currentBuffer: string[] = [];
  let chunkIndex = 1;

  const flushBuffer = () => {
    const rawText = currentBuffer.join('\n').trim();
    if (rawText.length > 20) {
      const words = rawText.split(/\s+/).length;
      chunks.push({
        id: `doc-${doc.id}-chunk-${chunkIndex++}`,
        document_id: doc.id,
        document_title: doc.title,
        source: doc.source,
        type: doc.type,
        section: currentSection,
        content: rawText,
        word_count: words,
        relevance_excerpt: rawText.length > 220 ? rawText.substring(0, 220) + '...' : rawText
      });
    }
    currentBuffer = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      if (currentBuffer.length > 0) {
        flushBuffer();
      }
      currentSection = headerMatch[2].trim();
      currentBuffer.push(line);
    } else {
      currentBuffer.push(line);
      // Split on section size boundaries if too long
      if (currentBuffer.join('\n').split(/\s+/).length > 240) {
        flushBuffer();
      }
    }
  }

  if (currentBuffer.length > 0) {
    flushBuffer();
  }

  // If no chunks created, create one from whole text
  if (chunks.length === 0 && doc.content.trim().length > 0) {
    const words = doc.content.split(/\s+/).length;
    chunks.push({
      id: `doc-${doc.id}-chunk-1`,
      document_id: doc.id,
      document_title: doc.title,
      source: doc.source,
      type: doc.type,
      section: doc.title,
      content: doc.content.trim(),
      word_count: words,
      relevance_excerpt: doc.content.length > 220 ? doc.content.substring(0, 220) + '...' : doc.content
    });
  }

  return chunks;
}

// ----------------- MODULAR RETRIEVER INTERFACE -----------------
export interface BaseRetriever {
  indexChunks(chunks: DocumentChunk[]): void;
  search(query: string, topK?: number, typeFilter?: string): DocumentChunk[];
  getIndexingStatus(): IndexingStatus;
}

// ----------------- BM25 RETRIEVER IMPLEMENTATION -----------------
export class BM25Retriever implements BaseRetriever {
  private chunks: DocumentChunk[] = [];
  private invertedIndex: Map<string, Map<string, number>> = new Map(); // term -> Map<chunkId, termFreq>
  private chunkLengths: Map<string, number> = new Map(); // chunkId -> totalTokens
  private avgdl: number = 0;
  private totalTokens: number = 0;
  private lastIndexed: string = new Date().toISOString();

  // BM25 Hyperparameters
  private readonly k1: number = 1.5;
  private readonly b: number = 0.75;

  public indexChunks(chunks: DocumentChunk[]): void {
    this.chunks = [...chunks];
    this.invertedIndex.clear();
    this.chunkLengths.clear();
    this.totalTokens = 0;

    for (const chunk of chunks) {
      // Concatenate title and section to boost relevance
      const fullText = `${chunk.document_title} ${chunk.section} ${chunk.content}`;
      const tokens = tokenize(fullText);
      const len = tokens.length;
      this.chunkLengths.set(chunk.id, len);
      this.totalTokens += len;

      const termFreqs: Map<string, number> = new Map();
      for (const t of tokens) {
        termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
      }

      for (const [term, freq] of termFreqs.entries()) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, new Map());
        }
        this.invertedIndex.get(term)!.set(chunk.id, freq);
      }
    }

    this.avgdl = this.chunks.length > 0 ? this.totalTokens / this.chunks.length : 0;
    this.lastIndexed = new Date().toISOString();
  }

  public search(query: string, topK: number = 5, typeFilter?: string): DocumentChunk[] {
    if (!query || this.chunks.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const N = this.chunks.length;
    const scores = new Map<string, number>();
    const queryLower = query.toLowerCase().trim();

    for (const term of queryTokens) {
      const posting = this.invertedIndex.get(term);
      if (!posting) continue;

      const n_q = posting.size;
      // Robertson-Spärck Jones IDF
      const idf = Math.log((N - n_q + 0.5) / (n_q + 0.5) + 1);

      for (const [chunkId, freq] of posting.entries()) {
        const docLen = this.chunkLengths.get(chunkId) || this.avgdl;
        const numerator = freq * (this.k1 + 1);
        const denominator = freq + this.k1 * (1 - this.b + this.b * (docLen / (this.avgdl || 1)));
        const termScore = idf * (numerator / denominator);

        scores.set(chunkId, (scores.get(chunkId) || 0) + termScore);
      }
    }

    // Apply Boosts: Title & Exact Phrase matches
    for (const chunk of this.chunks) {
      let currentScore = scores.get(chunk.id) || 0;
      const contentLower = chunk.content.toLowerCase();
      const titleLower = chunk.document_title.toLowerCase();
      const sectionLower = chunk.section.toLowerCase();

      // Exact phrase bonus
      if (contentLower.includes(queryLower)) {
        currentScore += 3.5;
      }
      // Title match bonus
      if (titleLower.includes(queryLower)) {
        currentScore += 5.0;
      } else {
        // Individual term match in title
        for (const term of queryTokens) {
          if (titleLower.includes(term) || sectionLower.includes(term)) {
            currentScore += 1.5;
          }
        }
      }

      if (currentScore > 0) {
        scores.set(chunk.id, currentScore);
      }
    }

    // Filter by type if specified
    let candidateChunks = this.chunks;
    if (typeFilter && typeFilter !== 'ALL') {
      candidateChunks = candidateChunks.filter(c => c.type.toUpperCase() === typeFilter.toUpperCase());
    }

    // Sort descending by BM25 score
    const ranked = candidateChunks
      .filter(c => (scores.get(c.id) || 0) > 0)
      .map(c => {
        const rawScore = scores.get(c.id) || 0;
        // Generate snippet around query match
        const content = c.content;
        const matchIdx = content.toLowerCase().indexOf(queryTokens[0]);
        let excerpt = c.relevance_excerpt || content.substring(0, 200);

        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 60);
          const end = Math.min(content.length, matchIdx + 160);
          excerpt = (start > 0 ? '...' : '') + content.substring(start, end).trim() + (end < content.length ? '...' : '');
        }

        return {
          ...c,
          score: parseFloat(rawScore.toFixed(3)),
          relevance_excerpt: excerpt
        };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, topK);

    return ranked;
  }

  public getIndexingStatus(): IndexingStatus {
    return {
      total_documents: new Set(this.chunks.map(c => c.document_id)).size,
      total_chunks: this.chunks.length,
      vocabulary_size: this.invertedIndex.size,
      avg_chunk_length: Math.round(this.avgdl),
      algorithm: 'BM25 (Ranked Lexical)',
      last_indexed: this.lastIndexed,
      status: 'INDEXED'
    };
  }
}

// ----------------- SEED OPERATIONAL KNOWLEDGE DOCUMENTS -----------------
export function getSeedKnowledgeDocuments(): KnowledgeDocument[] {
  return [
    {
      id: 1,
      title: "Checkout Service Runbook",
      type: "RUNBOOK",
      source: "git://ops-runbooks/services/checkout-runbook.md",
      content: `# Checkout Service Runbook
## 1. Service Overview
The Checkout Service coordinates shopping cart fulfillment, payment authorization, and order creation.

## 2. Ingress & Dependencies
- Upstream: API Gateway (Envoy proxy) routing to port 8080.
- Downstream: PostgreSQL Checkout Database cluster (port 5432), Payment Gateway.

## 3. Healthcheck & Diagnostic Endpoints
- Liveness Probe: GET /v1/checkout/health
- Metrics: GET /metrics (Prometheus scraping interval: 15s)
- HikariCP Connection Pool Gauge: hikaricp_active_connections, hikaricp_idle_connections, hikaricp_pending_threads.

## 4. Emergency Triage Procedures
- High Latency: Verify database connection saturation before scaling application pods.
- HTTP 504 Gateway Timeouts: Inspect HikariCP connection wait timeouts in application log stream.

## 5. Rollback Procedures
- Kubernetes deployment rollback command:
  kubectl rollout undo deployment/checkout-service -n production
- Verify configuration values for DB_POOL_SIZE (default nominal value is 50).`
    },
    {
      id: 2,
      title: "Database Connection Pool Troubleshooting Guide",
      type: "TROUBLESHOOTING",
      source: "git://ops-runbooks/database/connection-pool-troubleshooting.md",
      content: `# Database Connection Pool Troubleshooting Guide
## 1. Problem Statement & Symptoms
When connection pool exhaustion occurs, incoming transactions stall waiting for an available JDBC/PostgreSQL connection slot.
Common error messages:
- "HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms"
- "PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections"
- Upstream HTTP 504 Gateway Timeouts on API Gateway.

## 2. Root Cause Analysis
1. Undersized connection pool ceiling relative to incoming request throughput.
2. Connection leaks where connections are not returned to the pool in a finally block.
3. Long-running or locking queries holding connections active > 30 seconds.

## 3. Sizing Formula & Configuration
Optimal pool sizing formula:
pool_size = (cpu_core_count * 2) + effective_spindle_count
For production checkout clusters handling up to 1000 RPS, maintain DB_POOL_SIZE >= 50. Setting DB_POOL_SIZE below 20 causes acute connection starvation during organic traffic bursts.

## 4. Emergency Mitigation
1. Inspect active connection allocation:
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
2. Terminate hung queries lingering over 30s:
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state != 'idle' AND query_start < now() - interval '30 seconds';
3. Roll back configuration commits reducing DB_POOL_SIZE and restore baseline pool size to 50.`
    },
    {
      id: 3,
      title: "Architecture Overview",
      type: "ARCHITECTURE",
      source: "git://ops-architecture/systems/e-commerce-checkout.md",
      content: `# Architecture Overview
## 1. Edge & Networking Tier
Client requests arrive at the Edge Network and terminate at Envoy API Gateway proxies. The API Gateway enforces rate limiting (10,000 RPS burst) and routes authenticated requests to internal service pods.

## 2. Microservice Layer
- API Gateway: Routes /v1/checkout/* requests to Checkout Service.
- Checkout Service: Stateful transaction orchestrator utilizing HikariCP database connection pooling.
- Order Service: Asynchronous fulfillment listener consuming Kafka transaction events.

## 3. Storage Tier
Primary transactional storage consists of a PostgreSQL high-availability cluster with PgBouncer connection pooling. Checkout Service connects directly with dedicated connection allocation (max_connections = 250).

## 4. Latency Budget & SLAs
- Target p95 latency: < 50ms under normal load (250 RPS).
- Degradation threshold: p95 latency > 500ms or error rate > 1.0%.
- Outage threshold: p95 latency > 2000ms or error rate > 5.0%.`
    },
    {
      id: 4,
      title: "Deployment #1842 Change Record",
      type: "CHANGE_RECORD",
      source: "jira://PROD-DEPLOY/REC-1842.md",
      content: `# Deployment #1842 Change Record
## Release Details
- Service: Checkout Service
- Version: v2.4.1-rc1
- Author: Performance Engineering Team
- Approval: Automated CI/CD Canary Pipeline

## Configuration Diff
commit 8f31c2a8d:
- DB_POOL_SIZE: 50 -> 10 (tuned downward to reduce idle database memory footprint per container replica)
- IDLE_TIMEOUT_MS: 30000 -> 10000

## Post-Deployment Observations
Following deployment v2.4.1-rc1, organic traffic climbed from 250 RPS to 850 RPS. Active HikariCP connection usage immediately saturated at 10/10 (100% capacity), resulting in cascaded connection acquisition timeouts and HTTP 504 errors on API Gateway.`
    },
    {
      id: 5,
      title: "Historical Incident INC-873",
      type: "POSTMORTEM",
      source: "git://ops-postmortems/2025/INC-873-db-exhaustion.md",
      content: `# Historical Incident INC-873: Database Connection Pool Exhaustion
## Summary
On November 28, 2025, during an unannounced flash sale, Checkout Service experienced complete transaction degradation with p95 latency spiking to 3,600ms and error rates reaching 22%.

## Root Cause
A preceding configuration change had reduced DB_POOL_SIZE to 15 connections to conserve container heap. When ingress RPS tripled, HikariCP connection pools were instantly exhausted, causing queue starvation and database request timeouts.

## Remediation Steps Taken
1. Reverted Helm configuration overriding DB_POOL_SIZE, restoring pool size to 50.
2. Executed rolling restart of Checkout Service deployment to re-initialize connection pools.
3. Observed latency dropping from 3,600ms back to nominal baseline (38ms) within 90 seconds.

## Preventive Actions
- Enforced architectural policy requiring minimum DB_POOL_SIZE of 50 in production.
- Added Prometheus alert for pool saturation exceeding 80% for > 2 consecutive intervals.`
    },
    {
      id: 6,
      title: "Incident Severity Policy",
      type: "POLICY",
      source: "confluence://sre-handbook/policies/severity-matrix.md",
      content: `# Incident Severity Policy
## 1. Severity Classification Matrix
- CRITICAL (P0): Complete customer outage, critical payment path failure, error rate >= 5.0%, or p95 latency >= 2000ms. Mandatory on-call escalation within 5 minutes.
- HIGH (P1): Core service degradation, error rate >= 1.0%, or p95 latency >= 500ms. Requires investigation within 15 minutes.
- MEDIUM (P2): Partial feature degradation, error rate >= 0.5%, or p95 latency >= 200ms. Triage during business hours.
- LOW (P3): Minor anomaly or cosmetic issue without business disruption.

## 2. Escalation & Communication
For all CRITICAL incidents, automated paging alerts the On-Call Primary SRE and Engineering Lead. SRE Lead assumes Incident Commander role and oversees triage, mitigation, and postmortem documentation.`
    },
    {
      id: 7,
      title: "Standard Rollback Procedure",
      type: "PROCEDURE",
      source: "git://ops-playbooks/deployment/standard-rollback-procedure.md",
      content: `# Standard Rollback Procedure
## 1. Safety Guardrails & Human Authorization
Automated systems and AI agents must NEVER execute destructive rollback or scaling operations unilaterally. All rollbacks require human SRE authorization with explicit phrase confirmation ("APPROVE REMEDIATION").

## 2. Rollback Execution Workflow
1. Identify the culprit commit and previous stable deployment version (e.g., v2.4.0 baseline).
2. Verify rollback target configuration diff: ensure DB_POOL_SIZE is restored to nominal baseline (50).
3. Execute Kubernetes deployment rollback:
   kubectl rollout undo deployment/checkout-service
4. Monitor rollout status until all pods report healthy readiness probes:
   kubectl rollout status deployment/checkout-service
5. Validate telemetry recovery: verify p95 latency < 50ms and error rate < 0.1% for at least 3 minutes.`
    }
  ];
}
