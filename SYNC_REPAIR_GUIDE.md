# Sync Repair Guide

## Problem Overview

You're experiencing **sequence collision errors** where operations can't sync to the cloud because the sequence numbers already exist in the database. This causes:

1. ✗ Operations stuck in retry queue
2. ✗ Duplicate key constraint violations
3. ✗ Old state being reconstructed
4. ✗ Version conflicts on arrangements

## Root Cause

Most likely caused by:
- **Backup restore** that reset your local sequence counter
- **Sequence corruption** from a previous sync error
- **Multiple devices** with out-of-sync sequence counters

## How to Fix (Browser Console Method)

### Step 1: Open Browser Console
1. Open the Navigator app in your browser
2. Press **F12** (or right-click → Inspect → Console tab)
3. Make sure you're **signed in**

### Step 2: Run Diagnostics
```javascript
await window.syncRepair.status()
```

This will show:
- Local vs cloud sequence numbers
- Number of operations stuck in retry queue
- Number of sequence collisions detected
- Recommended action

### Step 3: Repair Sequence Collisions
If diagnostics show sequence collisions, run:
```javascript
await window.syncRepair.repair()
```

This will:
- Fetch the maximum sequence number from cloud
- Reassign new sequences to all colliding operations
- Clear them from retry queue
- Mark cloud sequences as synced

### Step 4: Verify Fix
Wait 10 seconds for automatic sync to retry, then check:
```javascript
await window.syncRepair.status()
```

You should see:
- ✅ Status: HEALTHY
- ✅ Sequence collisions: 0
- ✅ Retry queue: 0

## Advanced Commands

### Full Diagnostics Report
```javascript
await window.syncRepair.diagnose()
```

### Clear All Failed Operations (DESTRUCTIVE)
⚠️ **WARNING**: This permanently deletes failed operations!
```javascript
await window.syncRepair.clearFailed()
```
Only use this as a last resort if repair doesn't work.

### Show Help
```javascript
window.syncRepair.help()
```

## Manual UI Method (Alternative)

If console method doesn't work:

### Option 1: Let Auto-Repair Handle It
The code now automatically detects sequence collisions and reassigns sequences. Just wait for the next sync attempt (every 2 seconds).

### Option 2: Clear Retry Queue via Settings
1. Go to **Settings** tab
2. Scroll to **Sync Status** section
3. If you see failed operations, you can manually retry or clear them
4. **Note**: This clears the symptoms but doesn't fix the root cause

### Option 3: Full Reset (NUCLEAR OPTION)
⚠️ **WARNING**: Only use if repair doesn't work and you have a recent backup!

1. Export backup: Settings → Backup & Restore → Download Backup
2. Sign out
3. Clear IndexedDB:
   - Browser console: `indexedDB.deleteDatabase('navigator-db')`
   - Browser console: `indexedDB.deleteDatabase('navigator-dead-letter-queue')`
4. Sign in
5. Import backup
6. Repair sequences if needed

## Version Conflicts (Arrangements)

The arrangement version conflict is **separate from sequence collisions**. It's the optimistic concurrency system working correctly.

When you see:
```
⚠️ Version Conflict Detected
Current version 2
Expected version 1
```

This means you edited the arrangement on two devices before they synced. To resolve:

1. Review both versions in the modal
2. Choose which changes to keep:
   - **Keep My Changes**: Use this device's version
   - **Use Remote Changes**: Use the other device's version
3. Click **Resolve Conflict**

The version you don't choose will be **permanently discarded**.

## Why Old List is Reconstructed

State is built from the operation log. If sync is blocked:
- Operations stuck in retry queue aren't uploaded
- Cloud has old operations
- When you refresh, state is rebuilt from cloud operations
- Result: Old list appears

**Fix**: Repair sequence collisions first, then:
1. Wait for sync to complete
2. Refresh the page
3. New list should appear

## Prevention

To avoid this in the future:

1. **Before restoring backup**:
   - Check sync status first
   - Ensure all operations are synced
   - After restore, run repair immediately

2. **Multiple devices**:
   - Let each device sync before switching
   - Don't work offline on both devices simultaneously
   - If you do, expect version conflicts (normal)

3. **If you see errors**:
   - Run diagnostics immediately
   - Don't create more operations until fixed
   - Check browser console for errors

## Technical Details

### Unique Constraint
Database has: `UNIQUE(user_id, sequence_number)`

Each user can only have one operation per sequence number. If you try to upload an operation with sequence 1547, but cloud already has 1547, you get:
```
duplicate key value violates unique constraint "navigator_operations_user_sequence_unique"
```

### Sequence Collision Auto-Repair
The code now automatically:
1. Detects `SEQUENCE_COLLISION` error during upload
2. Fetches current max sequence from cloud
3. Updates local sequence generator
4. Reassigns new sequence to failed operation
5. Retries upload with new sequence

However, if **many operations** are colliding, auto-repair runs for each one individually, which is slow. The `syncRepair.repair()` command fixes **all collisions at once** (much faster).

### Operation Flow
```
Local Operation Created
  ↓ sequence assigned (e.g., 1547)
  ↓ saved to IndexedDB
  ↓ sync triggered
  ↓ upload to Supabase
  ↓ DUPLICATE KEY ERROR (1547 already exists in cloud)
  ↓ added to retry queue
  ↓ exponential backoff retry
  ↓ eventually moved to dead letter queue (10 retries)

With Repair:
  ↓ repair() detects collision
  ↓ reassigns new sequence (e.g., 2153)
  ↓ updates IndexedDB
  ↓ sync triggered
  ↓ upload succeeds
  ✓ synced
```

## Need Help?

If repair doesn't work or you're stuck:

1. **Export your operation log**:
   ```javascript
   const log = (await import('./sync/operationLog.js')).getOperationLog(
     localStorage.getItem('navigator_device_id'),
     'your-user-id'
   );
   await log.load();
   console.log('Operations:', log.getAllOperations());
   ```

2. **Check browser console** for error messages

3. **Report issue** with:
   - Diagnostic output (`window.syncRepair.diagnose()`)
   - Browser console errors
   - Steps that led to the issue

## Success Indicators

You know it's fixed when:
- ✅ `window.syncRepair.status()` shows "HEALTHY"
- ✅ Retry queue is empty (0 operations)
- ✅ No sequence collisions detected
- ✅ New completions sync immediately
- ✅ Refreshing page shows correct data
- ✅ No errors in browser console

## Known Issues

### Timer Not Syncing Across Devices
If you start a timer on Device A and complete on Device B, Device A's timer may keep running. This is a **separate bug** being investigated. The timer protection system prevents cloud sync from clearing `activeIndex` while a timer is running, even if the address was completed elsewhere.

**Workaround**:
- Manually cancel the timer on Device A
- Or complete the address on the same device you started it on
- Or wait for the fix (coming soon)
