# Clean Sensitive Files from Git History

## Option 1: BFG Repo Cleaner (Easiest)

```bash
# 1. Download BFG
# https://rtyley.github.io/bfg-repo-cleaner/

# 2. Clone fresh (mirror mode)
git clone --mirror https://github.com/Parad0x-Labs/phantom-paradox.git

# 3. Create file with paths to delete
# sensitive-files.txt:
offchain/src/netting/fastGraph.ts
offchain/src/netting/graph.ts
offchain/src/netting/settlement.ts
offchain/src/netting/compressedSettlement.ts
offchain/src/compression/treeBuilder.ts

# 4. Run BFG
java -jar bfg.jar --delete-files sensitive-files.txt phantom-paradox.git

# 5. Clean up
cd phantom-paradox.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 6. Push ONCE (wait, don't spam)
git push --force
```

## Option 2: git filter-repo (If Python installed)

```bash
pip install git-filter-repo

cd F:\web0\phantom-paradox

git filter-repo --invert-paths \
  --path offchain/src/netting/fastGraph.ts \
  --path offchain/src/netting/graph.ts \
  --path offchain/src/netting/settlement.ts \
  --path offchain/src/netting/compressedSettlement.ts \
  --path offchain/src/compression/treeBuilder.ts \
  --force

git remote add origin https://github.com/Parad0x-Labs/phantom-paradox.git
git push origin main --force
```

## Option 3: Just Leave It (Safest)

The files are now in `.gitignore`. Future commits won't include them.
Old history has them, but:
- They're TypeScript (not the real Rust engine)
- The real secret sauce is in `internal_use_only` repo
- Rewriting history is risky

**Recommendation:** Option 3 unless you're paranoid.

## After Cleaning

- All collaborators must delete and re-clone
- Old forks still have the files (can't fix that)
- GitHub caches may show files for ~24h

## Avoid GitHub Ban

- ONE force push only
- Wait 24h before any other force pushes
- Don't run scripts in loops
- Human-paced commits after this

