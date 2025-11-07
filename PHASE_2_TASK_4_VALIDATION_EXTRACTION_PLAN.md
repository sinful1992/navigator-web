# Phase 2 Task 4: Extract Validation Logic - Detailed Plan

**Status:** Planning Phase
**Estimated Time:** 6 hours
**Scope:** Consolidate 50+ validation functions across codebase
**Target:** Create centralized validation service

---

## CURRENT VALIDATION LANDSCAPE

### Category 1: Type Guards (5 functions) ✅ PARTIALLY CONSOLIDATED
**Location:** `src/utils/validationUtils.ts`
**Functions:**
1. `validateCompletion(c: unknown): c is Completion`
2. `validateAddressRow(a: unknown): a is AddressRow`
3. `validateAppState(state: unknown): state is AppState`
4. `stampCompletionsWithVersion(completions, version)`
5. `generateOperationId(type, entity, data)`

**Status:** Already extracted, needs improvement

---

### Category 2: Operation Payload Validation (30+ cases)
**Location:** `src/sync/operationSync.ts:57-250`
**Function:** `validateOperationPayload(operation: any)`

**Current Scope:**
- Base field validation (id, timestamp, clientId, sequence, type)
- Timestamp validation (clock skew protection)
- Payload existence check
- Type-specific payload validation (switch statement with 30+ cases)

**Operation Types Validated:**
1. `COMPLETION_CREATE` - Requires: completion object, timestamp, index
2. `COMPLETION_UPDATE` - Requires: originalTimestamp, updates object
3. `COMPLETION_DELETE` - Requires: originalTimestamp
4. `ADDRESS_IMPORT` - Requires: addressRows array
5. `ADDRESS_ADD` - Requires: address object
6. `ARRANGEMENT_CREATE` - Requires: arrangement data
7. `ARRANGEMENT_UPDATE` - Requires: id, updates
8. `ARRANGEMENT_DELETE` - Requires: id
9. `SETTINGS_UPDATE` - Requires: settings object
10. `SESSION_CREATE` - Requires: session object
11. `SESSION_DELETE` - Requires: sessionId
12. And more...

**Issues:**
- 200+ LOC in one function
- `any` types for operation parameter
- Deeply nested switch statement
- Unclear error messages in some cases

---

### Category 3: Form Validation (Scattered)
**Location:** `src/components/UnifiedArrangementForm.tsx`
**Functions:**
1. `validateAmount(value: string)` - Check numeric format and range
2. `validateForm()` - Overall form validation

**Validation Rules:**
- Amount must be valid decimal
- Scheduled date must be valid
- Payment schedule must be selected
- Customer name optional but validated if provided

**Issues:**
- Validation rules mixed with UI logic
- No reusable validation library
- Error messages coupled to UI

---

### Category 4: Data Validation (Inline)
**Location:** Scattered across hooks and components
**Examples:**
- Address index bounds checking (in UnifiedArrangementForm.tsx:163)
- Address string matching (in AddressList.tsx)
- Completion timestamp validation (in useCompletionState.ts)
- Time calculation validation (in useTimeTracking.ts)

**Issues:**
- No single source of truth
- Inconsistent error handling
- Mixed with business logic

---

### Category 5: Reducer Validation (Minimal)
**Location:** `src/sync/reducer.ts`
**Current:** Very minimal - mostly trusts validOperationSync

**Issues:**
- Should validate state shape after reduction
- No validation of array bounds
- No validation of state consistency

---

## VALIDATION ARCHITECTURE ISSUES

### 1. Lack of Centralization
**Problem:** Validation logic spread across:
- `validationUtils.ts` (5 functions)
- `operationSync.ts` (1 mega-function with 30+ cases)
- `UnifiedArrangementForm.tsx` (2 functions)
- Various hooks and components (inline)

**Solution:** Create comprehensive validation service with:
- Type guard validators
- Operation validators
- Form validators
- Entity validators
- Utility validators

### 2. Poor Separation of Concerns
**Problem:**
- Form validation mixed with UI
- Operation validation mixed with sync logic
- Type guards mixed with data transformation

**Solution:**
- Separate validation from presentation
- Create pure validation functions
- Clear validation error types

### 3. Inconsistent Error Reporting
**Problem:**
- Some validators return boolean
- Some return `{ valid: boolean; error?: string }`
- Some throw errors
- Some set form errors

**Solution:**
- Unified ValidationError type
- Consistent error structure
- Composable validators

### 4. Limited Composability
**Problem:**
- Can't chain validators
- Can't reuse validation rules
- Hard to extend validation

**Solution:**
- Compose validators (factory pattern)
- Rule-based validation
- Easy to extend

---

## PROPOSED STRUCTURE

### New File: `src/services/validation.ts` (Main Service)

```typescript
// Core types
type ValidationError = {
  field: string;
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

// Validator type
type Validator<T> = (value: unknown) => ValidationResult<T>;

// Type guards
export const CompletionValidator: Validator<Completion>;
export const AddressRowValidator: Validator<AddressRow>;
export const AppStateValidator: Validator<AppState>;
export const ArrangementValidator: Validator<Arrangement>;
export const DaySessionValidator: Validator<DaySession>;

// Operation validators
export const OperationPayloadValidator: Validator<SubmitOperation>;
export const validateOperationSync(op: unknown): ValidationResult<SyncOperation>;

// Form validators
export const AmountValidator: Validator<string>;
export const DateValidator: Validator<string>;
export const AddressValidator: Validator<string>;

// Utility validators
export const timestampValidator(ts: string): boolean;
export const numericRangeValidator(value: number, min: number, max: number): boolean;
```

### New File: `src/types/validation.ts`

```typescript
// Validation error types
export type ValidationError = {
  field: string;
  code: 'REQUIRED' | 'INVALID_TYPE' | 'INVALID_FORMAT' | 'OUT_OF_RANGE' | 'INVALID_VALUE';
  message: string;
  metadata?: Record<string, unknown>;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };
```

### Enhance: `src/utils/validationUtils.ts`

Keep existing functions but improve them:
- Add proper type guards with ValidationResult return
- Update to use ValidationError type
- Add batch validation
- Add composition utilities

---

## EXTRACTION PLAN

### Phase 1: Core Validation Service (2 hours)
1. Create `src/types/validation.ts` with ValidationError types
2. Create `src/services/validation.ts` base service
3. Migrate type guard validators
4. Create unified error reporting

### Phase 2: Operation Validators (2 hours)
1. Extract `validateOperationPayload` from operationSync.ts
2. Break down into smaller validators per operation type
3. Use discriminated union types for operation validation
4. Create operation-specific validators

### Phase 3: Form & Entity Validators (1.5 hours)
1. Extract form validation from UnifiedArrangementForm
2. Create entity validators (Address, Arrangement, etc.)
3. Create field validators (Amount, Date, etc.)
4. Update forms to use validators

### Phase 4: Refactoring & Integration (0.5 hours)
1. Update operationSync.ts to use new validators
2. Update hooks to use validators
3. Update components to use validators
4. Run tests and validation

---

## SPECIFIC EXTRACTIONS

### 1. Type Guard Validators
**Consolidate from:**
- validateCompletion (useAppState.ts, validationUtils.ts - duplicate)
- validateAddressRow (useAppState.ts, validationUtils.ts - duplicate)
- validateAppState (useAppState.ts, validationUtils.ts - duplicate)

**Improvements:**
- Proper ValidationResult return type
- Better error messages
- Single source of truth

### 2. Operation Validators
**Extract from:** `src/sync/operationSync.ts:57-250` (200 LOC)

**Break into:**
- Base operation validation
- COMPLETION_CREATE validator
- COMPLETION_UPDATE validator
- COMPLETION_DELETE validator
- ADDRESS_IMPORT validator
- ADDRESS_ADD validator
- ARRANGEMENT validators (3)
- SETTINGS_UPDATE validator
- SESSION validators (2)

**Create:** Factory pattern for operation validators

### 3. Form Validators
**Extract from:** `src/components/UnifiedArrangementForm.tsx`

**New validators:**
- `validateAmount(value: string): ValidationResult<number>`
- `validateDate(value: string): ValidationResult<Date>`
- `validateSchedule(value: string): ValidationResult<RecurrenceType>`
- `validateArrangementForm(data: Partial<Arrangement>): ValidationResult<Arrangement>`

### 4. Entity Validators
**Create new validators:**
- `CompletionValidator`
- `ArrangementValidator`
- `DaySessionValidator`
- `AddressRowValidator`
- `AppStateValidator`

### 5. Utility Validators
**Create utility validators:**
- `isValidTimestamp(ts: string): boolean`
- `isValidISODate(date: string): boolean`
- `isValidNumericString(str: string): boolean`
- `isValidIndex(index: number, arrayLength: number): boolean`
- `isWithinRange(value: number, min: number, max: number): boolean`

---

## CONSOLIDATION OPPORTUNITIES

### 1. Remove Duplicates
- validateCompletion, validateAddressRow, validateAppState exist in both useAppState.ts and validationUtils.ts
- Should keep only in validationUtils.ts
- Update imports everywhere

### 2. Extract Scattered Validation
- Address index validation (3 places)
- Amount validation (4 places)
- Date validation (2 places)
- Index bounds checking (5+ places)

### 3. Reuse Operation Validation
- Currently in operationSync.ts only
- Should be used in reducer.ts as well
- Should be available to other services

---

## ERROR HANDLING IMPROVEMENTS

### Current Pattern:
```typescript
try {
  // validation
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
}
```

### Improved Pattern:
```typescript
const result = validateData(data);
if (!result.success) {
  result.errors.forEach(err => {
    logger.error(`Validation error: ${err.field}`, err.code, err.message);
  });
}
```

---

## TESTING STRATEGY

### Unit Tests (Priority: HIGH)
1. Each validator has dedicated tests
2. Test valid and invalid inputs
3. Test error message formatting
4. Test edge cases

### Integration Tests (Priority: MEDIUM)
1. Form validation integration
2. Operation validation integration
3. State validation integration

### Regression Tests (Priority: HIGH)
1. All existing validation still works
2. No behavior changes
3. Same error detection

---

## FILES TO CREATE

1. `src/types/validation.ts` (50 LOC)
   - ValidationError type
   - ValidationResult type
   - Error codes enum

2. `src/services/validation.ts` (300+ LOC)
   - Type guard validators
   - Operation validators
   - Form validators
   - Utility validators
   - Validator composition

3. `src/validators/` (optional directory)
   - operationValidators.ts (100+ LOC)
   - formValidators.ts (50+ LOC)
   - entityValidators.ts (80+ LOC)
   - utilityValidators.ts (50+ LOC)

---

## FILES TO MODIFY

1. `src/utils/validationUtils.ts`
   - Keep but add ValidationResult return types
   - Add batch validation
   - Re-export from new services

2. `src/sync/operationSync.ts`
   - Replace `validateOperationPayload` with import
   - Reduce from 200+ LOC to minimal

3. `src/components/UnifiedArrangementForm.tsx`
   - Replace form validation with imported validators
   - Use ValidationResult for error handling

4. `src/hooks/useAddressState.ts`, `useCompletionState.ts`
   - Update to use centralized validators

---

## TIME BREAKDOWN

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Create core validation types | 0.5h | Pending |
| 1 | Create base validation service | 1.5h | Pending |
| 2 | Extract operation validators | 1.5h | Pending |
| 2 | Break down operation validation | 0.5h | Pending |
| 3 | Extract form validators | 0.75h | Pending |
| 3 | Create entity validators | 0.75h | Pending |
| 4 | Refactor operationSync.ts | 0.25h | Pending |
| 4 | Update components and hooks | 0.25h | Pending |
| 4 | Testing and validation | 0.5h | Pending |
| **Total** | | **6h** | **0% Complete** |

---

## SUCCESS CRITERIA

- ✅ All validation logic centralized
- ✅ No validation duplication
- ✅ Consistent error reporting
- ✅ Zero TypeScript errors
- ✅ All tests passing
- ✅ No breaking changes
- ✅ Better code reusability

---

**Next Step:** Begin Phase 1 - Create core validation types and base service
