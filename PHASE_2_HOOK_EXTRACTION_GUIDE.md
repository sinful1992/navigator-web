# Phase 2 Task 1: Hook Extraction Guide

**Status:** Step 1 Complete, Step 2 Ready to Execute
**Date:** October 28, 2025
**Completed:** usePersistedState hook (250 LOC)
**Ready to Start:** useCompletionState, useTimeTracking, remaining hooks

---

## COMPLETED: usePersistedState Hook ✅

**File:** `src/hooks/usePersistedState.ts`
**Size:** ~250 LOC
**Status:** ✅ CREATED & COMPILES

**Exports:**
- `usePersistedState(userId?)` - Main hook
- `UsePersistedStateReturn` - Return type interface
- Constants: STORAGE_KEY, CURRENT_SCHEMA_VERSION, INITIAL_STATE

**Responsibilities:**
1. Load state from IndexedDB with validation
2. Handle IndexedDB contamination (data from different user)
3. Apply schema migrations
4. Validate loaded data structure
5. Persist state changes with 150ms debounce
6. Add ownership verification to saved data

**Usage Pattern:**
```typescript
const { state, setState, loading, ownerMetadata } = usePersistedState(userId);
```

---

## NEXT: useCompletionState Hook

### Source Code Location
**File:** `src/useAppState.ts`
**Lines:** ~953-1150 (approx 200 LOC)

### Extraction Points
1. **State Variables** (before line 953)
   - `pendingCompletionsRef` - Track pending completions
   - `recentCompletionsRef` - Track recent completions for memory cleanup
   - `[, setPendingCompletions]` - useState for pending set
   - Cleanup interval effect (lines 933-951)

2. **Methods to Extract** (lines 953-1150)
   - `complete()` - Create completion with all validations
   - Helper methods inside: `showError()`, `showWarning()` callbacks needed from parent

3. **Related Code** (lines 1150-1300+)
   - `updateCompletion()` - Update existing completion
   - `deleteCompletion()` - Delete completion
   - Related useCallbacks and effects

### Implementation Strategy
```typescript
interface UseCompletionStateProps {
  baseState: AppState;
  submitOperation: SubmitOperationCallback;
  userId?: string;
}

interface UseCompletionStateReturn {
  complete: (index: number, outcome: Outcome, ...) => Promise<string>;
  updateCompletion: (originalTimestamp: string, updates: Partial<Completion>) => Promise<void>;
  deleteCompletion: (timestamp: string, index: number, listVersion: number) => Promise<void>;
  undoCompletion: (completionId: string) => void;
  pendingCompletions: Set<number>;
}

export function useCompletionState(props: UseCompletionStateProps): UseCompletionStateReturn {
  // Implementation
}
```

### Extraction Checklist
- [ ] Extract pending/recent completion refs
- [ ] Extract cleanup interval effect
- [ ] Copy complete() function with all validations
- [ ] Copy updateCompletion() function
- [ ] Copy deleteCompletion() function
- [ ] Copy undo logic
- [ ] Create type exports
- [ ] Test with sample operations

---

## NEXT: useTimeTracking Hook

### Source Code Location
**File:** `src/useAppState.ts`
**Lines:** ~850-922 (approx 70 LOC main, +150 LOC in compose/return)

### Extraction Points
1. **Main Time Tracking Methods** (lines 850-922)
   - `startActive()` - Start tracking time on address
   - `completeActive()` - Complete active address
   - `cancelActive()` - Cancel active tracking
   - References to protection flags
   - Uses time utilities from timeTrackingUtils

2. **Related State**
   - `activeIndex` from baseState
   - `activeStartTime` from baseState
   - `getActiveTimeSpent()` - Calculate elapsed time

### Implementation Strategy
```typescript
interface UseTimeTrackingProps {
  baseState: AppState;
  setState: (state: AppState) => void;
  submitOperation: SubmitOperationCallback;
}

interface UseTimeTrackingReturn {
  activeIndex: number | null;
  activeStartTime: string | null;
  elapsedSeconds: number | undefined;
  startActive: (index: number) => void;
  completeActive: () => Promise<void>;
  cancelActive: () => void;
}

export function useTimeTracking(props: UseTimeTrackingProps): UseTimeTrackingReturn {
  // Implementation
}
```

### Key Dependencies
- `setProtectionFlag()` - From protection flags module
- `clearProtectionFlag()` - From protection flags module
- `getActiveTimeSpent()` - Already extracted to timeTrackingUtils
- Uses `submitOperation` for cloud sync

---

## REMAINING HOOKS (Simpler Extractions)

### useAddressState
**Lines:** ~1600-1700 (approx 100 LOC)
**Methods:**
- `importAddresses()` - Bulk import with version management
- `addAddress()` - Add single address

**Return:**
```typescript
{
  importAddresses: (addresses, preserveCompletions) => Promise<void>,
  addAddress: (address) => Promise<void>
}
```

### useArrangementState
**Lines:** ~1800-1900 (approx 100 LOC)
**Methods:**
- `createArrangement()` - Create arrangement with validation
- `updateArrangement()` - Update arrangement details
- `deleteArrangement()` - Delete arrangement

**Return:**
```typescript
{
  createArrangement: (data) => Promise<void>,
  updateArrangement: (id, updates) => Promise<void>,
  deleteArrangement: (id) => Promise<void>
}
```

### useSettingsState
**Lines:** ~2000-2050 (approx 50 LOC)
**Methods:**
- `updateSubscription()` - Update subscription settings
- `updateReminderSettings()` - Update reminder config
- `updateBonusSettings()` - Update bonus config

**Return:**
```typescript
{
  updateSubscription: (subscription) => Promise<void>,
  updateReminderSettings: (settings) => Promise<void>,
  updateBonusSettings: (settings) => Promise<void>
}
```

---

## COMPOSITION PATTERN

Once all hooks are extracted, compose them in useAppState:

```typescript
export function useAppState(userId?: string, submitOperation?: SubmitOperationCallback) {
  // 1. Persistence layer
  const { state: baseState, setState, loading, ownerMetadata } = usePersistedState(userId);

  // 2. Completion management
  const completions = useCompletionState({
    baseState,
    submitOperation,
    userId
  });

  // 3. Time tracking
  const timeTracking = useTimeTracking({
    baseState,
    setState,
    submitOperation
  });

  // 4. Address management
  const addresses = useAddressState({
    baseState,
    setState,
    submitOperation
  });

  // 5. Arrangement management
  const arrangements = useArrangementState({
    baseState,
    setState,
    submitOperation
  });

  // 6. Settings management
  const settings = useSettingsState({
    baseState,
    setState,
    submitOperation
  });

  // 7. Sync integration (most complex, depends on all above)
  const sync = useSyncState({
    baseState,
    setState,
    completions,
    timeTracking,
    addresses,
    arrangements,
    settings,
    loading,
    userId
  });

  // Return composed API matching original useAppState
  return {
    state: baseState,
    loading,
    // ... all methods from hooks
    complete: completions.complete,
    updateCompletion: completions.updateCompletion,
    startActive: timeTracking.startActive,
    cancelActive: timeTracking.cancelActive,
    // ... etc for all methods
  };
}
```

---

## TESTING STRATEGY

### Per-Hook Testing
Each hook should have unit tests:

```typescript
describe('useCompletionState', () => {
  it('should create completion with time tracking', () => {
    // Mock baseState, submitOperation
    // Render hook
    // Call complete()
    // Assert completion created with timeSpentSeconds
  });

  it('should prevent duplicate submissions', () => {
    // Call complete() twice for same index
    // Assert second call throws error
  });
});
```

### Integration Testing
After composition:

```typescript
describe('useAppState (composed)', () => {
  it('should maintain state consistency across operations', () => {
    // Import addresses
    // Complete some addresses
    // Update completion
    // Assert state is correct
  });

  it('should handle complex workflows', () => {
    // Multi-step user journey
    // Assert no data loss
  });
});
```

### Regression Testing
```typescript
describe('useAppState (regression)', () => {
  it('should match original useAppState behavior', () => {
    // Run same operations on old vs new
    // Assert final states are identical
  });
});
```

---

## DETAILED LINE-BY-LINE EXTRACTION CHECKLIST

### For Each Hook:
- [ ] Identify all related state variables
- [ ] Identify all related useEffect hooks
- [ ] Identify all related useCallback methods
- [ ] Identify all dependencies (other methods, utilities)
- [ ] Create hook file in `src/hooks/useXxxxState.ts`
- [ ] Create proper TypeScript interfaces
- [ ] Copy and adapt code
- [ ] Update imports to use extracted utilities
- [ ] Remove any circular dependencies
- [ ] Test compilation (npx tsc --noEmit)
- [ ] Create unit tests
- [ ] Document hook API

---

## COMMON PITFALLS TO AVOID

1. **Circular Dependencies**
   - Solution: Define clear hook interfaces, pass state as props

2. **Missing Dependencies**
   - Solution: Check all useCallback dependencies
   - Solution: Import from utility modules

3. **State Coupling**
   - Solution: Each hook should own minimal state
   - Solution: Pass shared state as props

4. **Lost Error Handling**
   - Solution: Preserve all try/catch blocks
   - Solution: Keep all logger calls

5. **Memory Leaks**
   - Solution: Verify all cleanup functions in useEffect
   - Solution: Check setInterval/setTimeout cleanup

---

## EXTRACTION ORDER RECOMMENDATION

1. ✅ **Utilities** (DONE) - No dependencies
2. **usePersistedState** (DONE) - No hook dependencies
3. **useCompletionState** - Can be isolated
4. **useTimeTracking** - Can be isolated
5. **useAddressState** - Can be isolated
6. **useArrangementState** - Can be isolated
7. **useSettingsState** - Can be isolated
8. **useSyncState** - Depends on other hooks
9. **Compose useAppState** - Wires everything together

---

## APPROXIMATE TIME ESTIMATES

| Hook | Extraction | Testing | Integration | Total |
|------|-----------|---------|-------------|-------|
| usePersistedState | ✅ Done | 30m | 15m | 2h |
| useCompletionState | 1h | 30m | 15m | 2h |
| useTimeTracking | 1h | 30m | 15m | 2h |
| useAddressState | 45m | 20m | 15m | 1.5h |
| useArrangementState | 45m | 20m | 15m | 1.5h |
| useSettingsState | 30m | 15m | 10m | 1h |
| useSyncState | 1.5h | 45m | 30m | 2.75h |
| Composition & Tests | 1h | 1h | 30m | 2.5h |
| **TOTAL** | **7h** | **3h** | **2h** | **12h** |

---

## KEY FILES TO REFERENCE

- Original implementation: `src/useAppState.ts`
- Extracted utilities: `src/utils/validationUtils.ts`, etc.
- Type definitions: `src/types.ts`
- Constants: `src/useAppState.ts` (STORAGE_KEY, etc.)

---

## NEXT DEVELOPER NOTES

1. **Start with useCompletionState** - It's self-contained
2. **Test each hook independently** - Don't wait for all to be done
3. **Keep original useAppState.ts** - Use as reference, gradually replace
4. **Use this guide** - It has exact line numbers and extraction points
5. **Document as you go** - Add comments to clarify complex logic

---

**Document Created:** October 28, 2025
**For:** Phase 2 Task 1: useAppState Decomposition
**Status:** Ready for hook extraction to begin
