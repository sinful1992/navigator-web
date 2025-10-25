# Sync Diagnostic Guide

## Problem
Data restores from backup but disappears after a while when cloud sync runs.

## Diagnostic Steps

### Step 1: Check if operations exist in cloud (Device A)

On Device A (the device with 7 addresses):

1. Open browser console (F12)
2. Run this command:
```javascript
await window.syncDebug.checkCloud()
```

This will show the last 20 operations in the cloud database.

**Expected**: You should see ADDRESS_BULK_IMPORT operations with 7 addresses

**If you don't see them**: Device A is NOT uploading operations to cloud!

---

### Step 2: Check local operation log (Device A)

On Device A:

```javascript
await window.syncDebug.getStats()
```

**Expected**: Should show operations including ADDRESS_BULK_IMPORT

**Key metrics**:
- Total operations: Should be > 0
- Last synced sequence: Should match total operations (if fully synced)
- Unsynced operations: Should be 0

**If unsynced > 0**: Operations are stuck locally and not uploading!

---

### Step 3: Compare local vs cloud (Device A)

```javascript
await window.syncDebug.compare()
```

This shows if local operations match cloud operations.

**If local > cloud**: Sync is failing, operations not uploading

---

### Step 4: Force upload (Device A)

If operations aren't in cloud, force upload them:

```javascript
await window.syncDebug.repairSync()
```

This will:
1. Reset sync sequence
2. Upload ALL local operations to cloud
3. Mark them as synced

---

### Step 5: Verify on Device B

After force upload from Device A:

1. On Device B, refresh the page
2. Check if 7 addresses appear

**If they appear**: Upload was the problem
**If they don't**: Different issue (state reconstruction)

---

## Common Issues

### Issue 1: Device A not authenticated
**Symptom**: Console shows "Not authenticated" errors
**Fix**: Sign in on Device A before testing

### Issue 2: Device A offline during address import
**Symptom**: Addresses in local state but not in cloud
**Fix**: Run `repairSync()` when back online

### Issue 3: Protection flags blocking sync
**Symptom**: Logs show "PROTECTION: Skipping cloud state update"
**Fix**: Clear protection flags in localStorage

### Issue 4: Different users on devices
**Symptom**: Each device has different data
**Fix**: Ensure both devices signed in with SAME account

---

## Next Steps Based on Results

### If operations ARE in cloud (Device A):
→ Problem is on Device B (state reconstruction or filtering)
→ Need to debug why Device B ignores operations

### If operations NOT in cloud (Device A):
→ Problem is upload failure
→ Check network, authentication, Supabase connection
→ Use `repairSync()` to force upload

### If operations in cloud BUT Device B still empty:
→ Problem is Device B reconstruction
→ Check operation log on Device B
→ May need to clear local cache and re-bootstrap
