# Address Time Tracking Fix

## Problem Summary

Users were losing time tracking data when spending long periods (2+ hours) working on individual addresses. When pressing "Start" on an address to track time, the accumulated time would be lost and not saved to the completion record.

## Root Causes

### Bug #1: Active Protection Expires After 5 Seconds (CRITICAL)

**Location**: `src/utils/protectionFlags.ts:14`

**Issue**:
- When user presses "Start" on an address, `navigator_active_protection` flag is set to block cloud sync interference
- Protection flag was configured to expire after only 5 seconds
- After expiration, cloud sync could push updates that clear `activeIndex` and `activeStartTime`
- Time calculation logic requires both `activeIndex` and `activeStartTime` to be present
- Result: All accumulated time lost when completing the address

**Timeline of Bug**:
1. User presses "Start" at 2:00 PM → `activeIndex = 50`, `activeStartTime = "2025-10-20T14:00:00Z"`
2. Protection flag set with 5-second timeout
3. After 5 seconds, protection expires
4. Cloud sync pushes update at 3:30 PM
5. `activeIndex` cleared to `null` (while `activeStartTime` remains)
6. User completes address at 4:00 PM (2 hours later)
7. Time calculation fails: `if (activeIndex === index && activeStartTime)` → condition false
8. `timeSpentSeconds` never calculated → **2 hours of time lost**

### Bug #2: Time Lost When Completed on Another Device (CRITICAL)

**Location**: `src/useAppState.ts:1642-1645` (before fix)

**Issue**:
- When address is completed on another device, cloud sync detects completion
- Code immediately clears `activeIndex` and `activeStartTime` without saving local time
- User's local time tracking completely lost

**Timeline of Bug**:
1. User A works on address for 2 hours locally
2. User B completes same address on another device
3. Cloud sync brings in User B's completion
4. User A's `activeIndex` and `activeStartTime` cleared
5. **User A's 2 hours of time lost** without being saved anywhere

## Fixes Implemented

### Fix #1: Infinite Active Protection

**File**: `src/utils/protectionFlags.ts:14`

```typescript
// BEFORE
'navigator_active_protection': 5000  // 5 seconds

// AFTER
'navigator_active_protection': Infinity  // Never expire - only cleared on complete/cancel
```

**Impact**:
- Protection flag never expires automatically
- Only cleared when user explicitly completes or cancels the address
- Cloud sync completely blocked for entire duration of work session
- Prevents any interference with `activeIndex` and `activeStartTime`

**Code References**:
- Protection set: `useAppState.ts:832`
- Protection cleared on complete: `useAppState.ts:1012`
- Protection cleared on cancel: `useAppState.ts:869`
- Cloud sync check: `useCloudSync.ts:1623-1626`

### Fix #2: Save Local Time Before Clearing

**File**: `src/useAppState.ts:1610-1635`

```typescript
if (activeAddressCompleted) {
  logger.info(`🔄 Address "${activeAddress.address}" was completed on another device`);

  // 🔧 FIX: Save local time tracking before clearing active state
  if (finalState.activeStartTime) {
    const startTime = new Date(finalState.activeStartTime).getTime();
    const endTime = Date.now();
    const timeSpentSeconds = Math.floor((endTime - startTime) / 1000);

    // Find the completion from the other device
    const existingCompletion = finalState.completions.find(c =>
      c.address === activeAddress.address &&
      (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
    );

    if (existingCompletion && !existingCompletion.timeSpentSeconds) {
      // Add our local time to the existing completion
      logger.info(`⏱️ SAVING LOCAL TIME: Adding ${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s to completion from other device`);
      existingCompletion.timeSpentSeconds = timeSpentSeconds;
    } else if (existingCompletion && existingCompletion.timeSpentSeconds) {
      logger.info(`⏱️ Time already tracked on other device: ${Math.floor(existingCompletion.timeSpentSeconds / 60)}m ${existingCompletion.timeSpentSeconds % 60}s`);
    }
  }

  finalState = { ...finalState, activeIndex: null, activeStartTime: null };
}
```

**Impact**:
- Calculates elapsed time before clearing active state
- Finds the completion record from other device
- Adds local time tracking to existing completion if not already present
- Prevents time data loss in multi-device scenarios

## How Address Time Tracking Works

### Data Structure

**Types** (`src/types.ts`):
```typescript
export type AppState = {
  activeIndex: number | null;           // Currently active address index
  activeStartTime?: string | null;      // ISO timestamp when address became active
  // ... other fields
};

export type Completion = {
  timeSpentSeconds?: number;            // Time spent on this case in seconds
  // ... other fields
};
```

### Flow

1. **Start Timer**: User presses "Start" button
   - `activeIndex` set to address index
   - `activeStartTime` set to ISO timestamp
   - Protection flag set with `localStorage.setItem('navigator_active_protection', 'true')`
   - Location: `useAppState.ts:830-864`

2. **Display Timer**: Real-time UI updates
   - `ElapsedTimer` component calculates elapsed time every second
   - Pure UI-side calculation: `(Date.now() - startTime) / 1000`
   - Location: `AddressList.tsx:23-52`

3. **Complete Address**: User presses outcome button (PIF, Done, DA, ARR)
   - Calculate time: `timeSpentSeconds = (endTime - startTime) / 1000`
   - Add to completion record
   - Clear `activeIndex` and `activeStartTime`
   - Clear protection flag
   - Location: `useAppState.ts:941-948, 999-1013`

### Time Calculation Logic

```typescript
// Location: useAppState.ts:941-948
let timeSpentSeconds: number | undefined;
if (currentState.activeIndex === index && currentState.activeStartTime) {
  const startTime = new Date(currentState.activeStartTime).getTime();
  const endTime = new Date(nowISO).getTime();
  timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
  logger.info(`⏱️ CASE TIME TRACKED: ${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s on "${address.address}"`);
}
```

**Critical Requirements**:
- Both `activeIndex` and `activeStartTime` must be present
- `activeIndex` must match the address being completed
- If either condition fails, `timeSpentSeconds` remains `undefined`

## Additional Safeguards

### Error Detection

**Import While Active** (`useAppState.ts:756-758`):
```typescript
if (s.activeIndex !== null) {
  logger.error(`❌ IMPORT WHILE ACTIVE: This should never happen! activeIndex=${s.activeIndex}, protection should be blocking this`);
}
```

**Invalid Index During Sync** (`useAppState.ts:1600-1602`):
```typescript
if (!activeAddress) {
  logger.error(`❌ INVALID activeIndex during cloud sync: Index ${oldActiveIndex} is out of bounds. Protection should have blocked this!`);
  finalState = { ...finalState, activeIndex: null, activeStartTime: null };
}
```

These error logs help identify if protection fails or is bypassed unexpectedly.

## Testing Scenarios

Time tracking now survives:
- ✅ Long work sessions (any duration - 5 seconds to 24+ hours)
- ✅ Address completed on another device (local time saved)
- ✅ Cloud sync attempts during active session (blocked)
- ✅ Multiple hours of work without completion

Legitimate time loss (by design):
- ❌ User clicks "Cancel" button (intentional action)
- ❌ Address removed from list entirely (no longer exists)

## Logger Messages

**Time Tracking Saved**:
- `⏱️ CASE TIME TRACKED: 125m 30s on "123 Main St"` (normal completion)
- `⏱️ SAVING LOCAL TIME: Adding 125m 30s to completion from other device` (multi-device)
- `⏱️ Time already tracked on other device: 45m 30s` (other device had time)

**Protection Working**:
- `🛡️ ACTIVE PROTECTION: Blocking cloud update - user is working on address`
- `📍 STARTING CASE: Address #50 "123 Main St" at 2025-10-20T14:00:00Z - SYNC BLOCKED`
- `📍 COMPLETED ACTIVE ADDRESS: Clearing active state - SYNC RESUMED`

**Errors (should not happen)**:
- `❌ IMPORT WHILE ACTIVE: This should never happen!`
- `❌ INVALID activeIndex during cloud sync: Protection should have blocked this!`

## Related Code Files

- `src/useAppState.ts` - State management, time calculation, completion logic
- `src/AddressList.tsx` - UI timer display, Start/Cancel buttons
- `src/utils/protectionFlags.ts` - Protection flag configuration
- `src/useCloudSync.ts` - Cloud sync blocking logic
- `src/types.ts` - Type definitions for `activeIndex`, `activeStartTime`, `timeSpentSeconds`

## Migration Notes

**Breaking Changes**: None

**Behavioral Changes**:
- Active protection now persists indefinitely (was 5 seconds)
- Time tracking saved when address completed on another device (was lost)
- Import/route optimization properly blocked while address active (already existed, now enforced)

**Data Compatibility**: Fully backward compatible with existing completion records
