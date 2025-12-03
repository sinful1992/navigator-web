# Changelog

All notable changes to Navigator Web are documented in this file.

---

## [Unreleased] - 2024-12-03

### Fixed

#### Sync System Overhaul
Major fixes to the operation-based sync system that was rejecting legitimate data.

**1. Sequence Corruption Prevention**
- Added input validation to `setSequence()` - rejects NaN, Infinity, undefined
- Filter invalid sequences before `Math.max()` calls to prevent NaN poisoning
- Fixed falsy check that incorrectly skipped sequence `0` (valid value)
- Real-time operations now use `sequence_number` column from database
- Added NaN/Infinity detection during operation log load

**2. Duplicate Detection Fix**
- Removed flawed nonce-based "replay attack" detection
- Operations were incorrectly rejected when arriving via multiple channels (bootstrap + real-time)
- The nonce check used operation ID as fallback, causing false positives
- Now relies solely on operation ID matching in `mergeRemoteOperations()` - simpler and correct

**3. Completion Duplicate Fix**
- Removed timestamp-based completion duplicate check in reducer
- Each operation has a unique ID - different IDs = different operations
- Timestamp matching was dropping legitimate completions when two devices completed at same millisecond

**4. Invalid Sequence Handling**
- Changed from skipping operations with invalid sequences to assigning fallback sequence (`Date.now()`)
- Prevents data loss while still handling Supabase bigint errors

### Removed

**Dead Code Cleanup**
- Removed 6 obsolete sync files (~35KB): `syncApi.ts`, `syncTypes.ts`, `syncTester.ts`, `SyncStatusIcon.tsx`, `SyncDebugPanel.tsx`, `commandQueue.ts`
- Removed `conflictResolution.test.ts` (tested removed vector clock code)
- Removed 72 obsolete documentation files (~30,000 lines)

---

## Summary

The sync system was rejecting legitimate operations due to:
1. NaN sequences poisoning the sequence generator
2. Nonce checks incorrectly flagging operations as "replay attacks"
3. Timestamp matching dropping valid completions

All issues traced to one principle: **Each operation has a unique ID. If IDs differ, they're different operations and should both be processed.**
