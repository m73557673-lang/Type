# Autonomous AI-Powered Incident Commander (MVP)

An enterprise-grade SRE and DevOps incident response platform that investigates simulated production incidents, correlates operational evidence, retrieves runbooks using RAG, proposes root causes, requires explicit human approval for remediation, validates simulated recovery, and generates postmortems.

---

## 🛠️ Architecture & Tech Stack

```
├── backend/                       # Python FastAPI Backend
│   ├── config.py                 # Pydantic Settings & environment config
│   ├── database.py               # SQLAlchemy SQLite engine & session
│   ├── models.py                 # Database ORM models (Incident, Evidence, Runbook, etc.)
│   ├── schemas.py                # Pydantic request/response validation schemas
│   ├── seed.py                   # Synthetic SRE scenario data generator
│   ├── main.py                   # FastAPI application, CORS, logging, lifecycle
│   ├── routers/                  # Modular REST API endpoints
│   │   ├── health.py             # Health check & database verification
│   │   ├── incidents.py          # Incident lifecycle management
│   │   ├── investigation.py      # Root cause hypothesis & AI analysis engine
│   │   ├── evidence.py           # Correlated evidence chain (logs, traces, metrics)
│   │   ├── services_metrics.py   # Microservice health & synthetic telemetry
│   │   ├── knowledge_base.py     # RAG runbook document retrieval
│   │   ├── remediation.py        # Human approval gating & simulated recovery
│   │   └── postmortems.py        # Postmortem generation & export
│   └── services/                 # Business logic layer
│       ├── incident_service.py
│       ├── investigation_service.py
│       ├── evidence_service.py
│       ├── rag_service.py
│       ├── remediation_service.py
│       └── postmortem_service.py
├── src/                          # React + TypeScript Frontend
│   ├── components/               # Modular enterprise SRE UI components
│   ├── types/                    # Shared TypeScript interfaces
│   ├── api/                      # Client API service layer
│   ├── App.tsx                   # Main SRE Dashboard layout & navigation
│   └── index.css                 # Dark navy theme & typography
├── server.ts                     # Full-stack integration server (Express + Vite bridge)
├── requirements.txt              # Python dependencies
├── package.json                  # Node.js dependencies
├── .replit                       # Replit deployment workflow
└── replit.nix                    # Nix environment definition
```

---

## 🔒 Safety & SRE Guardrails

1. **Synthetic Telemetry Labeling**: No fabricated metrics are presented as live production telemetry. All incident scenarios, log streams, and metric series are explicitly badged and labeled as `[SYNTHETIC SIMULATION]`.
2. **Mandatory Human-in-the-Loop Approval**: Remediation actions **cannot** be executed autonomously. The system requires an explicit human authorization phrase (`APPROVE REMEDIATION`) and records the operator's identifier in the audit log.
3. **No Real Infrastructure Mutations**: Remediation scripts execute exclusively within an isolated simulation sandbox, modeling system recovery and validating metric stabilization without connecting to live cloud infrastructure.

---

## 🚀 Running Locally or in Replit

### Option A: Replit
Click **Run**. The `.replit` configuration invokes `sh run.sh`, initializing the Python FastAPI backend on port 8000 and the Vite frontend on port 3000.

### Option B: Local Development
1. **Backend**:
   ```bash
   pip install -r requirements.txt
   uvicorn backend.main:app --reload --port 8000
   ```
2. **Frontend**:
   ```bash
   npm install
   npm run dev
   ```

---

## 📡 API Endpoints

- `GET /health` or `GET /api/health` - Health check & database connectivity
- `GET /api/incidents` - List simulated incidents (filterable by status/severity)
- `POST /api/incidents` - Create new synthetic incident
- `GET /api/investigation/:incidentId` - Scored root cause hypotheses
- `POST /api/investigation/:incidentId/analyze` - Trigger AI correlation engine
- `GET /api/evidence/:incidentId` - Chronological evidence chain
- `GET /api/services` - Monitored microservice fleet status
- `GET /api/services/metrics/synthetic-telemetry` - Synthetic metric timeseries
- `POST /api/knowledge-base/search` - RAG runbook retrieval
- `POST /api/remediation/:id/approve` - Human authorization gating
- `POST /api/remediation/:id/simulate-execution` - Sandbox simulated execution
- `POST /api/postmortems/generate/:incidentId` - Synthesize incident postmortem
