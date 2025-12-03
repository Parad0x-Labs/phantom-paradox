# AGENTS INTEGRATION - TASK LIST

> Internal dev doc. For new team members / agents taking over.

---

## OVERVIEW

Building a decentralized agent network where users ("muscle") share compute, bandwidth, and verification services. Buyers ("brains") pay for these services. Everything on-chain verifiable with PDOX reputation staking.

---

## ARCHITECTURE

```
BRAINS (buyers)
    │
    ├── deposit escrow (SOL/USDC)
    │
    ▼
MANAGER (job assignment engine)
    │
    ├── COMPUTE QUEUE (CPU/GPU tasks)
    ├── RELAY QUEUE (VPN/bandwidth)
    └── VERIFY QUEUE (merkle proofs, jury duty)
    │
    ▼
MUSCLE (agent network)
    │
    ├── [Agent1] [Agent2] [Agent3] ...
    │
    └── HEARTBEAT (online monitoring)
    │
    ▼
STREAMING PAYMENTS → AGENT WALLETS
```

---

## AGENT TYPES

| Type | Tasks | Requirements |
|------|-------|--------------|
| **Full** | Compute + Relay + Verify + Jury | PC/Server, 10+ Mbps, 4GB+ RAM |
| **Relay** | VPN traffic, bandwidth sharing | Any device, 5+ Mbps |
| **Compute** | CPU/GPU tasks, ML inference | PC/Server, good CPU/GPU |
| **Verify** | Merkle proofs, tx validation, jury | Any device, minimal resources |

---

## TODO LIST

### PHASE 1: FOUNDATION (Current)

- [x] Agent test page UI (docs/agents.html)
- [x] Real latency/bandwidth tests
- [x] Report card with grade + earnings estimate
- [ ] Message schema (dispute-ready format)
- [ ] Solana wallet connect on agent page
- [ ] PDOX staking smart contract (devnet)

### PHASE 2: CORE AGENT

- [ ] Agent binary (Rust)
  - PC/Linux support
  - Config file (limits, modes, wallet)
  - Heartbeat ping every 30s
  - Job acceptance/rejection
  - Task execution
  - Result reporting

- [ ] Android agent
  - Background service
  - Battery awareness (stop at X%)
  - Mobile data vs WiFi preference
  - Notification when earning

### PHASE 3: JOB SYSTEM

- [ ] Manager backend
  - Job queue per type
  - Agent matching (by capability + reputation)
  - Failover (reassign if agent drops)
  - Completion tracking

- [ ] Job types
  - Compute: CPU benchmark, ML inference
  - Relay: VPN tunnel, data forwarding
  - Verify: Merkle proof validation
  - Jury: Dispute voting

### PHASE 4: PAYMENTS

- [ ] Escrow contract
  - Brains deposit before job
  - Lock until completion
  - Auto-release on success
  - Dispute hold

- [ ] Streaming micropayments
  - Per-second/minute payments
  - Auto-aggregator (batch small payments)
  - Withdraw at $0.50+ minimum
  - SOL or USDC choice

- [ ] Fee split: 97% agent / 3% protocol
  - 2% → infra/dev
  - 1% → buyback/burn

### PHASE 5: DISPUTES

- [ ] Dispute trigger
  - Either party can open
  - Evidence submission (XMTP encrypted)
  - Arweave permanent storage

- [ ] Jury system
  - Pick 10 random online agents
  - 5 min to accept
  - 25 min to vote
  - 8/10 consensus = decision
  - Correct voters share loser's fine

- [ ] SML integration (future)
  - Train on dispute outcomes
  - Suggest verdicts to jury
  - Flag suspicious patterns

### PHASE 6: VPN/RELAY

- [ ] Traffic mimicry
  - YouTube patterns
  - Netflix patterns
  - Facebook patterns
  - ISP bypass

- [ ] Taxi pricing model
  - Idle: $0.001/min (meter running)
  - Active: $0.001/min + $0.0001/MB
  - Burst: premium rates

### PHASE 7: REPORTING

- [ ] Agent dashboard
  - Earnings history
  - Job history
  - Reputation score
  - Performance metrics

- [ ] Brains dashboard
  - Job status
  - Cost breakdown
  - Agent quality reports
  - Dispute history

---

## SYSTEM AGENTS

These run on our infra, not user machines:

| Agent | Role | Status |
|-------|------|--------|
| **Manager** | Assigns jobs, controls queue | TODO |
| **PDOX Watcher** | Monitors scores, triggers slash <80% | TODO |
| **Dispute Agent** | Opens disputes, picks jury | TODO |
| **Heartbeat** | Tracks online/offline status | TODO |
| **Evidence Collector** | Gathers proof for jury | TODO |
| **Payout Agent** | Distributes rewards after disputes | TODO |

---

## PRICING MODEL

### Auction-Based (Google Ads Style)

- Base rates set floor
- Demand sets ceiling
- Second-price auction (winner pays second-highest bid + 1)
- Real-time price feed

### Base Rates

| Service | Base Rate | Demand Range |
|---------|-----------|--------------|
| Relay (VPN) | $0.01/min + $0.0001/MB | 1x - 10x |
| Compute (CPU) | $0.005/min | 1x - 5x |
| Compute (GPU) | $0.10/min | 1x - 20x |
| Storage | $0.001/GB/hr | 1x - 3x |
| Verify/Jury | $0.001/task | 1x - 2x |

---

## SECURE COMMUNICATION

Hybrid stack - no single point of failure:

| Layer | What | Cost |
|-------|------|------|
| **XMTP** | Real-time chat (encrypted) | FREE |
| **Arweave** | Permanent storage (immutable) | ~$0.001/KB |
| **Solana** | Hash anchors (proof of existence) | ~$0.0001/msg |

### Message Flow (Disputes)

1. Evidence submitted via XMTP (encrypted)
2. Hash stored on Arweave (permanent)
3. Arweave TX hash anchored to Solana (verifiable timestamp)
4. Jury retrieves from Arweave using Solana anchor

---

## JOB FLOW

```
1. Brains deposits escrow
2. Manager assigns job to available agent
3. Agent completes work
4. Auto-verify OR manual approval (24h window)
   - No action = auto-release 100%
   - Approve = release 100%
   - Reject = goes to dispute
   - Counter = propose % (e.g., 60%)
5. Payment streams to agent wallet
6. Agent withdraws anytime ($0.50 min)
```

---

## DISPUTE FLOW

```
1. Either party opens dispute
2. System selects 10 random online agents as jury
3. Jury has 5 min to accept (else replaced)
4. 25 min to review evidence and vote
5. 8/10 consensus = decision
6. Winner gets payment
7. Loser pays fine (% of job value)
8. Correct voters share fine
9. Wrong voters get nothing (no penalty, just no reward)
```

---

## PDOX REPUTATION

**Not a tradeable token** - internal escrow/reputation system.

- Agents stake PDOX to go live
- Good performance = score stays high
- Bad performance (<80%) = PDOX slashed
- Slashed PDOX redistributed to good agents

### Why On-Chain Slashing > AI Watcher

| Factor | AI Watcher | On-Chain Slash |
|--------|------------|----------------|
| Trust | Trust the AI | Trust the code |
| Transparency | Black box | Fully auditable |
| Gaming | Can be tricked | Math is math |
| Skin in game | None | Real stake |

---

## AGENT CONFIG OPTIONS

Users can configure:

- **CPU limit**: 10-100%
- **RAM limit**: 256MB - 4GB
- **Bandwidth limit**: 1-100 Mbps
- **Daily data cap**: 100MB - 10GB
- **Battery threshold** (mobile): 20-80%
- **Auto-accept jobs**: yes/no
- **Min hourly rate**: $X.XX
- **Accepted job types**: compute/relay/verify/jury

---

## TECH STACK

| Component | Tech |
|-----------|------|
| Agent binary | Rust |
| Android app | Kotlin |
| Smart contracts | Anchor (Solana) |
| Backend | Node.js or Rust |
| Database | PostgreSQL + Redis |
| Messaging | XMTP |
| Storage | Arweave |
| Frontend | Vanilla JS (no framework bloat) |

---

## FILES

| File | Purpose |
|------|---------|
| `docs/agents.html` | Public agent test page |
| `AGENTS_TODO.md` | This file |
| `offchain/agent/` | Agent binary (TODO) |
| `programs/pdox_stake/` | Staking contract (TODO) |
| `programs/escrow/` | Escrow contract (TODO) |

---

## NOTES

- Keep it simple. No over-engineering.
- Test on devnet first, always.
- Document as you build.
- No secrets in code - use env vars.
- Password for agents.html: ask team lead.

---

*Last updated: Dec 3, 2025*

