# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Navigator Web is a React + TypeScript PWA for managing address lists and tracking completions. It's designed for field workers who need to visit addresses and record outcomes (PIF, Done, DA, ARR). The app features offline-first functionality with cloud sync via Supabase.

## Common Commands

**IMPORTANT: DO NOT run `npm run build` or any build commands! Never run builds.**

```bash
# Development
npm run dev        # Start development server with HMR

# Testing
npm test           # Run tests (OK to run)

# Deployment is handled via GitHub Actions - DO NOT run build or deploy commands
```

## Architecture

### Core State Management
- **State**: Centralized in `useAppState.ts` using React state + IndexedDB persistence
- **Sync**: **Operation-based delta sync** via `useUnifiedSync` (migrated from state-based sync)
  - 99.7% reduction in sync payload size (103KB → 0.3KB per operation)
  - Immediate sync with no debounce delays
  - Reliable multi-device synchronization
  - Operations stored in `navigator_operations` Supabase table
- **Optimistic Updates**: Local-first with instant UI feedback
- **Offline Support**: Full offline functionality with sync on reconnection
- **Conflict Resolution**: Automatic via operation log timestamps and sequence numbers

### Key Data Types (`src/types.ts`)
- `AddressRow`: Address entries with optional lat/lng coordinates
- `Completion`: Records of visited addresses with outcomes and timestamps
- `Arrangement`: Scheduled future visits with customer details
- `DaySession`: Time tracking for work sessions

### Component Structure
- `App.tsx`: Main app with authentication, tabs, and state orchestration
- `AddressList.tsx`: Displays addresses with filtering and completion actions
- `Completed.tsx`: Shows completion history with outcome modification
- `Arrangements.tsx`: Manages scheduled visits and customer interactions
  - `UnifiedArrangementForm.tsx`: Create/edit arrangement form with case reference, number of cases, and payment schedule
  - `QuickPaymentModal.tsx`: Fast payment recording modal (5-second payment entry)
  - **Edit functionality removed** - arrangements are now read-only after creation
- `PifDetailsModal.tsx`: Shared modal for recording PIF completions
  - Auto-calculates enforcement fees for single cases (£75 + £235 + 7.5% over £1500)
  - Used by both AddressList and Completed components
  - Supports case reference and amount entry
- `RoutePlanning.tsx`: Route optimization with home address support
  - Set/change/clear home address via autocomplete
  - Routes optimized to end near home when configured
  - Visual indicators showing route will end at home (🏠)
- `EarningsCalendar.tsx`: Earnings tracking with expandable PIF details
  - Daily breakdown with expandable rows showing case references
  - Enforcement fee calculations for complex bonus settings
- `Auth.tsx`: Supabase authentication flow
- `DayPanel.tsx`: Time tracking and session management
- `Settings.tsx`: User preferences including home address management

### Supabase Integration
- **Authentication**: Email/password with persistent sessions
- **Real-time sync**: Uses `navigator_operations` table for operation-based delta sync
  - Each state mutation submitted as an operation (COMPLETION_CREATE, ADDRESS_BULK_IMPORT, etc.)
  - Operations replicated across devices via Supabase real-time subscriptions
  - Local operation log in IndexedDB for offline support
- **Storage**: Local backups only (cloud backup removed as redundant with delta sync)
- **Environment**: Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Build & Deploy
- **Vite**: Modern build tool with React plugin
- **GitHub Pages**: Automated deployment via GitHub Actions
- **PWA**: Service worker and manifest in `/public` directory
- **Base Path**: Configured for `/navigator-web/` subdirectory deployment

## Development Notes

- Uses TypeScript strict mode with proper type definitions
- IndexedDB via `idb-keyval` for offline persistence
- Excel import functionality via `xlsx` library
- Maps integration through `src/maps.ts`
- **Hybrid Geocoding**: Google Maps for geocoding (with caching) + OpenRouteService for route optimization
- Responsive design with mobile-first approach
- Error boundaries for graceful failure handling

## Critical Implementation Notes

### ⚠️ Route Planning Completion Matching (IMPORTANT)

**Background**: When users optimize routes and export to main list during an active day, completions must remain visible even though indices change and list versions bump.

**Implementation** (`AddressList.tsx:143-165`):
```typescript
// TWO-STRATEGY MATCHING - DO NOT SIMPLIFY
const hasCompletion = completions.some(c =>
  // Strategy 1: Index + ListVersion (normal workflow)
  (c.index === index && (c.listVersion || state.currentListVersion) === state.currentListVersion)
  ||
  // Strategy 2: Address string (route planning workflow)
  (c.address === addr.address)
);
```

**Why both strategies?**
- Strategy 1: Strict matching for normal imports (prevents stale completions)
- Strategy 2: Lenient matching for route optimization (preserves completions across reordering)

**DO NOT**:
- Remove address-based matching (Strategy 2) - breaks route planning
- Remove index-based matching (Strategy 1) - allows stale completions on new lists
- "Simplify" to only one strategy - both are needed for different workflows

**Documentation**: See `ROUTE_PLANNING_COMPLETION_FIX.md` for full details

### ⚠️ Arrangements Payment Recording (IMPORTANT)

**Background**: Arrangements support payment plans with multiple installments. Outcome tracking must correctly differentiate between installment payments and final payments.

**Critical Logic** (`Arrangements.tsx:267-291`):
```typescript
// Determine outcome: ARR for installment payments, PIF for final payment
const outcome: Outcome = (isRecurring && !isLastPayment) ? "ARR" : "PIF";
```

**Payment Outcome Rules**:
- **Installment payments** (e.g., payment 1 of 4) → Record as **"ARR"** (Arrangement)
- **Final payment** (e.g., payment 4 of 4) → Record as **"PIF"** (Paid In Full)
- **Single payments** (non-recurring) → Record as **"PIF"**

**DO NOT**:
- Always use "PIF" for arrangement payments - breaks installment tracking
- Remove the outcome determination logic - required for accurate statistics
- Mark installments as "PIF" - creates incorrect completion counts

**Features**:
- **Quick Payment Modal**: Fast payment recording via `QuickPaymentModal.tsx`
- **Payment Schedule Dropdown**: Single dropdown with options: Single/Weekly/Bi-weekly/Monthly
- **Case Reference Tracking**: All arrangements capture case reference numbers
- **Smart Outcome Detection**: Automatically determines correct outcome based on payment position

**Documentation**: See `ARRANGEMENTS_IMPROVEMENTS_SUMMARY.md` for complete details

### ⚠️ Address Time Tracking Protection (CRITICAL)

**Background**: Users press "Start" on individual addresses to track time spent on cases. Time tracking data was being lost during long work sessions (2+ hours) due to cloud sync interference and insufficient protection.

**Critical Logic** (`useAppState.ts:941-948, 1610-1635`):
```typescript
// Time calculation requires BOTH activeIndex and activeStartTime
let timeSpentSeconds: number | undefined;
if (currentState.activeIndex === index && currentState.activeStartTime) {
  const startTime = new Date(currentState.activeStartTime).getTime();
  const endTime = new Date(nowISO).getTime();
  timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
}
```

**Protection System** (`protectionFlags.ts:14`):
```typescript
'navigator_active_protection': Infinity  // Never expires - only cleared on complete/cancel
```

**Key Implementation Details**:
- **Infinite Protection**: Active protection flag never expires (was 5 seconds, caused data loss)
- **Cloud Sync Blocking**: All cloud updates blocked while address is active
- **Multi-Device Handling**: Local time saved to completion even if address completed on another device
- **State Preservation**: Both `activeIndex` and `activeStartTime` must remain intact for time calculation

**DO NOT**:
- Change protection timeout from `Infinity` - will cause time loss after timeout expires
- Allow cloud sync to clear `activeIndex` or `activeStartTime` while address is active
- Clear active state without saving time when address completed elsewhere
- Import/optimize routes while address is active (protection blocks this)

**Time Tracking Flow**:
1. User presses "Start" → `activeIndex` and `activeStartTime` set, protection flag enabled
2. Timer displays elapsed time (UI-only, not persisted)
3. Cloud sync completely blocked by protection flag
4. User completes → Time calculated from `activeStartTime`, saved to `Completion.timeSpentSeconds`
5. Protection flag cleared, cloud sync resumes

**Data Loss Scenarios Fixed**:
- ✅ Long work sessions (any duration) - protection never expires
- ✅ Address completed on another device - local time saved to their completion
- ✅ Cloud sync interference - blocked by infinite protection
- ❌ User clicks "Cancel" - intentional data loss (user action)

**Documentation**: See `ADDRESS_TIME_TRACKING_FIX.md` for complete technical details

### ⚠️ Backup Restore Race Condition Protection (CRITICAL)

**Background**: When users restore from backup (cloud or file), data would temporarily disappear for a few seconds before reappearing after a page refresh. This was caused by a race condition between the restore protection window and cloud sync operations.

**Root Cause**:
- Restore protection expired at 30 seconds
- Cloud sync `syncData()` was scheduled for 31 seconds
- Between 30-31s, remote operations could override the restored local data
- On page refresh, IndexedDB (with correct restored data) would reload properly

**Critical Logic** (`protectionFlags.ts:12`, `App.tsx:374, 794`):
```typescript
// Protection window extended to 60 seconds to cover entire sync operation
const FLAG_CONFIGS: Record<ProtectionFlag, number> = {
  'navigator_restore_in_progress': 60000, // 60 seconds
  // ...
};

// Wait 61 seconds (after 60s protection window expires) before syncing
setTimeout(async () => {
  await cloudSync.syncData(data);
  lastFromCloudRef.current = JSON.stringify(data);
}, 61000);
```

**Key Implementation Details**:
- **Extended Protection**: Restore protection window increased from 30s to 60s
- **Delayed Sync**: Cloud sync delayed from 31s to 61s (after protection expires)
- **Complete Coverage**: Protection now fully covers restore + sync operation
- **No Race Window**: Zero-second gap prevents remote operations from interfering

**DO NOT**:
- Reduce protection timeout below sync delay - will recreate race condition
- Sync before protection expires - defeats the protection mechanism
- Remove the setTimeout delay - causes immediate conflicts with remote data

**Restore Flow**:
1. User initiates restore (cloud or file backup)
2. `restoreState()` updates local state and IndexedDB
3. Protection flag set with 60s timeout
4. Cloud sync subscription blocked by protection flag
5. After 61s, protection expires and `syncData()` syncs restored state
6. No data loss, no temporary disappearance

**Fixed Scenarios**:
- ✅ Cloud backup restore - data persists immediately
- ✅ File backup restore - data persists immediately
- ✅ Multi-device sync during restore - remote operations blocked
- ✅ No refresh required - data stays visible throughout process

### 📊 Earnings PIF Case Reference Details (FEATURE)

**Background**: Users need to see which specific case references contributed to their daily PIF counts and earnings in the Earnings tab.

**Implementation** (`EarningsCalendar.tsx:24-36, 316-498`):
```typescript
// Expandable row state tracking
const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

// Click handler for expanding rows
const toggleExpanded = (date: string) => {
  setExpandedDates(prev => {
    const newSet = new Set(prev);
    if (newSet.has(date)) {
      newSet.delete(date);
    } else {
      newSet.add(date);
    }
    return newSet;
  });
};
```

**Features**:
- **Expandable Rows**: Click on PIF count to expand/collapse details
- **Visual Indicators**: Arrow icons (▶/▼) show expand state
- **Interactive UI**: PIF count highlighted in primary color when clickable
- **Detailed Information Display**:
  - Total amount collected (sum of all PIF amounts)
  - Number of PIF cases
  - Enforcement fees (only if multiple PIFs and complex bonus enabled)
  - Grid of case references with individual amounts
- **Responsive Design**: Grid layout adapts to screen size
- **Smart Filtering**: Only dates with PIFs (> 0) are expandable

**Component Structure**:
- `EarningsCalendar`: Main component with expandable table
- `PifDetailsRow`: Nested component showing case reference details
- Integrates with bonus calculator for enforcement fee calculations

**User Experience**:
1. View daily breakdown table in Earnings tab
2. Click on any PIF count (when > 0) to expand row
3. See summary: total collected, case count, enforcement fees
4. Browse case references in responsive grid
5. Each reference shows case ID and amount collected
6. Click again to collapse row

**DO NOT**:
- Make all rows expandable - only rows with PIFs should be interactive
- Remove enforcement fee calculation - valuable for complex bonus users
- Hardcode grid columns - must remain responsive

### ⚡ Delta Sync Architecture (CRITICAL)

**Background**: Migrated from state-based sync to operation-based delta sync for improved performance and reliability.

**Key Changes** (Commit: `9a20f56`):
- **Breaking Change**: Switched from full state replication to operation-based sync
- **Payload Reduction**: 99.7% smaller sync payloads (103KB → 0.3KB per operation)
- **No Debounce**: Immediate sync instead of 500ms debounce delays
- **Multi-Device**: Fixed sync reliability across devices

**Architecture** (`src/sync/`):
```typescript
// Operation types submitted to sync
type OperationType =
  | 'ADDRESS_BULK_IMPORT'
  | 'COMPLETION_CREATE'
  | 'COMPLETION_UPDATE'
  | 'ARRANGEMENT_CREATE'
  | 'ARRANGEMENT_UPDATE'
  | 'SESSION_START'
  | 'SESSION_END'
  | 'SETTINGS_UPDATE_SUBSCRIPTION'
  | 'SETTINGS_UPDATE_REMINDER'
  | 'SETTINGS_UPDATE_BONUS';

// Every state mutation submits an operation
await submitOperation({
  type: 'COMPLETION_CREATE',
  payload: { completion }
});
```

**Key Files**:
- `src/sync/operationSync.ts`: Core delta sync implementation
- `src/sync/migrationAdapter.ts`: Unified sync interface (operations mode only)
- `src/sync/operationLog.ts`: Local operation log management
- `src/sync/reducer.ts`: State reconstruction from operations
- `src/sync/operations.ts`: Operation type definitions

**Database**:
- Table: `navigator_operations`
- Columns: `id`, `user_id`, `device_id`, `sequence`, `type`, `payload`, `timestamp`, `entity`
- Real-time subscription for cross-device sync
- IndexedDB for local operation log

**Critical Fixes** (Commit: `cb2cbde`):
- **Bug**: Failed operations were marked as synced, causing permanent data loss
- **Fix**: Only mark continuous sequences as synced (no gaps)
- **Impact**: Critical reliability improvement for multi-device sync

**DO NOT**:
- Revert to state-based sync - causes multi-device failures
- Add debounce to operation submission - defeats immediate sync benefits
- Skip submitOperation calls - breaks cross-device synchronization
- Modify operation sequence logic - carefully designed to prevent data loss

**Root Cause Fixed**:
The original state-based sync used a 500ms debounce timer that was reset on every state change. During active work sessions, the timer never reached 500ms, so data never synced to cloud. Delta sync eliminates this by submitting each operation immediately.

### 🏠 Home Address Route Optimization (FEATURE)

**Background**: Users wanted routes optimized to end near their home address for convenience.

**Implementation** (`RoutePlanning.tsx`, Commit: `aef88c7`):
```typescript
// Settings stored in localStorage
interface Settings {
  homeAddress?: string;
  homeAddressLat?: number;
  homeAddressLng?: number;
}

// Route optimization with end location
const optimizedRoute = await optimizeRoute({
  addresses,
  startLocation: { lat, lng },
  endLocation: homeAddress ? { lat: homeAddressLat, lng: homeAddressLng } : undefined
});
```

**Features**:
- **Set Home Address**: Autocomplete address input in Settings or Route Planning tab
- **Change Home**: Update home address anytime
- **Clear Home**: Remove home address to revert to one-way routes
- **Visual Indicators**: 🏠 icon shows when route will end at home
- **VROOM Integration**: Backend Edge Function accepts `endLocation` parameter
- **Optional**: Routes work with or without home address configured

**User Flow**:
1. Navigate to Settings tab
2. Enter home address via autocomplete
3. Save home address
4. Return to Route Planning
5. Optimize route - automatically ends near home
6. Visual confirmation shows "Route will end near: [home address]"

**Backend** (`supabase/functions/optimize-route/index.ts`):
- VROOM vehicle configured with optional `end` parameter
- When `endLocation` provided: start → stops → home
- When `endLocation` omitted: one-way route (current behavior)

**DO NOT**:
- Make home address required - must remain optional
- Remove visual indicators - users need confirmation
- Change autocomplete behavior - matches main address autocomplete

### 💰 PIF Details Modal & Enforcement Fees (FEATURE)

**Background**: Unified PIF recording across AddressList and Completed with automatic enforcement fee calculation.

**Implementation** (`PifDetailsModal.tsx`, Commit: `88b4ca6`):
```typescript
// Auto-calculation for single case PIFs
const complianceFee = 75;
const baseFee = 235;
const amountOverThreshold = Math.max(0, debtAmount - 1500);
const percentageFee = amountOverThreshold * 0.075; // 7.5%
const enforcementFee = complianceFee + baseFee + percentageFee;
```

**Features**:
- **Shared Component**: Used by both `AddressList.tsx` and `Completed.tsx`
- **Auto-Calculation**: Enforcement fees calculated automatically for single cases
- **TCG Regulations 2014**: £75 compliance + £235 base + 7.5% over £1500
- **Case Reference**: Required field for all PIF completions
- **Amount Entry**: User enters debt amount, enforcement fee calculated
- **Multiple Cases**: User can specify if multiple cases involved

**Arrangement Integration**:
- `UnifiedArrangementForm.tsx` now includes:
  - `caseReference`: Case reference number
  - `numberOfCases`: Number of cases in arrangement
- Button order updated: Add Payment → Send SMS → Defaulted → Delete
- **Edit removed**: Arrangements are read-only after creation (prevents data inconsistencies)

**DO NOT**:
- Remove auto-calculation - saves time and prevents errors
- Change TCG fee structure without user confirmation - regulatory requirement
- Re-add arrangement edit functionality - removed to prevent sync issues

### 🔄 Completion Update Sync Fix (CRITICAL)

**Background**: Changing completion outcomes (PIF → DA, updating amounts) wasn't syncing across devices.

**Root Cause** (Commit: `9e12710`):
`handleChangeOutcome` in `App.tsx` directly mutated state via `setState()` instead of submitting operations to delta sync.

**Fix**:
```typescript
// OLD (broken):
setState(prev => ({
  ...prev,
  completions: prev.completions.map((c, i) =>
    i === index ? { ...c, outcome: newOutcome } : c
  )
}));

// NEW (working):
updateCompletion(index, {
  outcome: newOutcome,
  amount: newAmount,
  arrangementId: arrId
});
// Internally submits COMPLETION_UPDATE operation
```

**Impact**:
- ✅ Outcome changes now sync across devices
- ✅ Amount updates sync properly
- ✅ Arrangement linking syncs correctly
- ✅ Multi-device consistency maintained

**DO NOT**:
- Directly mutate completions array - always use `updateCompletion()`
- Bypass operation submission - breaks cross-device sync
- Remove updateCompletion function - required for delta sync

## Environment Setup

Create `.env.local` for development:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The app gracefully handles missing environment variables with console warnings.
- this project is published on git pages , not localy
- remove these as i dont want them:\
- 📏 Distance units (Miles/Kilometers)\
💤 Keep screen awake toggle\
🔋 Battery saver mode
  - 📶 WiFi-only sync
  - 🔤 Font size adjustment
  - 🔒 Auto-lock timeout\
- ♿ High contrast mode
  - 🎬 Reduce motion toggle\
- 🌍 Language selection
  - 📅 Date/time formats