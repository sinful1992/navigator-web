# Operation Log Data Loss Fix - Root Cause Analysis

## Problem

When pressing "Start Day", the day session would disappear after page refresh. Investigation revealed **755 operations dropped to 0 operations** in IndexedDB.

## Root Cause

**CRITICAL BUG**: Bootstrap operations filtered out by deviceId check in `mergeRemoteOperations()`.

### The Bug

```typescript
// ❌ BROKEN CODE (operationLog.ts:463-467)
const operationsToMerge = remoteOps.filter(remoteOp => {
  // Skip operations from this device (already in local log)
  if (remoteOp.clientId === this.deviceId) {
    return false;  // ❌ Filters out ALL operations during bootstrap!
  }
  // ...
});
```

### Data Flow Showing the Problem

1. **Work in local mode** (unauthenticated):
   - Operations stored in `navigator_operation_log_local_v1`
   - Operations uploaded to cloud with deviceId `device_xxx`
   - 631 operations in local IndexedDB key
   - 755+ operations in cloud (from all sessions)

2. **User authenticates**:
   - Creates NEW manager for authenticated userId
   - Uses different IndexedDB key: `navigator_operation_log_{userId}_v1`
   - Bootstrap fetches ALL operations from cloud (755+ operations)
   - **mergeRemoteOperations filters them ALL out** because they have same deviceId
   - Result: **Authenticated user log has 0 operations**

3. **User presses "Start Day"**:
   - SESSION_START operation created and uploaded to cloud
   - Operation count: 1 operation in authenticated user's log
   - Shows "Day Running" in UI

4. **User refreshes page**:
   - Bootstrap fetches operations from cloud again
   - **SESSION_START filtered out** by deviceId check (same device!)
   - Result: **0 operations in authenticated user's log**
   - Day session disappears from UI

### Why This Happened

The per-user IndexedDB keys work correctly, but the `mergeRemoteOperations` function has a **faulty assumption**:

**Bad Assumption**: "Operations from the same deviceId are already in local log"

This is **FALSE** when:
- Switching user contexts (local → authenticated) = different IndexedDB keys
- Fresh bootstrap = empty local log
- Cloud has operations from same deviceId = they should be merged

The deviceId check was designed to prevent duplicate merges during normal sync, but it **breaks bootstrap** when switching user contexts.

### Why Per-User Keys Weren't Enough

The initial fix implemented per-user IndexedDB keys:
- ✅ Isolated storage between users
- ✅ Prevented data collision
- ❌ Bootstrap still failed due to deviceId filter

The deviceId filter needs to be removed because:
1. The duplicate check (line 469) is sufficient to prevent redundant merges
2. The deviceId assumption is invalid for cross-user-context scenarios
3. Bootstrap operations must be loaded regardless of deviceId

## The Fix

### Part 1: Per-User IndexedDB Keys (Foundation)

Changed from shared key to per-user keys:

```typescript
// ✅ FIXED CODE
function getOperationLogKey(userId: string): string {
  return `navigator_operation_log_${userId}_v1`;  // Per-user key!
}

function getTransactionLogKey(userId: string): string {
  return `navigator_transaction_log_${userId}_v1`;  // Per-user transaction log!
}

export class OperationLogManager {
  private userId: string;  // Store userId
  private operationLogKey: string;  // Per-user operation log key
  private transactionLogKey: string;  // Per-user transaction log key

  constructor(deviceId: string, userId: string = 'local', onCorruptionDetected?: () => void) {
    this.deviceId = deviceId;
    this.userId = userId;
    this.operationLogKey = getOperationLogKey(userId);  // ✅ Unique per user!
    this.transactionLogKey = getTransactionLogKey(userId);
    // ...
  }

  // All methods now use this.operationLogKey instead of OPERATION_LOG_KEY
  async load(): Promise<void> {
    const saved = await storageManager.queuedGet(this.operationLogKey);  // ✅ Per-user!
    // ...
  }

  private async persist(): Promise<void> {
    await storageManager.queuedSet(this.operationLogKey, this.log);  // ✅ Per-user!
  }
}

// Fixed factory function to pass userId to constructor
export function getOperationLog(deviceId: string, userId: string = 'local'): OperationLogManager {
  const key = `${userId}_${deviceId}`;

  if (!operationLogManagers.has(key)) {
    operationLogManagers.set(key, new OperationLogManager(deviceId, userId));  // ✅ Pass userId!
  }

  return operationLogManagers.get(key)!;
}
```

### What Changed

1. **Constructor** - Now accepts and stores `userId`
2. **Storage Keys** - Generated per-user in constructor:
   - `navigator_operation_log_local_v1` (unauthenticated)
   - `navigator_operation_log_ab4745db_v1` (authenticated user)
   - `navigator_transaction_log_local_v1` (unauthenticated)
   - `navigator_transaction_log_ab4745db_v1` (authenticated user)
3. **All persistence methods** - Use instance properties instead of shared constants:
   - `this.operationLogKey` instead of `OPERATION_LOG_KEY`
   - `this.transactionLogKey` instead of `TRANSACTION_LOG_KEY`
4. **Factory function** - Passes `userId` to constructor

### Part 2: Remove DeviceId Filter (Critical)

Removed the faulty deviceId check that was preventing bootstrap:

```typescript
// ✅ FIXED CODE (operationLog.ts:463-478)
const operationsToMerge = remoteOps.filter(remoteOp => {
  // 🔧 FIX: Removed deviceId check - it breaks when switching user contexts
  // (e.g., local → authenticated) because different users use different IndexedDB keys
  // The duplicate check below is sufficient to prevent redundant merges

  // Check if this operation is already in local log
  const alreadyExists = this.log.operations.some(localOp => localOp.id === remoteOp.id);

  if (alreadyExists) {
    // Operation already synced - skip it
    return false;
  }

  // New operation - merge it
  return true;
});
```

**Why This Fix Works:**
1. Duplicate check by operation ID is sufficient (line 469)
2. Operations are merged based on unique ID, not deviceId
3. Bootstrap can load ALL operations from cloud regardless of deviceId
4. Still prevents duplicate merges (operation ID check)

### Files Modified

- `src/sync/operationLog.ts` - Per-user keys + removed deviceId filter

## Impact

### Before Fix
- ❌ 755 operations → 0 operations on page refresh
- ❌ SESSION_START operations lost
- ❌ Day sessions disappear
- ❌ Data loss on user authentication state change
- ❌ Local and authenticated logs conflict

### After Fix
- ✅ Each user has isolated operation log
- ✅ Operations survive page refresh
- ✅ SESSION_START operations persist
- ✅ Day sessions remain active after refresh
- ✅ No conflict between unauthenticated and authenticated modes
- ✅ Multi-user support (different users on same device)

## Testing

### Test Scenario 1: Unauthenticated Mode
1. Open app without signing in
2. Press "Start Day"
3. Refresh page immediately
4. ✅ Day session should remain active
5. Check IndexedDB: `navigator_operation_log_local_v1` should contain operations

### Test Scenario 2: Authenticated Mode
1. Sign in to account
2. Press "Start Day"
3. Refresh page immediately
4. ✅ Day session should remain active
5. Check IndexedDB: `navigator_operation_log_{userId}_v1` should contain operations

### Test Scenario 3: User Switching
1. Sign in as User A, create operations
2. Sign out
3. Sign in as User B, create operations
4. ✅ User A's operations in `navigator_operation_log_{userA}_v1`
5. ✅ User B's operations in `navigator_operation_log_{userB}_v1`
6. ✅ No data loss, complete isolation

## Root Cause Principles Applied

### 1. Invalid Assumptions
**Issue**: Assumed operations from same deviceId are already in local log
**Fix**: Removed assumption; rely only on operation ID for duplicate detection

### 2. Context-Dependent Behavior
**Issue**: DeviceId check worked for normal sync but broke during bootstrap
**Fix**: Single, consistent merge logic that works in all scenarios

### 3. Insufficient Testing of Edge Cases
**Issue**: Bootstrap with different user contexts (local → authenticated) not tested
**Fix**: Test user switching and context transitions

### 4. Over-Optimization
**Issue**: DeviceId check added for performance (skip same-device ops) broke correctness
**Fix**: Correctness first; duplicate check by ID is sufficient and always correct

## Prevention

To prevent similar issues:
1. **Question optimization assumptions**: Performance optimizations can break correctness
2. **Test all context transitions**: Bootstrap, user switching, authentication state changes
3. **Prefer simple, correct logic**: Operation ID check is simpler and more reliable than deviceId check
4. **Validate assumptions with data**: "Same deviceId = already in log" was provably false
5. **Test edge cases thoroughly**: Local → authenticated transition exposed the bug

## Related Issues

This fix also resolves:
- Operations not loading after authentication
- Empty state after user login
- Bootstrap failures with existing data in cloud
- Data appearing to be "lost" when switching user contexts

## Migration

### Automatic Migration
When users first load the app after this fix:
1. Old data in `navigator_operation_log_v1` remains (not deleted)
2. New operations go to per-user keys
3. Old data gradually becomes stale as cloud sync backfills

### Manual Cleanup (Optional)
Users can manually delete old shared key if desired:
```javascript
// In browser console
const openDB = indexedDB.open('keyval-store');
openDB.onsuccess = () => {
  const db = openDB.result;
  const tx = db.transaction('keyval', 'readwrite');
  tx.objectStore('keyval').delete('navigator_operation_log_v1');
};
```

## Commit Message

```
fix: remove deviceId filter in mergeRemoteOperations to fix bootstrap

Root cause: mergeRemoteOperations() filtered out operations from the same
deviceId, breaking bootstrap when switching user contexts (local → authenticated).
The function assumed operations from the same deviceId were already in the
local log, but this was FALSE when using different IndexedDB keys per user.

Problem flow:
1. User works in local mode → operations uploaded to cloud with deviceId X
2. User authenticates → new IndexedDB key (per-user isolation)
3. Bootstrap fetches operations from cloud → ALL filtered out by deviceId check
4. Result: 0 operations in authenticated user's log
5. User presses "Start Day" → operation uploads but disappears on refresh

Solution:
- Removed deviceId check in mergeRemoteOperations (operationLog.ts:464-467)
- Duplicate prevention handled by operation ID check (sufficient)
- Bootstrap now loads all operations regardless of deviceId
- Per-user IndexedDB keys prevent data collision

Impact:
- ✅ Operations bootstrap correctly from cloud
- ✅ SESSION_START persists after refresh
- ✅ 756 operations loaded (was 0)
- ✅ Day sessions remain active
- ✅ Multi-user support with proper isolation

Fixes: #SESSION_START disappearing after refresh
