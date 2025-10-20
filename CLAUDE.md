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
- **Sync**: Real-time cloud sync with Supabase via `useCloudSync.ts`
- **Optimistic Updates**: Local-first with conflict resolution
- **Offline Support**: Full offline functionality with sync on reconnection

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
  - `UnifiedArrangementForm.tsx`: Create/edit arrangement form with case reference and payment schedule
  - `QuickPaymentModal.tsx`: Fast payment recording modal (5-second payment entry)
- `Auth.tsx`: Supabase authentication flow
- `DayPanel.tsx`: Time tracking and session management

### Supabase Integration
- **Authentication**: Email/password with persistent sessions
- **Real-time sync**: Uses `entity_store` table for conflict-free replication
- **Storage**: Automatic backups to Supabase Storage buckets
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