# PHANTOM PARADOX - JOB MANAGER BACKEND

Core backend server for the agent network.

## Features

- **Agent Management** - Track online agents, heartbeats, status
- **Job Queue** - Create, assign, and track jobs
- **Dispute System** - Jury selection, voting, resolution
- **Real-time** - WebSocket for live updates
- **REST API** - Full HTTP API for all operations

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

## Configuration

Create `.env` file:

```
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## API Endpoints

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | List all agents |
| GET | /api/agents/online | List online agents |
| GET | /api/agents/available | List available agents |
| GET | /api/agents/:id | Get agent details |
| GET | /api/agents/wallet/:address | Get agent by wallet |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/jobs | Create new job |
| GET | /api/jobs | List jobs |
| GET | /api/jobs/:id | Get job details |
| POST | /api/jobs/:id/approve | Approve completed job |
| POST | /api/jobs/:id/reject | Reject and dispute |
| POST | /api/jobs/:id/cancel | Cancel pending job |

### Disputes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/disputes | Open dispute |
| GET | /api/disputes | List disputes |
| GET | /api/disputes/:id | Get dispute details |
| POST | /api/disputes/:id/evidence | Submit evidence |
| POST | /api/disputes/:id/jury/accept | Accept jury duty |
| POST | /api/disputes/:id/vote | Submit vote |
| GET | /api/disputes/jury/:agentId | Get pending duties |

### Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stats | Overall stats |
| GET | /api/stats/agents | Agent stats |
| GET | /api/stats/jobs | Job stats |
| GET | /api/stats/disputes | Dispute stats |
| GET | /api/stats/live | Live dashboard data |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Server health check |

## WebSocket

Connect to `ws://localhost:3000/ws`

### Messages (Agent → Server)

```json
// Heartbeat
{
  "type": "heartbeat",
  "agent": "wallet-address",
  "platform": "chromium",
  "version": "0.1.0",
  "capabilities": ["relay"],
  "config": { "maxBandwidth": 10 },
  "metrics": { "bytesRelayed": 1000 }
}

// Job progress
{
  "type": "job_progress",
  "jobId": "uuid",
  "progress": 50,
  "metrics": { "bytesProcessed": 500 }
}

// Job complete
{
  "type": "job_complete",
  "jobId": "uuid",
  "success": true,
  "output": "result",
  "proofHash": "hash"
}
```

### Messages (Server → Agent)

```json
// Heartbeat acknowledgment
{
  "type": "heartbeat_ack",
  "agentId": "uuid",
  "serverTime": 1234567890
}

// Job assignment
{
  "type": "job_assignment",
  "job": {
    "id": "uuid",
    "type": "relay",
    "description": "...",
    "payment": { "amount": 1000, "currency": "SOL" }
  }
}

// Jury invite
{
  "type": "jury_invite",
  "disputeId": "uuid",
  "expiresAt": 1234567890,
  "casePreview": { ... }
}
```

## Architecture

```
┌──────────────┐     ┌──────────────┐
│   Agents     │────▶│  WebSocket   │
│ (Extensions) │     │   Server     │
└──────────────┘     └──────┬───────┘
                            │
┌──────────────┐     ┌──────▼───────┐
│   Brains     │────▶│   REST API   │
│  (Buyers)    │     │   Express    │
└──────────────┘     └──────┬───────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ AgentManager   │ │  JobManager    │ │ DisputeManager │
│                │ │                │ │                │
│ - Heartbeats   │ │ - Job queue    │ │ - Jury system  │
│ - Status       │ │ - Assignment   │ │ - Voting       │
│ - Reputation   │ │ - Payments     │ │ - Resolution   │
└────────────────┘ └────────────────┘ └────────────────┘
```

## License

MIT - Phantom Paradox 2025

