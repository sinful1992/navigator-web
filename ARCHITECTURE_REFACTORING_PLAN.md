# Architecture Refactoring Plan

## Executive Summary

This document outlines the comprehensive architectural refactoring needed to address inconsistencies, code duplication, and separation of concerns issues in the Navigator Web application.

**Status**: Critical bug fixed ✅ | Foundation services created ✅ | Full refactoring in progress ⏳

---

## Issues Identified

### 1. Critical Bugs (FIXED ✅)

- **Session edits not syncing**: `handleEditStart` and `handleEditEnd` were using `enqueueOp()` which doesn't submit operations to cloud
  - **Status**: ✅ FIXED in commit 1d55659
  - **Solution**: Created `SESSION_UPDATE` operation type and `updateSession()` function that properly syncs

### 2. Architectural Problems

#### A. No Separation of Concerns
- **Problem**: 2,400+ line `useAppState.ts` contains all business logic, state management, and sync operations
- **Impact**: Hard to maintain, test, and reason about
- **Solution**: Extract domain services (see below)

#### B. Inconsistent Sync Patterns
- **Problem**: Some operations use `submitOperation()`, some use `enqueueOp()`, some make direct Supabase calls
- **Impact**: Easy to introduce bugs where operations don't sync
- **Solution**: Centralized `SyncService` for all operations

#### C. Code Duplication
- **Problem**: Session editing logic duplicated in `handleEditStart` and `handleEditEnd`
- **Impact**: Changes need to be made in multiple places
- **Solution**: Domain services with shared validation and business logic

#### D. Monolithic Components
- **Problem**: `SettingsDropdown.tsx` is 1,732 lines with mixed concerns
- **Impact**: Hard to maintain and test
- **Solution**: Break into focused components

#### E. Manual Protection Flag Management
- **Problem**: Protection flags set/cleared in 12+ locations with manual timeout logic
- **Impact**: Easy to forget to clear flags or get timing wrong
- **Solution**: Use existing `executeWithProtection` wrapper consistently

---

## Target Architecture

```
src/
├── components/           # UI Layer - ONLY rendering & user interaction
│   ├── AddressList.tsx
│   ├── Completed.tsx
│   └── Settings/
│       ├── SettingsUI.tsx          # Main settings UI
│       ├── ImportManager.tsx       # Excel import
│       ├── BackupControls.tsx      # Backup operations
│       ├── SyncControls.tsx        # Manual sync
│       └── AccountSettings.tsx     # Account management
│
├── services/             # Business Logic Layer - Domain services
│   ├── SyncService.ts              # ✅ CREATED - Centralized sync operations
│   ├── SessionService.ts           # ✅ CREATED - Session management
│   ├── AddressService.ts           # TODO - Address operations
│   ├── CompletionService.ts        # TODO - Completion operations
│   ├── ArrangementService.ts       # TODO - Arrangement operations
│   ├── SettingsService.ts          # TODO - Settings operations
│   └── BackupService.ts            # TODO - Backup/restore operations
│
├── hooks/                # Application Layer - State orchestration
│   ├── useAppState.ts              # TODO REFACTOR - Delegate to services
│   ├── useAddresses.ts             # TODO - Address state hook
│   ├── useCompletions.ts           # TODO - Completion state hook
│   ├── useArrangements.ts          # TODO - Arrangement state hook
│   └── useSessions.ts              # TODO - Session state hook
│
├── sync/                 # Sync Layer - Operation-based sync
│   ├── operationSync.ts            # Current implementation
│   ├── operations.ts               # Operation types
│   ├── reducer.ts                  # State reconstruction
│   └── migrationAdapter.ts         # Unified sync interface
│
└── utils/                # Utilities
    ├── protectionFlags.ts          # ✅ EXISTS - Protection flag management
    └── logger.ts                   # ✅ EXISTS - Logging utility
```

---

## Refactoring Steps

### Phase 1: Foundation (✅ COMPLETED)

1. ✅ **Fix critical session edit bug**
   - Added `SESSION_UPDATE` operation type
   - Created `updateSession()` function in `useAppState.ts`
   - Refactored `handleEditStart` and `handleEditEnd`

2. ✅ **Create SyncService**
   - Centralized service for all sync operations
   - Consistent error handling with retry logic
   - Status tracking and event callbacks

3. ✅ **Create SessionService**
   - Extracted session business logic
   - Demonstrates service pattern for other domains

### Phase 2: Domain Services (TODO)

#### 2.1 Create AddressService
```typescript
// src/services/AddressService.ts
export class AddressService {
  async importAddresses(addresses: AddressRow[], preserveCompletions: boolean)
  async addAddress(address: AddressRow)
  async setActiveAddress(index: number)
  async cancelActiveAddress()
  validateAddress(address: Partial<AddressRow>)
}
```

#### 2.2 Create CompletionService
```typescript
// src/services/CompletionService.ts
export class CompletionService {
  async createCompletion(completion: Completion)
  async updateCompletion(timestamp: string, updates: Partial<Completion>)
  async deleteCompletion(timestamp: string)
  validateCompletion(completion: Partial<Completion>)
  calculateEnforcementFees(debtAmount: number, numberOfCases: number)
}
```

#### 2.3 Create ArrangementService
```typescript
// src/services/ArrangementService.ts
export class ArrangementService {
  async createArrangement(data: Omit<Arrangement, 'id' | 'createdAt'>)
  async updateArrangement(id: string, updates: Partial<Arrangement>)
  async deleteArrangement(id: string)
  determinePaymentOutcome(isRecurring: boolean, isLastPayment: boolean)
  validateArrangement(arrangement: Partial<Arrangement>)
}
```

#### 2.4 Create SettingsService
```typescript
// src/services/SettingsService.ts
export class SettingsService {
  async updateSubscription(subscription: UserSubscription | null)
  async updateReminderSettings(settings: ReminderSettings)
  async updateBonusSettings(settings: BonusSettings)
  validateSettings(settings: any)
}
```

#### 2.5 Create BackupService
```typescript
// src/services/BackupService.ts
export class BackupService {
  async createBackup(state: AppState)
  async restoreBackup(backup: string | AppState)
  async uploadToCloud(backup: AppState)
  async downloadFromCloud(objectPath: string)
  validateBackup(backup: any)
}
```

### Phase 3: Refactor useAppState (TODO)

**Current**: useAppState.ts contains all business logic (2,400+ lines)

**Target**: useAppState.ts orchestrates services

```typescript
// src/hooks/useAppState.ts
export function useAppState(userId, submitOperation) {
  // Initialize services
  const syncService = useMemo(() => new SyncService(), []);
  const sessionService = useMemo(() =>
    new SessionService({ submitOperation, deviceId }),
    [submitOperation, deviceId]
  );
  const addressService = useMemo(() =>
    new AddressService({ submitOperation, deviceId }),
    [submitOperation, deviceId]
  );
  // ... other services

  // State
  const [baseState, setBaseState] = useState<AppState>(initialState);

  // Delegate to services
  const startDay = useCallback(async () => {
    const session = await sessionService.startSession(baseState.daySessions);
    setBaseState(s => ({ ...s, daySessions: [...s.daySessions, session] }));
  }, [sessionService, baseState.daySessions]);

  // ... other delegated functions
}
```

**Benefits**:
- Business logic moved to services (testable)
- useAppState becomes thin orchestration layer
- Services can be used independently
- Easier to reason about and maintain

### Phase 4: Break Up Monolithic Components (TODO)

#### 4.1 Split SettingsDropdown (1,732 lines → ~300 lines each)

**Before**: One massive component
**After**: Focused components with clear responsibilities

```
src/components/Settings/
├── SettingsUI.tsx           # Main container, routing between panels
├── ImportManager.tsx         # Excel import functionality
├── BackupControls.tsx        # Backup/restore operations
├── SyncControls.tsx          # Manual sync and diagnostics
├── AccountSettings.tsx       # Email, password, delete account
└── PreferencesPanel.tsx      # App preferences and settings
```

### Phase 5: Testing & Validation (TODO)

1. **Unit Tests for Services**
   - Test each service in isolation
   - Mock submitOperation function
   - Verify business logic correctness

2. **Integration Tests**
   - Test service interactions
   - Verify sync operations submitted correctly
   - Test error handling and retry logic

3. **Manual Testing**
   - Test all user flows
   - Verify multi-device sync works
   - Check error handling and user feedback

---

## Implementation Guidelines

### Service Pattern

All services should follow this pattern:

```typescript
export interface ServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

export class XService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: ServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  // Public business logic methods
  async createX(...) { }
  async updateX(...) { }
  async deleteX(...) { }

  // Validation methods
  validateX(...) { }

  // Private helper methods
  private calculateX(...) { }
}
```

### Error Handling

All services should:
1. Use logger for errors
2. Throw descriptive errors
3. Let SyncService handle retry logic
4. Provide validation before operations

### Testing

Each service should have:
1. Unit tests with mocked dependencies
2. Validation tests
3. Error handling tests
4. Business logic tests

---

## Migration Strategy

### Incremental Approach

**Option A: By Domain (Recommended)**
1. Implement AddressService
2. Refactor useAppState to use AddressService
3. Test thoroughly
4. Repeat for other domains

**Option B: By Layer**
1. Create all services first
2. Refactor useAppState all at once
3. Higher risk but faster

### Rollback Plan

- All services are additive (don't delete old code initially)
- Keep old useAppState functions until migration complete
- Use feature flags if needed for gradual rollout

### Validation Checklist

For each service:
- [ ] Service created with proper interface
- [ ] Business logic extracted from useAppState
- [ ] Unit tests written
- [ ] useAppState refactored to use service
- [ ] Integration tests passing
- [ ] Manual testing complete
- [ ] Old code removed

---

## Benefits of Refactoring

### Maintainability
- ✅ Single Responsibility Principle - each service has ONE purpose
- ✅ Easy to find and modify business logic
- ✅ Changes isolated to one place

### Testability
- ✅ Services can be unit tested in isolation
- ✅ Easy to mock dependencies
- ✅ Clear interfaces for testing

### Consistency
- ✅ All sync operations go through SyncService
- ✅ Consistent error handling
- ✅ Uniform patterns across the app

### Scalability
- ✅ Easy to add new features to existing services
- ✅ Services can be reused in multiple places
- ✅ Clear boundaries between concerns

### Debugging
- ✅ Clear call stack: Component → Hook → Service → Sync
- ✅ Easier to trace issues
- ✅ Centralized logging

---

## Timeline Estimate

- **Phase 1** (Foundation): ✅ COMPLETE (2-3 hours)
- **Phase 2** (Domain Services): 1-2 days
- **Phase 3** (Refactor useAppState): 1-2 days
- **Phase 4** (Split Components): 1 day
- **Phase 5** (Testing): 1-2 days

**Total**: 4-7 days for complete refactoring

---

## Current Status

### Completed ✅
- [x] Fixed critical session edit sync bug
- [x] Created SyncService with error handling and retry logic
- [x] Created SessionService as example domain service
- [x] Documented complete refactoring plan

### In Progress ⏳
- [ ] Create remaining domain services (Address, Completion, Arrangement, Settings, Backup)
- [ ] Refactor useAppState to delegate to services
- [ ] Break up SettingsDropdown component
- [ ] Add comprehensive tests
- [ ] Complete migration

### Next Steps

1. **Immediate**: Create AddressService (most commonly used)
2. **Then**: Create CompletionService (core functionality)
3. **Then**: Create ArrangementService
4. **Then**: Refactor useAppState incrementally
5. **Finally**: Break up SettingsDropdown and add tests

---

## Questions & Decisions

### Should we use dependency injection?
**Decision**: Yes, pass submitOperation and deviceId to services
**Reason**: Makes services testable and framework-agnostic

### Should services manage state?
**Decision**: No, services are stateless and return results
**Reason**: State management stays in React hooks

### Should we keep enqueueOp?
**Decision**: Remove it eventually, replaced by services
**Reason**: It's a source of confusion and bugs

### How to handle backward compatibility?
**Decision**: Keep old functions until migration complete
**Reason**: Allows gradual migration with rollback option

---

## Resources

- **Best Practices**: `docs/` folder (research from dev.to, GeeksForGeeks, etc.)
- **Service Pattern**: `src/services/SessionService.ts` (example)
- **Sync Architecture**: `src/sync/` (operation-based sync)
- **Protection Flags**: `src/utils/protectionFlags.ts`

---

## Conclusion

This refactoring addresses fundamental architectural issues while maintaining backward compatibility. The phased approach allows for:

1. ✅ **Immediate bug fix** (already done)
2. ✅ **Foundation services** (SyncService, SessionService created)
3. ⏳ **Incremental migration** (domain by domain)
4. ⏳ **Continuous validation** (test each phase)
5. ⏳ **Complete refactoring** (proper architecture achieved)

The end result will be a maintainable, testable, and scalable codebase that follows modern React and TypeScript best practices.
