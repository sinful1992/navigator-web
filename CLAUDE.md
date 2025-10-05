# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Navigator Web is a React + TypeScript PWA for managing address lists and tracking completions. It's designed for field workers who need to visit addresses and record outcomes (PIF, Done, DA, ARR). The app features offline-first functionality with cloud sync via Supabase.

## Common Commands

```bash
# Development
npm run dev        # Start development server with HMR
npm run build      # TypeScript compilation + production build
npm run preview    # Preview production build locally
npm run deploy     # Deploy to GitHub Pages

# No test framework is currently configured
# No lint command defined (ESLint config exists but no npm script)
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