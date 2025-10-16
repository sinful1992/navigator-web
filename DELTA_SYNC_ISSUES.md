# Delta Sync - Critical Issues Found

## 🚨 Critical Issues (Must Fix Before Enabling)

### 1. **Sequence Number Race Condition** (CRITICAL)
**File**: `src/sync/operations.ts:129-132`

**Problem**:
```typescript
let localSequence = 0;
export function nextSequence(): number {
  return ++localSequence; // NOT THREAD-SAFE!
}
```

**Issue**: If two operations are created simultaneously (e.g., user completes address while auto-save triggers), they could get the same sequence number.

**Impact**:
- Unique constraint violation in database
- Operations could overwrite each other
- Data loss

**Fix**: Use atomic counter with mutex/lock

---

### 2. **Migration SQL - Sequence Collision** (CRITICAL)
**File**: `supabase/migrations/20250116000001_upgrade_navigator_operations_schema.sql:49`

**Problem**:
```sql
sequence_number = COALESCE(sequence_number, extract(epoch from timestamp)::bigint)
```

**Issue**: Multiple operations with same timestamp will get same sequence number, violating unique constraint

**Impact**:
- Migration will fail if any operations have identical timestamps
- Cannot upgrade database

**Fix**: Add row number to ensure uniqueness

---

### 3. **Global Singleton Leaks User Data** (CRITICAL - SECURITY)
**File**: `src/sync/operationLog.ts:236-243`

**Problem**:
```typescript
let operationLogManager: OperationLogManager | null = null;
export function getOperationLog(deviceId: string): OperationLogManager {
  if (!operationLogManager) {
    operationLogManager = new OperationLogManager(deviceId);
  }
  return operationLogManager; // Returns same instance for different users!
}
```

**Issue**: When User A signs out and User B signs in, User B gets User A's operation log

**Impact**:
- **DATA LEAK**: User B can see User A's operations
- **DATA CORRUPTION**: User B's operations mixed with User A's
- Privacy violation

**Fix**: Clear singleton on sign out, or key by user ID

---

## ⚠️ High Priority Issues

### 4. **No Backpressure on submitOperation**
**File**: `src/sync/operationSync.ts:161-198`

**Problem**: Every operation triggers immediate cloud sync

**Impact**:
- 100 rapid completions = 100 sync requests
- Can overwhelm database
- Poor performance

**Fix**: Batch operations or debounce sync

---

### 5. **Auto-sync Timer Leak**
**File**: `src/sync/operationSync.ts:405-417`

**Problem**:
```typescript
useEffect(() => {
  const syncTimer = setTimeout(async () => {
    await syncOperationsToCloud();
  }, 1000);
  return () => clearTimeout(syncTimer);
}, [user, isOnline, syncOperationsToCloud]);
```

**Issue**: `syncOperationsToCloud` changes on every render, creating new timer each time

**Impact**:
- Memory leak
- Multiple concurrent syncs
- Performance degradation

**Fix**: Use `useCallback` with stable dependencies or ref-based timer

---

### 6. **Subscription Never Cleans Up Duplicates**
**File**: `src/sync/operationSync.ts:310-366`

**Problem**: `subscribeToOperations` creates new subscription each time, doesn't check for existing

**Impact**:
- Multiple subscriptions to same channel
- Same operation processed multiple times
- Duplicate data

**Fix**: Store subscription ref and cleanup before creating new one

---

### 7. **Mode Switch Can Lose Data**
**File**: `src/sync/migrationAdapter.ts:158-182`

**Problem**: When switching from legacy to operations mode, doesn't check for pending legacy sync

**Impact**:
- Unsaved changes in legacy mode lost when switching
- User expects data to be saved

**Fix**: Force legacy sync before mode switch

---

## 📋 Medium Priority Issues

### 8. **Weak Checksum Implementation**
**File**: `src/sync/operationLog.ts:229-233`

**Problem**:
```typescript
private computeChecksum(): string {
  return `${this.log.operations.length}-${this.log.lastSequence}`;
}
```

**Issue**: Won't detect data corruption, only counts operations

**Impact**:
- Can't detect if operation content changed
- Can't detect if operations were reordered
- False sense of data integrity

**Fix**: Use proper hash (SHA-256) of operation data

---

### 9. **Arbitrary Conflict Window**
**File**: `src/sync/conflictResolution.ts:89-90`

**Problem**: 5 second race condition window is arbitrary

**Impact**:
- Could miss real conflicts (>5 seconds apart)
- Could flag false positives (<5 seconds apart but intentional)

**Fix**: Use operation sequence numbers for conflict detection instead of time

---

### 10. **No Error Recovery in mergeRemoteOperations**
**File**: `src/sync/operationLog.ts:126-168`

**Problem**: If merge fails partway through, log is in inconsistent state

**Impact**:
- Partial merge leaves corrupted log
- Can't recover without clearing all data

**Fix**: Use transaction-like approach (all-or-nothing merge)

---

## 🔧 Recommended Fixes

### Fix 1: Thread-Safe Sequence Counter
```typescript
// src/sync/operations.ts
class SequenceGenerator {
  private sequence = 0;
  private pending = 0;
  private lock = Promise.resolve();

  async next(): Promise<number> {
    // Queue this request
    const myTurn = this.lock;
    let release: () => void;
    this.lock = new Promise(resolve => { release = resolve; });

    await myTurn; // Wait for previous requests
    const seq = ++this.sequence;
    release!(); // Let next request proceed
    return seq;
  }

  set(seq: number): void {
    this.sequence = Math.max(this.sequence, seq);
  }
}

const sequenceGenerator = new SequenceGenerator();
export const nextSequence = () => sequenceGenerator.next();
export const setSequence = (seq: number) => sequenceGenerator.set(seq);
```

### Fix 2: Safe Migration SQL
```sql
-- Use ROW_NUMBER() to ensure unique sequences
WITH numbered_ops AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY timestamp, id) as new_sequence
  FROM public.navigator_operations
  WHERE sequence_number IS NULL
)
UPDATE public.navigator_operations ops
SET sequence_number = numbered_ops.new_sequence
FROM numbered_ops
WHERE ops.id = numbered_ops.id;
```

### Fix 3: User-Isolated Operation Log
```typescript
// src/sync/operationLog.ts
const operationLogManagers = new Map<string, OperationLogManager>();

export function getOperationLog(deviceId: string, userId: string): OperationLogManager {
  const key = `${userId}_${deviceId}`;

  if (!operationLogManagers.has(key)) {
    operationLogManagers.set(key, new OperationLogManager(deviceId, userId));
  }

  return operationLogManagers.get(key)!;
}

export function clearOperationLog(userId: string): void {
  for (const [key, manager] of operationLogManagers.entries()) {
    if (key.startsWith(userId)) {
      manager.clear();
      operationLogManagers.delete(key);
    }
  }
}
```

### Fix 4: Batched Operation Sync
```typescript
// src/sync/operationSync.ts
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;

const pendingOperations: Operation[] = [];
let batchTimer: NodeJS.Timeout | null = null;

const submitOperation = useCallback(async (operationData) => {
  const operation = await operationLog.current!.append(operationEnvelope);

  // Add to batch
  pendingOperations.push(operation);

  // Schedule batch sync
  if (batchTimer) clearTimeout(batchTimer);

  if (pendingOperations.length >= BATCH_SIZE) {
    // Batch full - sync immediately
    await syncBatch();
  } else {
    // Wait for more operations
    batchTimer = setTimeout(syncBatch, BATCH_DELAY_MS);
  }
}, []);

const syncBatch = async () => {
  const batch = [...pendingOperations];
  pendingOperations.length = 0;

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  await syncOperationsToCloud();
};
```

---

## 🚫 DO NOT ENABLE Delta Sync Until Fixed

**Critical Issues** (1-3) MUST be fixed before any testing.

**High Priority Issues** (4-7) should be fixed before production rollout.

**Medium Priority Issues** (8-10) can be addressed after initial testing.

---

## Testing Plan After Fixes

1. **Unit Tests**:
   - Test sequence generator under concurrent load
   - Test migration SQL with duplicate timestamps
   - Test user isolation (sign out/sign in different user)

2. **Integration Tests**:
   - Complete 100 addresses rapidly
   - Switch modes with pending sync
   - Test offline → online with queued operations

3. **Multi-Device Tests**:
   - Same operation on 2 devices simultaneously
   - Verify conflict resolution works
   - Check no duplicates created

4. **Load Tests**:
   - 1000 operations in 10 seconds
   - Verify no sequence collisions
   - Check memory doesn't leak

---

## Recommendation

**DO NOT enable delta sync yet.** The critical issues (especially #1 and #3) can cause:
- Data corruption
- User data leakage between accounts
- Database constraint violations

Fix critical issues first, then test thoroughly before any rollout.
