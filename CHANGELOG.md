# Changelog

## v2.2 — Singularity (Current)
**Dec 2024**

Compression engine overhaul. Trained dictionaries, real minifiers, adaptive chunking.

**Changes:**
- ZSTD dictionaries trained on real web corpus (HTML, CSS, JS, JSON)
- Integrated `minify-js` for AST-based JS minification
- Integrated `oxipng` for lossless PNG optimization  
- Adaptive FastCDC chunking based on file type
- Decompression bomb defense (100MB output limit)

**Numbers:**
- HTML: 85%+ compression (was 70%)
- JSON: 88%+ compression (was 75%)
- PNG: 32%+ size reduction (was 0%)

---

## v2.1 — Railgun
**Dec 2024**

Netting engine rewrite. Killed the deduplication bottleneck.

**Changes:**
- Replaced SHA256 hash dedup with nonce-gated filtering
- Switched to DashMap for concurrent state tracking
- Blake3 for Merkle trees (6x faster than SHA256)
- Added domain separator to prevent second preimage attacks
- Integer overflow protection via checked/saturating arithmetic

**Numbers:**
- 1M intents: 46ms (was 4.2s)
- 35x speedup over v2.0

---

## v2.0 — Power Update
**Nov 2024**

First Rust engine. Moved off TypeScript prototype.

**Changes:**
- Full Rust rewrite of compression + netting
- Parallel graph building with rayon
- Tarjan SCC for cycle detection
- Basic ZSTD compression with hand-tuned dictionaries
- FastCDC content-defined chunking

**Numbers:**
- 1M intents: 4.2s
- 95%+ transaction reduction via netting

---

## v1.0 — Prototype
**Oct 2024**

TypeScript proof of concept. Validated the architecture.

**What worked:**
- Intent batching concept proven
- Merkle compression for on-chain settlement
- Basic netting graph logic

**What didn't:**
- Too slow for production (10s+ for 100K intents)
- No real compression
- Single-threaded everything

---

## Migration Notes

### v1 → v2
- Complete rewrite. No code carried over.
- New Cargo workspace structure
- TypeScript code moved to `offchain/` (deprecated)

### v2 → v2.1
- `Intent` struct gains `nonce` field
- `Settlement::hash()` now uses domain separator
- Remove `sha2` dependency, add `blake3`, `dashmap`
- Old dedup logic in `settle.rs` replaced by `railgun.rs`

### v2.1 → v2.2
- Add `minify-js`, `oxipng` dependencies
- New `compressor_v3.rs` replaces `compressor.rs`
- Dictionary files required in `engine/src/compression/`
- Run `scripts/train_dictionaries.sh` to generate dicts

---

*Parad0x Labs — @parad0x_labs*

