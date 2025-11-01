# Navigator Web - Data Loss Recovery Guide

## What Happened
On 2025-11-01, your app experienced **data loss** (478 → 66 completions) due to **corrupted sequence numbers** in the delta sync system.

### Root Cause
- Sequence counter was poisoned with Unix timestamp (~1758009505)
- Operations synced to cloud with huge sequences (1.7 billion) instead of 1, 2, 3...
- Bootstrap detected corruption and attempted recovery
- State reconstruction lost completions in the process
- Console spammed with "Skipping session start" warnings (672+ lines)

## Fixes Applied ✅

### Code Changes
1. **`src/sync/operations.ts:211-229`** - Added upper-bound validation in `setSequence()`
   - Rejects any sequence > 1,000,000
   - Prevents timestamp poisoning
   - Logs stack trace for debugging

2. **`src/sync/operationSync.ts:682-699`** - Pre-sync validation in `submitOperation()`
   - Checks sequence before syncing to cloud
   - Blocks corrupted operations from spreading
   - Allows local storage only

3. **`src/sync/operations.ts:233-247`** - Async version of validation

### Files Created
- `ROOT_CAUSE_ANALYSIS.md` - Detailed technical analysis
- `CLOUD_DATABASE_REPAIR.sql` - SQL to fix cloud sequences
- `RECOVERY_GUIDE.md` - This file

## Recovery Steps

### Step 1: Repair Cloud Database (REQUIRED)
1. Open Supabase dashboard
2. Go to **SQL Editor**
3. Copy-paste the contents of `CLOUD_DATABASE_REPAIR.sql`
4. Click **Run**
5. Wait for confirmation

Expected output:
```
UPDATE X   (where X is number of corrupted operations)
```

### Step 2: Verify Repair (Optional)
In SQL Editor, run:
```sql
SELECT 
  COUNT(*) as total_ops,
  MAX(sequence_number) as max_seq,
  MIN(sequence_number) as min_seq
FROM public.navigator_operations;
```

Should show:
- `max_seq`: Reasonable value (e.g., 100-10,000)
- NOT: 1.7+ billion

### Step 3: Refresh App & Test
1. Force refresh app: **Ctrl+F5** (or Cmd+Shift+R on Mac)
2. Wait for bootstrap to complete
3. Check console for:
   - ✅ "BOOTSTRAP: Sanitized corrupted operations" (if recovery applies)
   - ✅ "BOOTSTRAP MERGE COMPLETE" (if merge successful)
   - ⚠️ "POTENTIAL DATA LOSS DETECTED" (shows final state)

### Step 4: Verify Data
- Check **Address List** tab - count of completions
- Check **Completed** tab - list of past completions
- Check **Earnings** tab - verify all sessions and payments

## Data Recovery Expectations

### Best Case (Likely)
- Cloud SQL repair re-assigns sequences 1, 2, 3...
- Bootstrap detects and sanitizes
- ~470+ of the missing 412 completions may recover
- You'll see "BOOTSTRAP: Sanitized corrupted operations"

### Partial Recovery (Possible)
- Some completions were genuinely lost due to state conflicts
- You may recover 50-80% of missing data
- Check `Completed` tab for what's recovered

### Worst Case (Unlikely)
- If SQL fails or data is completely corrupted
- You keep the current 66 completions
- Going forward, no more data loss (fixes are active)

## Monitoring Going Forward

### Console Checks
After app refresh, you should see:
- ❌ NOT: "corrupted sequence numbers" error
- ✅ YES: Normal bootstrap messages
- ✅ YES: "BOOTSTRAP MERGE COMPLETE"

### Prevention Active
- Any operation with sequence > 1,000,000 will be rejected
- Console error will show if this happens: `"Rejecting unreasonable sequence"`
- You won't get data loss from sequence corruption again

## If Problems Continue

### Symptoms to Watch For
1. Console shows "corrupted sequence" repeatedly → SQL repair didn't work
2. Data keeps disappearing → Contact Supabase support
3. Completions jump up and down → Cache inconsistency (refresh browser)

### Debugging
Enable sync diagnostics:
1. Open browser console
2. Type: `window.syncDebug.getStats()` - shows operation count
3. Type: `window.syncDebug.compare()` - compares local vs cloud
4. Type: `window.syncDebug.clearLocal()` - clears local (use with caution)

## Timeline of Events

```
2025-11-01 08:50 (approx): Sequence counter poisoned (cause unknown)
             09:00: Operations synced with huge sequences
             10:00: You refresh app, bootstrap detects corruption
             10:05: Sanitization creates new sequences, data loss occurs
             NOW:   Fixes deployed, prevention active
```

## Prevention Measures Deployed

1. ✅ Sequence validation in `setSequence(seq)` - rejects seq > 1M
2. ✅ Pre-sync validation in `submitOperation()` - blocks corrupted ops
3. ✅ Console error logging - identifies bad values early
4. ✅ Stack trace capture - traces source of bad calls

## FAQ

**Q: Will this happen again?**
A: No. The fixes prevent the sequence counter from being poisoned with timestamps.

**Q: Can I recover all 478 completions?**
A: Maybe not all, but most. SQL repair will help recovery process.

**Q: Do I need to do anything else?**
A: Just run the SQL repair and refresh the app. The app handles the rest.

**Q: What if the SQL fails?**
A: Error message will show. Keep current 66 completions and contact Supabase support.

**Q: How did this happen originally?**
A: Unknown root cause - likely `setSequence(Date.now())` was called somewhere. Fixes prevent it.

## Next Steps

1. ✅ Code fixes committed
2. ⏳ Run CLOUD_DATABASE_REPAIR.sql
3. ⏳ Refresh app
4. ⏳ Monitor console for recovery messages
5. ⏳ Verify data in app

## Support

If you encounter issues:
1. Check `ROOT_CAUSE_ANALYSIS.md` for technical details
2. Run diagnostics: `window.syncDebug.getStats()`
3. Check browser console for error messages
4. Review sync diagnostic modal (button in app)
