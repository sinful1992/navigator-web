# Sync Diagnostics MCP Server

Diagnostic tools to verify the data loss fix (commit 663ab90).

## Available Tools

### 1. Check Bootstrap Fix Status
Verifies that ALL operations are being marked as synced after bootstrap (not just "this device's" ops).

**What it checks:**
- Total COMPLETION_CREATE count (should be ~29)
- Operations by device
- Whether data is persisting across syncs

**Expected result (FIX WORKING):**
```
✅ Total COMPLETION_CREATE operations: 29
✅ BOOTSTRAP FIX WORKING: All ~29 operations present!
```

### 2. Check Sequence Continuity
Verifies there are no gaps in operation sequences.

**What it checks:**
- Sequence range
- Gaps between operations
- Corruption detection

**Expected result:**
```
✅ Total sequences: 1493
✅ NO GAPS - Continuous sequence!
```

### 3. Simulate Bootstrap Sync
Replicates the pagination logic to fetch all operations like the app does.

**What it checks:**
- Pagination working correctly
- No operations lost during pagination
- Deduplication not causing issues

**Expected result:**
```
📥 Page 1: 1000 operations
📥 Page 2: 493 operations
✅ Total fetched: 1493 operations
```

### 4. Check Completion Operations
Shows sample COMPLETION_CREATE operations to verify data integrity.

**What it checks:**
- Completion data structure
- Amount and outcome fields
- Number of cases

## How to Run

```bash
# Set environment variables (from your project .env.local)
export VITE_SUPABASE_URL="your_url"
export VITE_SUPABASE_ANON_KEY="your_key"

# Run diagnostics
node mcp-sync-diagnostics.js [USER_ID]
```

Default USER_ID: `33e11ba8-63ee-4ad6-a20e-5a35d6298540`

## Key Metrics to Watch

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| COMPLETION_CREATE on initial sync | 29 ✅ | 29 ✅ |
| COMPLETION_CREATE after refresh | 10 ❌ | 29 ✅ |
| lastSyncSequence marked properly | No ❌ | Yes ✅ |
| Deduplication issues | Yes ❌ | No ✅ |

## The Fix Explained

**Before:** After bootstrap merged ALL operations, only "this device's" operations were marked as synced. On incremental sync, operations from OTHER DEVICES were re-fetched and deduplicated away.

**After:** ALL operations (from all devices) are marked as synced after bootstrap, preventing re-fetching and deduplication loss.

## Deployment Checklist

- [ ] Run diagnostics: Check all metrics pass
- [ ] Verify COMPLETION_CREATE ≥ 25 (nearly all PIFs)
- [ ] Verify sequence continuity (no gaps)
- [ ] Test in staging: Clear data → sync → refresh
- [ ] Confirm data persists after refresh
- [ ] Verify bonus calculations accurate
- [ ] Deploy to production

## Troubleshooting

**Issue: Only 10 operations instead of 29**
- Bootstrap fetch pagination may not be fetching all operations
- Check: Are all 1493 operations being fetched?
- Check: Is `markSyncedUpTo()` being called with max sequence?

**Issue: Gaps in sequence**
- Operations may be getting corrupted during sync
- Check: Is sequence corruption detection working?
- Check: Are sanitized sequences being properly re-assigned?

**Issue: Deduplication removing operations**
- Operations may have mismatched IDs
- Check: Do all operations have unique operation IDs?
- Check: Are duplicates actually duplicates or false positives?
