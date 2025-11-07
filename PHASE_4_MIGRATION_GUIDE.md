# Phase 4: Gradual Migration Guide

**Status:** Implementation Guide for Phase 4 Work
**Date Created:** October 28, 2025
**Target Audience:** Developers integrating validators and constants

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Using Validators](#using-validators)
3. [Using Constants](#using-constants)
4. [Integration Patterns](#integration-patterns)
5. [Best Practices](#best-practices)
6. [Common Issues](#common-issues)
7. [Checklist](#checklist)

---

## Getting Started

### Import Validators

```typescript
// From centralized validation service
import {
  validateCompletion,
  validateAmount,
  validateAddressString,
  validateString,
  isValidTimestamp,
  isWithinRange,
} from '../services/validationService';

// From operation validators
import { validateSyncOperation } from '../services/operationValidators';

// From form validators
import {
  validateArrangementForm,
  validateArrangementAmount,
  validateCompletionOutcome,
  validateRequired,
  validateEmail,
} from '../services/formValidators';
```

### Import Constants

```typescript
// Time constants
import {
  MS_PER_SECOND,
  MS_PER_DAY,
  SYNC_WINDOW_MS,
  FORM_INPUT_DEBOUNCE_MS,
  STATE_PERSISTENCE_DEBOUNCE_MS,
} from '../constants/timeConstants';

// Business constants
import {
  MAX_ARRANGEMENT_AMOUNT,
  MIN_ADDRESS_LENGTH,
  MAX_ADDRESS_LENGTH,
  VALID_OUTCOMES,
  DEFAULT_INSTALLMENT_COUNT,
} from '../constants/businessConstants';

// Or import all at once
import {
  MS_PER_DAY,
  MAX_ARRANGEMENT_AMOUNT,
  FORM_INPUT_DEBOUNCE_MS,
  // ... etc
} from '../constants';
```

---

## Using Validators

### Basic Validation Pattern

**Before:**
```typescript
const validateAmountInput = (value: string): boolean => {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0 && num <= 1000000;
};

// Usage
if (!validateAmountInput(amount)) {
  setError('Invalid amount');
} else {
  setError('');
}
```

**After:**
```typescript
import { validateAmount } from '../services/validationService';

// Usage
const result = validateAmount(amount);
if (!result.success) {
  const errorMap = groupValidationErrorsByField(result);
  setErrors(errorMap); // Multiple errors with field info
} else {
  setErrors({}); // Clear errors
  processAmount(result.data); // Type-safe: result.data is number
}
```

### Form Validation Pattern

**Before:**
```typescript
const handleFormSubmit = (formData) => {
  const errors: Record<string, string> = {};

  if (!formData.amount) {
    errors.amount = 'Amount is required';
  } else if (isNaN(parseFloat(formData.amount))) {
    errors.amount = 'Must be a number';
  } else if (parseFloat(formData.amount) <= 0) {
    errors.amount = 'Must be greater than 0';
  }

  if (!formData.address || formData.address.length < 3) {
    errors.address = 'Address too short';
  }

  if (Object.keys(errors).length > 0) {
    setFormErrors(errors);
    return;
  }

  // Submit form
  submitForm(formData);
};
```

**After:**
```typescript
import { validateArrangementForm } from '../services/formValidators';
import { groupValidationErrorsByField } from '../types/validation';

const handleFormSubmit = (formData) => {
  // Single validator call for entire form
  const result = validateArrangementForm(formData, addressesCount, remainingAmount);

  if (!result.success) {
    const errorMap = groupValidationErrorsByField(result);
    setFormErrors(errorMap);
    return;
  }

  // Form is validated - submit
  submitForm(formData);
};
```

### Type-Safe Validation with Type Guards

**Before:**
```typescript
if (validateCompletion(data)) {
  // data is typed as Completion, but actually it's any
  // and TypeScript won't catch type errors
  processCompletion(data);
}
```

**After:**
```typescript
import { validateCompletion, isValidationSuccess } from '../services/validationService';

const result = validateCompletion(data);
if (isValidationSuccess(result)) {
  // result.data is guaranteed to be Completion type
  // TypeScript knows exactly what properties are available
  processCompletion(result.data);
} else {
  // result.errors is ValidationError[] with field, code, message
  const messages = getValidationErrorMessages(result);
  showErrors(messages);
}
```

### Operation Validation Pattern

**Before (in operationSync.ts):**
```typescript
// Scattered validation throughout the file
if (!operation.id || !operation.timestamp) {
  logger.error('Invalid operation');
  return;
}

if (operation.id.length === 0) {
  logger.error('Empty operation ID');
  return;
}

// ... more scattered checks
```

**After:**
```typescript
import { validateSyncOperation } from '../services/operationValidators';

const validation = validateSyncOperation(operation);
if (!validation.success) {
  logger.error('Operation validation failed', validation.errors);
  return;
}

// operation is now guaranteed valid
processOperation(operation);
```

---

## Using Constants

### Time Constant Pattern

**Before:**
```typescript
// What does 150 mean? Need to calculate: 150ms debounce
const DEBOUNCE_MS = 150;

// What does 10000 mean? Need to calculate: 10s = 10000ms
const SYNC_WINDOW = 10 * 1000;

// What does 86400000 mean? Need to calculate: 24h = 86400000ms
const ONE_DAY = 24 * 60 * 60 * 1000;

// What does 7776000000 mean? Need to calculate: 90 days
const CACHE_DURATION = 90 * 24 * 60 * 60 * 1000;
```

**After:**
```typescript
import {
  STATE_PERSISTENCE_DEBOUNCE_MS,    // 150 - clearly 150ms
  SYNC_WINDOW_MS,                   // 10 seconds - clear intent
  MS_PER_DAY,                        // 1 day - semantic meaning
  GEOCODING_CACHE_DURATION_MS,      // 90 days - clear purpose
} from '../constants';

const debounce = STATE_PERSISTENCE_DEBOUNCE_MS;
const syncWindow = SYNC_WINDOW_MS;
const oneDay = MS_PER_DAY;
const cacheExpiry = GEOCODING_CACHE_DURATION_MS;
```

### Business Logic Constant Pattern

**Before:**
```typescript
if (amount > 1000000) {
  setError('Amount too large');
}

if (addresses.length > 10000) {
  setError('Too many addresses');
}

if (installments > 52) {
  setError('Too many installments');
}

const validOutcomes = ['PIF', 'DA', 'Done', 'ARR'];
if (!validOutcomes.includes(outcome)) {
  setError('Invalid outcome');
}
```

**After:**
```typescript
import {
  MAX_ARRANGEMENT_AMOUNT,
  MAX_ADDRESSES_PER_LIST,
  MAX_INSTALLMENT_COUNT,
  VALID_OUTCOMES,
} from '../constants';

if (amount > MAX_ARRANGEMENT_AMOUNT) {
  setError('Amount too large');
}

if (addresses.length > MAX_ADDRESSES_PER_LIST) {
  setError('Too many addresses');
}

if (installments > MAX_INSTALLMENT_COUNT) {
  setError('Too many installments');
}

if (!VALID_OUTCOMES.includes(outcome)) {
  setError('Invalid outcome');
}
```

### Configuration Pattern

**Before (scattered throughout code):**
```typescript
// In useAppState.ts
const debounceMs = 150;

// In operationSync.ts
const timeoutMs = 10000;

// In dataCleanup.ts
const cleanupMs = 300000;

// In components/QuickPaymentModal.tsx
const modalTimeoutMs = 5000;
```

**After (centralized in constants):**
```typescript
// In constants/timeConstants.ts - single source of truth
export const STATE_PERSISTENCE_DEBOUNCE_MS = 150;
export const SYNC_WINDOW_MS = 10000;
export const COMPLETION_TRACKING_TTL_MS = 300000;
export const CONFIRMED_UPDATE_CLEANUP_DELAY_MS = 5000;

// Use everywhere
import {
  STATE_PERSISTENCE_DEBOUNCE_MS,
  SYNC_WINDOW_MS,
  COMPLETION_TRACKING_TTL_MS,
} from '../constants';
```

---

## Integration Patterns

### Pattern 1: Gradual Form Integration

**Step 1:** Add validator import to component
```typescript
import { validateArrangementAmount } from '../services/formValidators';
```

**Step 2:** Replace validation for one field
```typescript
// Old validation
const isValidAmount = (val: string) => {
  const num = parseFloat(val);
  return !isNaN(num) && num > 0 && num <= 1000000;
};

// New validation
const result = validateArrangementAmount(amount);
if (!result.success) {
  setFieldError('amount', result.errors[0].message);
}
```

**Step 3:** Expand to other fields one by one

### Pattern 2: Centralized Error Handling

```typescript
import { groupValidationErrorsByField, getValidationErrorMessages } from '../types/validation';

// Multiple validators on one form
const amountResult = validateArrangementAmount(formData.amount);
const addressResult = validateManualAddress(formData.address);
const outcomeResult = validateCompletionOutcome(formData.outcome);

// Collect all errors
const allErrors = [
  ...(amountResult.success ? [] : amountResult.errors),
  ...(addressResult.success ? [] : addressResult.errors),
  ...(outcomeResult.success ? [] : outcomeResult.errors),
];

// Display grouped by field
const errorsByField = groupValidationErrorsByField({ success: false, errors: allErrors });
setFormErrors(errorsByField);
```

### Pattern 3: Constants in Configuration Objects

```typescript
import {
  FORM_INPUT_DEBOUNCE_MS,
  SYNC_WINDOW_MS,
  STATE_PERSISTENCE_DEBOUNCE_MS,
} from '../constants';

const config = {
  debounce: {
    formInput: FORM_INPUT_DEBOUNCE_MS,      // 500ms
    search: SEARCH_DEBOUNCE_MS,              // 300ms
    stateSync: STATE_PERSISTENCE_DEBOUNCE_MS // 150ms
  },
  timeouts: {
    sync: SYNC_WINDOW_MS,                   // 10s
    backup: PERIODIC_BACKUP_INTERVAL_MS,    // 3h
  }
};
```

---

## Best Practices

### ✅ DO

1. **Import validators at top of file**
   ```typescript
   // Good
   import { validateAmount, validateAddress } from '../services/formValidators';
   ```

2. **Check ValidationResult.success before accessing data**
   ```typescript
   // Good
   if (result.success) {
     processData(result.data); // result.data is typed correctly
   }
   ```

3. **Use semantic constant names**
   ```typescript
   // Good
   const timeout = COMPLETION_TRACKING_TTL_MS;
   ```

4. **Handle multiple validation errors**
   ```typescript
   // Good
   const errors = groupValidationErrorsByField(result);
   Object.entries(errors).forEach(([field, messages]) => {
     setFieldError(field, messages[0]);
   });
   ```

5. **Document why you chose a specific constant**
   ```typescript
   // Clock skew protection: reject operations > 24 hours in future
   const maxFutureMs = MAX_FUTURE_TIMESTAMP_MS;
   ```

### ❌ DON'T

1. **Don't use validators and old validation together**
   ```typescript
   // Bad - confusing and redundant
   const result = validateAmount(amount);
   if (!result.success && amount.length < 1) {
     // ...
   }
   ```

2. **Don't ignore type-safety of ValidationResult**
   ```typescript
   // Bad - loses type information
   const result: any = validateAmount(amount);
   result.data.someField(); // TypeScript won't help if field doesn't exist
   ```

3. **Don't change constant values in code**
   ```typescript
   // Bad - defeats purpose of constants
   const timeout = MAX_FUTURE_TIMESTAMP_MS * 2;
   ```

4. **Don't mix constants and hardcoded numbers**
   ```typescript
   // Bad - inconsistent
   const timeout1 = SYNC_WINDOW_MS;
   const timeout2 = 5000; // What is this?
   ```

5. **Don't create duplicate validators**
   ```typescript
   // Bad - use existing validators instead
   const myValidator = (val) => validateAmount(val);
   ```

---

## Common Issues

### Issue 1: "result.data is of type unknown"

**Problem:**
```typescript
const result = validateAmount(amount);
if (result.success) {
  console.log(result.data.toString()); // TypeScript error: unknown
}
```

**Solution:**
```typescript
// result.data is typed to the generic parameter
const result = validateAmount(amount); // Returns ValidationResult<number>
if (result.success) {
  console.log(result.data.toFixed(2)); // OK: result.data is number
}
```

### Issue 2: "How do I validate multiple fields?"

**Pattern:**
```typescript
import { combineValidators } from '../types/validation';

const validator = combineValidators(
  (val) => validateRequired(val, 'amount'),
  (val) => validateAmount(val),
  (val) => validateString(val, 'amount', 1, 20),
);

const result = validator(formData.amount);
if (!result.success) {
  // Handle multiple errors
}
```

### Issue 3: "Constants are too many to import"

**Solution - Import from index:**
```typescript
// Instead of importing each separately
import { MAX_ARRANGEMENT_AMOUNT, MIN_ADDRESS_LENGTH } from '../constants/businessConstants';
import { SYNC_WINDOW_MS, FORM_INPUT_DEBOUNCE_MS } from '../constants/timeConstants';

// Use the unified export
import { MAX_ARRANGEMENT_AMOUNT, MIN_ADDRESS_LENGTH, SYNC_WINDOW_MS, FORM_INPUT_DEBOUNCE_MS } from '../constants';
```

### Issue 4: "Test failing after using validators"

**Typical Cause:** Test expecting old error message format

**Old Test:**
```typescript
expect(error).toBe('Invalid amount');
```

**New Test:**
```typescript
const result = validateAmount('invalid');
expect(result.success).toBe(false);
expect(result.errors[0].code).toBe(ValidationErrorCode.INVALID_FORMAT);
```

---

## Migration Checklist

Use this checklist when migrating a component:

### Pre-Migration
- [ ] Component has tests (unit or integration)
- [ ] Tests currently passing
- [ ] Component identified as migration target
- [ ] Validators/constants needed are identified
- [ ] Rollback plan ready (git branch created)

### During Migration
- [ ] Added validator/constant imports
- [ ] Replaced validation logic
- [ ] Updated error handling
- [ ] Updated tests
- [ ] No TypeScript errors
- [ ] Component tests still pass
- [ ] Manual testing done

### Post-Migration
- [ ] All 187 tests passing
- [ ] No regressions observed
- [ ] Commit message clear
- [ ] Documentation updated
- [ ] Team notified

---

## Integration Order Recommendation

1. **Easy (No Dependencies):**
   - Constants in src/useAppState.ts
   - Constants in src/services/dataCleanup.ts
   - Time constants in timing-related code

2. **Medium (Low Dependencies):**
   - Form validators in UnifiedArrangementForm.tsx
   - Form validators in other form components
   - Business constants in validation code

3. **Hard (Critical Path):**
   - operationSync.ts validator integration
   - Hook composition in useAppState
   - Sync timing adjustments

---

## Performance Considerations

### Validators Performance
- Validators are fast (< 1ms typically)
- No performance penalty from using validators
- Validation happens synchronously
- Safe to call in render if needed

### Constants Performance
- Constants are zero-cost abstractions
- JavaScript engine inlines them
- No runtime overhead
- Cleaner bytecode from semantic names

### Impact
- ✅ No negative performance impact
- ✅ Slightly better code generation
- ✅ Clearer code for browser to optimize

---

## Summary

Migrating to validators and constants is:
- **Safe:** Non-breaking, gradual
- **Easy:** Clear patterns, good docs
- **Beneficial:** Better code quality, fewer bugs
- **Flexible:** Migrate at your own pace

Start small with one component and expand gradually. The test coverage ensures safety at every step.

