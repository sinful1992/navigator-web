# ROOT CAUSE ANALYSIS: Data Loss & Console Spam Issue

## Summary
**Thousands of console lines** and **data loss** caused by **corrupted sequence numbers in delta sync system**. When the app started, it detected that cloud operations had sequence numbers like `1758009505` (Unix timestamps) instead of `1, 2, 3...` (incremental integers).

## Evidence
- Console error: `[ERROR] 🚨 BOOTSTRAP: Cloud operations have corrupted sequence numbers`
- Threshold check: `gap > 10000 && localMaxSeq > 100` (line 393 in operationSync.ts)
- Gap detected: Cloud sequences jumped from ~100 to ~1.7 billion (Unix timestamp)

## Root Cause Chain (Applying Root Cause Principles)

### 1. PRIMARY CAUSE: Sequence Counter Poisoned
**What happened:**
- At some point, `setSequence()` was called with a Unix timestamp (~1758009505) instead of a proper sequence number
- Once poisoned, the sequence generator continued: 1758009505, 1758009506, 1758009507...
- These huge numbers were synced to cloud

### 2. SECONDARY CAUSE: Timing of Sequence Reset on Restore
**Why it happened:**
- During restore/migration, sequence numbers should be reset
- But if `setSequence()` was called AFTER the reset, it could re-poison the counter
- OR: A migration ran that used timestamps instead of incremental counters

### 3. TERTIARY CAUSE: No Pre-Sync Validation
**The failure point:**
- Operations are created with sequences from the generator
- But there's no validation that sequences are reasonable before syncing to cloud
- By the time bootstrap detects corruption, operations are already on cloud

## Data Loss Mechanism

```
Timeline:
1. Sequence counter gets poisoned with Unix timestamp (~1758009505)
2. New operations created with sequences: 1758009505, 1758009506...
3. Operations synced to cloud
4. On next app start: Bootstrap detects corruption ✓ (line 395-402)
5. Sanitization path (lines 407-456):
   - Detects gap > 10,000
   - Extracts valid operation data
   - Re-assigns clean sequential numbers (localMaxSeq+1, +2, +3...)
   - Merges with local operations
   - BUT: If state reconstruction has conflicts, data may be lost
6. Root issue: Operations had both:
   - Corrupted sequences (1.7B numbers)
   - Valid operation data (completions, sessions, etc.)
```

## Why Console Had Thousands of Lines
- "Skipping session start - already active for date" warnings repeated endlessly
- This indicates the state was corrupt and couldn't properly track sessions
- The app kept trying to recover, re-applying operations, and hitting the same error

## Critical Code Locations

**Where corruption is detected:**
- `src/sync/operationSync.ts:395-402` - Bootstrap corruption check
- Comparison: `cloudMaxSeq (1.7B) vs localMaxSeqBefore (100)`
- Threshold: `SEQUENCE_CORRUPTION_THRESHOLD = 10,000` (syncConfig.ts:32)

**Where sequences are generated:**
- `src/sync/operations.ts:162-176` - SequenceGenerator.next()
- Uses simple `++this.sequence` - looks correct
- Problem: Initial value or setSequence() call corrupted it

**Where sequences are set/reset:**
- `src/sync/operationLog.ts:139` - On load-time corruption fix
- `src/sync/operations.ts:211-212` - setSequence() function
- No validation in setSequence() that values are reasonable!

## Fix Required

### Part 1: Validate setSequence() Calls ⚠️ CRITICAL
```typescript
export function setSequence(seq: number): void {
  // CRITICAL: Reject unreasonable sequence numbers
  if (seq > 1000000) {
    logger.error('🚨 CRITICAL: Rejecting unreasonable sequence number:', {
      value: seq,
      reason: 'Likely Unix timestamp, not sequence number',
      recommendation: 'Check caller - is it passing Date.now() by mistake?'
    });
    return; // Don't poison the counter!
  }
  sequenceGenerator.set(seq);
}
```

### Part 2: Add Pre-Sync Validation ⚠️ IMPORTANT
```typescript
// In submitOperation() before sync
const operation = await operationLog.current.append(operationEnvelope);

// Validate before syncing
if (operation.sequence > 1000000) {
  logger.error('🚨 SYNC BLOCKED: Operation has corrupted sequence', {
    sequence: operation.sequence,
    type: operation.type,
  });
  throw new Error('Operation has corrupted sequence number - will not sync');
}
```

### Part 3: Repair Cloud Database ⚠️ IF NEEDED
If cloud still has corrupted sequences, run (as Supabase admin):
```sql
-- Re-assign clean sequences per user
WITH numbered_ops AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp, id) as new_sequence
  FROM navigator_operations
  WHERE sequence_number > 1000000
)
UPDATE navigator_operations ops
SET sequence_number = numbered_ops.new_sequence
FROM numbered_ops
WHERE ops.id = numbered_ops.id;
```

## Prevention Measures
1. ✅ Add upper-bound check in `setSequence()` - reject any seq > 1,000,000
2. ✅ Add pre-sync validation in `submitOperation()` 
3. ✅ Add test to verify sequences never jump unexpectedly
4. ✅ Add timestamp validation in migration functions
