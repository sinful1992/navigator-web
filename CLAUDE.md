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