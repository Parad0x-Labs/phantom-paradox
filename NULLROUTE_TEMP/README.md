# NULLROUTE

**Solana Privacy Protocol** — Fast, private transactions.

![Status](https://img.shields.io/badge/Network-Devnet-orange) ![Phase](https://img.shields.io/badge/Phase-Genesis-green) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🚀 What It Does

NULLROUTE enables private transactions on Solana through statistical mixing and multi-hop routing. Your transaction gets split, shuffled, and recombined — breaking the on-chain link between sender and receiver.

### Key Features

| Feature | Description |
|---------|-------------|
| **⚡ Fast** | < 30 second settlement |
| **💰 Cheap** | 0.1-0.3% fee |
| **🔒 Private** | 99%+ anonymity with 100K+ pool |
| **🌐 Live** | Running on Solana Devnet |

---

## 📊 Anonymity Metrics

| Pool Size | Anonymity Score |
|-----------|-----------------|
| 10K TX | 99.0% |
| 100K TX | 99.7% |
| 1M TX | 99.9% |

**Formula:** `A = 1 - (1/√N)` where N = pool size

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Your Wallet] → [Mixing Pool] → [Null Shards] → [Target]  │
│                       ↓                                     │
│              Transaction splitting                          │
│              Variable fee obfuscation                       │
│              Multi-hop routing                              │
│                                                             │
│  Chain analysis sees: Shards → Target (no sender link)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Component | Technology | Status |
|-----------|------------|--------|
| Blockchain | Solana | ✅ Live |
| Web3 SDK | @solana/web3.js | ✅ Live |
| Wallet | Phantom | ✅ Live |
| RPC | Helius | ✅ Live |

---

## 🗺️ Roadmap

### Phase I: Genesis ✅ LIVE
- ✅ Nullroute mixing engine
- ✅ Multi-hop routing  
- ✅ Variable fee (0.1-0.3%)
- ✅ 100K+ pool capacity

### Phase II: ZK Integration (Q4 2025)
- Light Protocol ZK proofs
- Shielded transactions
- Mainnet deployment

### Phase III: Autonomous (Q1 2026)
- Arweave permanent hosting
- Dead Man Drop failsafe
- Zero server dependency

---

## 🔗 Links

- **Demo:** [Live on Devnet](https://labsx402.github.io/nullroute/)
- **Main Project:** [Phantom Paradox](https://github.com/LabsX402/phantom-paradox)

---

## ⚠️ Status

Currently on **Solana Devnet** for testing. Mainnet deployment planned for Q4 2025.

---

## 📜 License

MIT

---

*Privacy infrastructure on Solana.*
