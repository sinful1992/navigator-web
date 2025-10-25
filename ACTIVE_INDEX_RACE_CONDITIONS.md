# Active Index Race Conditions - Investigation Report

## 🚨 Critical Findings

Found **5 race conditions** in the activeIndex state management that cause **time tracking data loss** and **state corruption** in multi-device scenarios.

---

## **Bug #1: Protection Flag Uses Wrong Data Type** 🔴 CRITICAL - ROOT CAUSE

### Location
- `src/useAppState.ts:851`
- `src/useAppState.ts:902`
- `src/useAppState.ts:1055`

### The Problem

**Code sets protection flag to string "true":**
```typescript
// Line 851
localStorage.setItem('navigator_active_protection', 'true');
```

**But protectionFlags.ts expects a timestamp (number):**
```typescript
// src/utils/protectionFlags.ts:33-42
export function isProtectionActive(flag: ProtectionFlag): boolean {
  const stored = localStorage.getItem(flag);
  if (!stored) return false;

  const timestamp = parseInt(stored, 10);
  if (isNaN(timestamp)) {
    // Corrupted flag, clear it
    clearProtectionFlag(flag);
    return false;  // ❌ Returns false!
  }

  const timeout = FLAG_CONFIGS[flag];  // Infinity for active protection
  const elapsed = Date.now() - timestamp;

  if (elapsed >= timeout) {
    clearProtectionFlag(flag);
    return false;
  }

  return true;
}
```

### What Happens

```
Timeline:
1. User presses "Start" on address #5 at 10:00 AM
2. setActive() sets: localStorage.setItem('navigator_active_protection', 'true')
3. activeIndex=5, activeStartTime="10:00:00" saved to state
4. User works on case for 2 hours...
5. At 11:30 AM, cloud sync fires from another device
6. App.tsx:445 checks: isProtectionActive('navigator_active_protection')
7. protectionFlags.ts parses "true" → parseInt("true", 10) = NaN
8. NaN is invalid timestamp, so it CLEARS the flag
9. isProtectionActive() returns FALSE ❌
10. Cloud sync PROCEEDS with state update
11. Cloud data has activeIndex=null, activeStartTime=null
12. Local state gets overwritten: activeIndex=null, activeStartTime=null
13. At 12:00 PM, user completes the case
14. complete() function checks: if (activeIndex === 5 && activeStartTime)
15. Condition is FALSE (both are null now)
16. Time calculation SKIPPED
17. completion.timeSpentSeconds = undefined ❌
18. 2 HOURS OF TIME TRACKING DATA LOST!
```

### Evidence from Logs

From `ADDRESS_TIME_TRACKING_FIX.md:134`:
```
Protection flag set with localStorage.setItem('navigator_active_protection', 'true')
```

But from `src/utils/protectionFlags.ts:21-25`:
```typescript
export function setProtectionFlag(flag: ProtectionFlag): number {
  const now = Date.now();
  localStorage.setItem(flag, now.toString());  // ← Expects timestamp!
  return now;
}
```

**The code is NOT using the `setProtectionFlag()` helper function!**

### Impact

- ❌ **CRITICAL:** Protection flag is **COMPLETELY BROKEN**
- ❌ Cloud sync is **NOT being blocked** when address is active
- ❌ `activeIndex` and `activeStartTime` get cleared during work sessions
- ❌ Time tracking data **LOST** on long work sessions (2+ hours)
- ❌ This is the ROOT CAUSE of user's reported time tracking loss!

### Fix Required

Replace all instances of:
```typescript
localStorage.setItem('navigator_active_protection', 'true');
```

With:
```typescript
setProtectionFlag('navigator_active_protection');
```

And all instances of:
```typescript
localStorage.removeItem('navigator_active_protection');
```

With:
```typescript
clearProtectionFlag('navigator_active_protection');
```

**Locations to fix:**
- `src/useAppState.ts:851` - setActive()
- `src/useAppState.ts:864` - setActive() validation failure #1
- `src/useAppState.ts:878` - setActive() validation failure #2
- `src/useAppState.ts:902` - cancelActive()
- `src/useAppState.ts:1055` - complete() when completing active address

---

## **Bug #2: Time Calculation Races with Cloud Sync** ⚠️ HIGH

### Location
`src/useAppState.ts:949-1011`

### The Problem

**complete() captures state at function entry, but uses it much later:**
```typescript
const complete = React.useCallback(
  async (index: number, outcome: Outcome, ...): Promise<string> => {
    // Line 960: Capture baseState ONCE at function entry
    const currentState = baseState;

    // Lines 952-1000: Lots of validation logic (48 lines!)
    // During this time, cloud sync can fire and change baseState!

    // Line 1002: Generate timestamp
    const nowISO = new Date().toISOString();

    // Lines 1004-1011: Calculate time using STALE currentState
    let timeSpentSeconds: number | undefined;
    if (currentState.activeIndex === index && currentState.activeStartTime) {
      const startTime = new Date(currentState.activeStartTime).getTime();
      const endTime = new Date(nowISO).getTime();
      timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
    }
    // If cloud sync cleared activeIndex between line 960 and 1006, time calculation FAILS!
```

### Race Condition Timeline

```
10:00:00.000 - User starts address #5 (activeIndex=5, activeStartTime="10:00:00")
12:00:00.000 - User presses "Complete" button
12:00:00.001 - complete() function called
12:00:00.002 - Line 960: const currentState = baseState (captures snapshot)
12:00:00.003 - Lines 952-1000: Validation logic executes (48 lines of code)
12:00:00.050 - Cloud sync fires (Bug #1 means protection is broken!)
12:00:00.051 - Cloud sync updates baseState: {activeIndex: null, activeStartTime: null}
12:00:00.100 - Line 1002: Generate timestamp
12:00:00.101 - Line 1006: Check currentState.activeIndex === index
12:00:00.102 - ❌ STILL uses OLD snapshot! currentState.activeIndex = 5 (good!)
12:00:00.103 - ✅ Time calculation succeeds because we captured the snapshot
```

**Wait, this is actually SAFE because of the snapshot!**

But there's a different problem:

```typescript
// Line 1052-1065: Update state
setBaseState((s) => {
  if (s.activeIndex === index) {
    localStorage.removeItem('navigator_active_protection');
    logger.info(`📍 COMPLETED ACTIVE ADDRESS: Clearing active state - SYNC RESUMED`);
  }

  return {
    ...s,
    completions: [completion, ...s.completions],
    activeIndex: s.activeIndex === index ? null : s.activeIndex,
    activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
  };
});
```

**The REAL problem is if cloud sync fires BETWEEN the time calculation and the setBaseState():**

```
12:00:00.000 - complete() called
12:00:00.002 - currentState captured (activeIndex=5, activeStartTime="10:00")
12:00:00.100 - Line 1006-1010: Time calculated successfully ✅
12:00:00.101 - completion object created with timeSpentSeconds=7200 ✅
12:00:00.102 - Cloud sync fires (Bug #1!)
12:00:00.103 - Cloud sync updates baseState: {activeIndex: null}
12:00:00.104 - Line 1052: setBaseState() callback executes
12:00:00.105 - Checks: if (s.activeIndex === index)  // s.activeIndex is null!
12:00:00.106 - Condition FALSE, so protection flag NOT cleared!
12:00:00.107 - State updated: completions = [completion, ...s.completions]
12:00:00.108 - ⚠️ Protection flag STILL ACTIVE (wasn't cleared!)
12:00:00.109 - Cloud sync BLOCKED forever! ❌
```

Actually, this isn't causing time loss, but it's causing protection flag to stay active forever!

### Impact

- 🟡 **MEDIUM:** Protection flag may not be cleared if cloud sync races with completion
- 🟡 Cloud sync could be blocked forever after completion
- ✅ Time calculation is SAFE due to snapshot capture

### Fix Required

Capture both activeIndex and activeStartTime at function entry:
```typescript
const complete = React.useCallback(
  async (index: number, outcome: Outcome, ...): Promise<string> => {
    const currentState = baseState;

    // Capture active state immediately
    const wasActive = currentState.activeIndex === index;
    const capturedStartTime = wasActive ? currentState.activeStartTime : null;

    // ... validation ...

    // Use captured values instead of currentState
    let timeSpentSeconds: number | undefined;
    if (wasActive && capturedStartTime) {
      const startTime = new Date(capturedStartTime).getTime();
      const endTime = new Date(nowISO).getTime();
      timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
    }

    // ... later ...

    setBaseState((s) => {
      // Always clear protection if we captured wasActive
      if (wasActive) {
        clearProtectionFlag('navigator_active_protection');
      }

      return {
        ...s,
        completions: [completion, ...s.completions],
        activeIndex: s.activeIndex === index ? null : s.activeIndex,
        activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
      };
    });
```

---

## **Bug #3: setState() Mutates Completion Object** ⚠️ HIGH

### Location
`src/useAppState.ts:1868-1879`

### The Problem

**Direct mutation of React state object:**
```typescript
// Line 1868-1877
const existingCompletion = finalState.completions.find(c =>
  c.address === activeAddress.address &&
  (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
);

if (existingCompletion && !existingCompletion.timeSpentSeconds) {
  // Add our local time to the existing completion
  logger.info(`⏱️ SAVING LOCAL TIME: ...`);
  existingCompletion.timeSpentSeconds = timeSpentSeconds;  // ❌ MUTATION!
} else if (existingCompletion && existingCompletion.timeSpentSeconds) {
  logger.info(`⏱️ Time already tracked on other device: ...`);
}
```

### What Happens

- `existingCompletion` is a reference to an object in `finalState.completions` array
- Direct mutation: `existingCompletion.timeSpentSeconds = timeSpentSeconds`
- Breaks React's immutability principle
- May not trigger re-renders (React doesn't detect mutation)
- Can cause state corruption and stale UI

### Impact

- ⚠️ **HIGH:** Breaks React immutability
- ⚠️ May not trigger re-renders
- ⚠️ Can cause UI to show stale completion data
- ⚠️ Time tracking updates may not appear in UI

### Fix Required

Create new completion object instead of mutating:
```typescript
const existingCompletion = finalState.completions.find(c =>
  c.address === activeAddress.address &&
  (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
);

if (existingCompletion && !existingCompletion.timeSpentSeconds) {
  logger.info(`⏱️ SAVING LOCAL TIME: ...`);

  // ✅ Create new completion object (immutable update)
  const updatedCompletions = finalState.completions.map(c =>
    c === existingCompletion
      ? { ...c, timeSpentSeconds }
      : c
  );

  finalState = { ...finalState, completions: updatedCompletions };
} else if (existingCompletion && existingCompletion.timeSpentSeconds) {
  logger.info(`⏱️ Time already tracked on other device: ...`);
}
```

---

## **Bug #4: Protection Flag Set BEFORE State Validation** 🟡 MEDIUM

### Location
`src/useAppState.ts:849-898`

### The Problem

**Protection flag set BEFORE validation:**
```typescript
const setActive = React.useCallback((idx: number) => {
  // ❌ Set protection flag FIRST (before validation!)
  localStorage.setItem('navigator_active_protection', 'true');

  const now = new Date().toISOString();
  let shouldSubmit = false;

  setBaseState((s) => {
    const address = s.addresses[idx];

    // Validation check #1: Already active?
    if (s.activeIndex !== null && s.activeIndex !== idx) {
      logger.warn(`Cannot start address #${idx} - already active`);
      showWarning(`Please complete or cancel the current active address first`);
      localStorage.removeItem('navigator_active_protection');  // Clear flag
      return s;  // ❌ State not changed!
    }

    // Validation check #2: Already completed?
    if (address) {
      const isCompleted = s.completions.some(...);
      if (isCompleted) {
        logger.warn(`Cannot set active - already completed`);
        showWarning(`This address is already completed`);
        localStorage.removeItem('navigator_active_protection');  // Clear flag
        return s;  // ❌ State not changed!
      }
    }

    // ✅ SUCCESS: Keep protection flag, change state
    logger.info(`📍 STARTING CASE: ...`);
    shouldSubmit = true;
    return { ...s, activeIndex: idx, activeStartTime: now };
  });
```

### Race Condition Scenario

```
Thread 1: setActive(5) called
Thread 1: Sets protection flag to "true" (Line 851)
Thread 2: Cloud sync fires BEFORE setBaseState() callback runs
Thread 2: Checks isProtectionActive() → returns false (Bug #1!)
Thread 2: But even if Bug #1 was fixed, it would see protection active
Thread 2: Blocks cloud sync update
Thread 1: setBaseState() callback runs
Thread 1: Validation FAILS (address already completed on other device!)
Thread 1: Clears protection flag
Thread 1: Returns without changing state

Result: Protection flag was set but state didn't change - inconsistency!
```

### Impact

- 🟡 **MEDIUM:** Protection flag and state can be inconsistent
- 🟡 Short window where protection is active but should't be
- ✅ Low risk in practice (window is ~1-2ms)

### Fix Required

Set protection flag INSIDE setBaseState() after validation:
```typescript
const setActive = React.useCallback((idx: number) => {
  // ❌ Don't set flag here
  const now = new Date().toISOString();
  let shouldSubmit = false;

  setBaseState((s) => {
    const address = s.addresses[idx];

    // Validation checks...
    if (s.activeIndex !== null && s.activeIndex !== idx) {
      showWarning(`Please complete or cancel the current active address first`);
      return s;  // Don't need to clear flag (never set it)
    }

    if (isCompleted) {
      showWarning(`This address is already completed`);
      return s;  // Don't need to clear flag (never set it)
    }

    // ✅ Set protection flag AFTER validation passes
    setProtectionFlag('navigator_active_protection');
    logger.info(`📍 STARTING CASE: ...`);
    shouldSubmit = true;

    return { ...s, activeIndex: idx, activeStartTime: now };
  });
```

---

## **Bug #5: ACTIVE_INDEX_SET Not Validated in Reducer** 🟡 MEDIUM

### Location
`src/sync/reducer.ts:199-207`

### The Problem

**No validation before applying operation:**
```typescript
case 'ACTIVE_INDEX_SET': {
  const { index, startTime } = operation.payload;

  // ❌ No validation!
  return {
    ...state,
    activeIndex: index,
    activeStartTime: startTime ?? (index !== null ? new Date().toISOString() : null),
  };
}
```

### What Can Happen

```
Scenario 1: Out of bounds index
1. Device A has 10 addresses (indices 0-9)
2. Device B has 50 addresses (indices 0-49)
3. Device B sets active index to 25
4. ACTIVE_INDEX_SET operation syncs to Device A
5. Device A applies: activeIndex = 25
6. Device A has no address at index 25!
7. UI tries to access addresses[25] → undefined
8. UI crashes or shows "undefined" as address

Scenario 2: Already completed address
1. Device A completes address #5 at 10:00 AM
2. Device B (offline) starts address #5 at 10:05 AM
3. Device B comes online
4. ACTIVE_INDEX_SET syncs to Device A
5. Device A sets activeIndex = 5
6. UI shows address #5 as active even though it's completed!
```

### Impact

- 🟡 **MEDIUM:** Can set invalid activeIndex from cloud sync
- 🟡 UI can crash or show incorrect data
- 🟡 Only happens in multi-device edge cases

### Fix Required

Add validation before applying operation:
```typescript
case 'ACTIVE_INDEX_SET': {
  const { index, startTime } = operation.payload;

  // ✅ Validate before applying
  if (index !== null) {
    // Check bounds
    if (typeof index !== 'number' || index < 0 || index >= state.addresses.length) {
      logger.warn('❌ ACTIVE_INDEX_SET: Invalid index out of bounds', {
        index,
        maxIndex: state.addresses.length - 1,
        operationId: operation.id,
      });
      return state;  // Reject invalid operation
    }

    // Check if address is already completed
    const address = state.addresses[index];
    const isCompleted = state.completions.some(c =>
      c.address === address.address &&
      (c.listVersion || state.currentListVersion) === state.currentListVersion
    );

    if (isCompleted) {
      logger.warn('❌ ACTIVE_INDEX_SET: Address already completed', {
        index,
        address: address.address,
        operationId: operation.id,
      });
      return state;  // Reject invalid operation
    }
  }

  return {
    ...state,
    activeIndex: index,
    activeStartTime: startTime ?? (index !== null ? new Date().toISOString() : null),
  };
}
```

---

## 📊 Summary

| Bug | Severity | Impact | Fix Complexity |
|-----|----------|--------|----------------|
| #1: Protection flag wrong type | 🔴 CRITICAL | Time tracking data loss | Easy |
| #2: Time calculation race | 🟡 MEDIUM | Protection flag stuck | Medium |
| #3: setState() mutation | ⚠️ HIGH | UI state corruption | Easy |
| #4: Flag before validation | 🟡 MEDIUM | Inconsistent state | Easy |
| #5: No ACTIVE_INDEX_SET validation | 🟡 MEDIUM | Invalid activeIndex | Medium |

---

## 🔧 Fix Priority

1. **Bug #1** - CRITICAL - ROOT CAUSE of time tracking loss
2. **Bug #3** - HIGH - Breaks React immutability
3. **Bug #2** - MEDIUM - Protection flag can get stuck
4. **Bug #5** - MEDIUM - Multi-device edge case
5. **Bug #4** - LOW - Small inconsistency window

---

## ✅ Testing Plan

After fixes, test these scenarios:

1. **Long work session (2+ hours):**
   - Start address at 10:00 AM
   - Wait 2 hours (let cloud sync fire multiple times)
   - Complete at 12:00 PM
   - Verify timeSpentSeconds = 7200 ✅

2. **Multi-device completion:**
   - Device A: Start address #5 at 10:00 AM
   - Device B: Complete address #5 at 10:05 AM
   - Device A: Verify active state cleared
   - Device A: Verify local time saved to completion

3. **Protection flag lifecycle:**
   - Start address
   - Verify protection flag set (check localStorage, should be timestamp)
   - Complete address
   - Verify protection flag cleared

4. **Invalid activeIndex from cloud:**
   - Device A: 10 addresses
   - Device B: 50 addresses, set active #25
   - Device A: Receive ACTIVE_INDEX_SET for #25
   - Verify operation rejected, activeIndex stays null

---

## 📝 Files to Modify

1. `src/useAppState.ts` - Bugs #1, #2, #3, #4
2. `src/sync/reducer.ts` - Bug #5
3. `src/utils/protectionFlags.ts` - (No changes needed, already correct!)

---

## 🎯 Expected Outcome

After fixes:
- ✅ Time tracking works reliably on 2+ hour sessions
- ✅ Protection flag properly blocks cloud sync when address active
- ✅ Multi-device scenarios handled correctly
- ✅ No state corruption from mutations
- ✅ Invalid operations rejected by reducer
