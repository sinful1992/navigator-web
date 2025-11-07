# Conflict Resolution System - Complete Guide

## Overview

The Navigator Web application includes a comprehensive conflict resolution system that handles concurrent updates across multiple devices. This guide explains how the system works, its architecture, and how to use it.

## Table of Contents

1. [What is a Version Conflict?](#what-is-a-version-conflict)
2. [How Conflicts Are Detected](#how-conflicts-are-detected)
3. [Conflict Resolution Strategies](#conflict-resolution-strategies)
4. [Architecture](#architecture)
5. [User Experience](#user-experience)
6. [Automatic Cleanup](#automatic-cleanup)
7. [Metrics & Monitoring](#metrics--monitoring)
8. [Edge Cases Handled](#edge-cases-handled)
9. [Technical Implementation](#technical-implementation)

---

## What is a Version Conflict?

A **version conflict** occurs when:
1. Two devices edit the same entity (completion or arrangement) while offline
2. Both devices sync to the cloud
3. The second device's update has a version mismatch

**Example:**
```
Device A: Offline, updates completion outcome (PIF → DA)
Device B: Offline, updates same completion outcome (PIF → Done)
Device A: Syncs first → version becomes 2
Device B: Syncs → expects version 1, but finds version 2 → CONFLICT!
```

---

## How Conflicts Are Detected

### Phase 2: Optimistic Concurrency Control

Each entity (completion/arrangement) has a `version` field:
- **Starts at 1** when created
- **Increments by 1** on each update
- **Checked before** every update operation

### Detection Flow

1. **Device B** submits `COMPLETION_UPDATE` operation:
   ```typescript
   {
     type: 'COMPLETION_UPDATE',
     payload: {
       originalTimestamp: '2025-01-01T10:00:00Z',
       updates: { outcome: 'Done' },
       expectedVersion: 1  // What B expects
     }
   }
   ```

2. **Reducer** checks current version:
   ```typescript
   const currentVersion = completion.version; // 2 (Device A already updated)
   if (currentVersion !== expectedVersion) {
     // CONFLICT DETECTED!
   }
   ```

3. **Conflict object** created and added to state:
   ```typescript
   {
     id: 'conflict_xyz',
     timestamp: '2025-01-01T10:05:00Z',
     entityType: 'completion',
     entityId: '2025-01-01T10:00:00Z',
     expectedVersion: 1,
     currentVersion: 2,
     localData: { outcome: 'DA', amount: '500' },
     remoteData: { outcome: 'Done' },
     status: 'pending'
   }
   ```

---

## Conflict Resolution Strategies

Users can resolve conflicts in three ways:

### 1. Keep Local (Keep My Changes)

**Use when:** Your changes are more accurate/recent than the other device's changes.

**What happens:**
- Local version stays unchanged
- Conflict marked as `resolved` with strategy `keep-local`
- **No UPDATE operation submitted** (local version already correct)
- Other devices keep their version (no sync needed)

**Example:**
```
Local:  outcome='DA', amount='500'
Remote: outcome='Done', amount='0'
Choose: Keep Local → outcome='DA', amount='500' (no change)
```

### 2. Use Remote (Use Other Device's Changes)

**Use when:** The other device's changes are more accurate/recent.

**What happens:**
- Local version replaced with remote data
- **UPDATE operation submitted** with remote data
- Operation syncs to all devices
- Version incremented
- Conflict marked as `resolved` with strategy `use-remote`

**Example:**
```
Local:  outcome='DA', amount='500'
Remote: outcome='Done', amount='0'
Choose: Use Remote → outcome='Done', amount='0' (synced to all devices)
```

### 3. Manual Merge

**Use when:** You want specific fields from both versions (advanced users only).

**What happens:**
- User manually combines data from both versions
- **UPDATE operation submitted** with merged data
- Operation syncs to all devices
- Version incremented
- Conflict marked as `resolved` with strategy `manual`

**Example:**
```
Local:  outcome='DA', amount='500', caseRef='ABC123'
Remote: outcome='Done', amount='600', caseRef='ABC123'
Choose: Manual → outcome='Done', amount='600', caseRef='ABC123' (synced)
```

### 4. Dismiss

**Use when:** The conflict doesn't matter or you'll handle it later.

**What happens:**
- Conflict marked as `dismissed`
- **No UPDATE operation submitted**
- Local version stays unchanged
- Conflict removed from UI
- Tracked in metrics as dismissal (lowers resolution rate)

---

## Architecture

The conflict resolution system follows **Clean Architecture** principles:

### Domain Layer (Business Logic)

**`ConflictResolutionService.ts`** - Pure business logic
- `resolveKeepLocal()` - Business rule: local wins
- `resolveUseRemote()` - Business rule: remote wins, merge data
- `resolveManual()` - Business rule: user merges manually
- `dismissConflict()` - Business rule: no action taken
- `getConflictSummary()` - Extract key differences for display
- `canResolve()` - Validate conflict can be resolved

**`ConflictMetricsService.ts`** - Metrics business logic
- `trackConflictDetected()` - Record detection event
- `trackConflictResolved()` - Record resolution with strategy
- `trackConflictDismissed()` - Record dismissal
- `getMetricsSummary()` - Calculate health score and rates
- `resetMetrics()` - Clear metrics history

### Application Layer (Orchestration)

**`useConflictResolution.ts`** - React hook orchestration
- Coordinates between UI and domain services
- Applies resolutions to app state
- Submits UPDATE operations for sync
- Manages conflict lifecycle
- Tracks metrics automatically
- Auto-cleanup resolved conflicts (24 hours)
- Auto-dismiss stale conflicts (7 days)

### Infrastructure Layer (Data)

**`reducer.ts`** - Conflict detection
- Detects version mismatches in UPDATE operations
- Creates conflict objects
- Prevents duplicate conflicts for same entity
- Auto-dismisses conflicts when entity deleted

### UI Layer (Presentation)

**`ConflictResolutionModal.tsx`** - Conflict resolution UI
- Side-by-side comparison of local vs remote
- Radio button selection for resolution choice
- Visual indicators and warnings
- Entity context display

**`ConflictMetricsPanel.tsx`** - Metrics monitoring UI
- Health score visualization (0-100)
- Conflict rate, resolution rate, avg time
- Detailed breakdown by entity and strategy
- Reset metrics capability

---

## User Experience

### Flow 1: Conflict Appears

1. User syncs app on Device B
2. Modal appears: **"⚠️ Version Conflict Detected"**
3. Shows entity info: "Completion for 123 Main St"
4. Shows local changes: "Outcome: DA, Amount: £500"
5. Shows remote changes: "Outcome: Done"
6. User selects resolution strategy
7. Click **"Resolve Conflict"**

### Flow 2: View Metrics

1. Click floating diagnostic button: **🔍**
2. Diagnostic panel opens
3. Click **"📊 Conflict Metrics"**
4. Metrics panel shows:
   - Health Score: 92/100 ✅ Excellent
   - Conflict Rate: 0.5 conflicts/day
   - Resolution Rate: 95% resolved
   - Avg Resolution Time: 12s
   - Favorite Strategy: keep-local
5. View detailed breakdown
6. Reset metrics if needed

---

## Automatic Cleanup

The system automatically manages conflict lifecycle:

### Auto-Cleanup Resolved Conflicts (24 hours)

**When:** Every 1 hour
**What:** Removes conflicts resolved >24 hours ago
**Why:** Keep state clean, prevent memory bloat
**Location:** `useConflictResolution.ts:88-120`

```typescript
// Runs every 1 hour
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

if (resolvedTime > CLEANUP_AGE_MS) {
  // Remove from state.conflicts
}
```

### Auto-Dismiss Stale Conflicts (7 days)

**When:** Every 6 hours
**What:** Dismisses conflicts pending >7 days
**Why:** User forgot/ignored, prevent perpetual pending state
**Location:** `useConflictResolution.ts:122-172`

```typescript
// Runs every 6 hours
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (detectedTime > STALE_AGE_MS) {
  // Auto-dismiss + track in metrics
}
```

### Auto-Dismiss on Entity Deletion

**When:** Entity deleted via `COMPLETION_DELETE` or `ARRANGEMENT_DELETE`
**What:** Dismisses all pending conflicts for that entity
**Why:** Conflict is moot if entity no longer exists
**Location:** `reducer.ts:144-172` (completion), `reducer.ts:388-412` (arrangement)

```typescript
case 'COMPLETION_DELETE': {
  // Dismiss all pending conflicts for this completion
  const updatedConflicts = state.conflicts?.map(c =>
    c.entityId === timestamp && c.status === 'pending'
      ? { ...c, status: 'dismissed', resolvedAt: now }
      : c
  );
}
```

---

## Metrics & Monitoring

### Metrics Tracked

1. **Detection Metrics**
   - Total conflicts detected
   - Conflicts by entity type (completion/arrangement)
   - First/last conflict timestamps

2. **Resolution Metrics**
   - Total resolved
   - Resolutions by strategy (keep-local/use-remote/manual)
   - Total dismissed

3. **Performance Metrics**
   - Average resolution time (milliseconds)
   - Fastest resolution time
   - Slowest resolution time

4. **Health Metrics**
   - Conflicts per day (calculated from first to last conflict)
   - Resolution rate (% resolved vs dismissed)
   - Health score (0-100, higher is better)

### Health Score Calculation

Starts at **100** (perfect), penalties applied:

```typescript
// High conflict rate penalty (> 1/day is concerning)
if (conflictsPerDay > 1) {
  score -= Math.min(30, conflictsPerDay * 5);
}

// Low resolution rate penalty (< 80% is concerning)
if (resolutionRate < 80) {
  score -= (80 - resolutionRate) / 2;
}

// Slow resolution penalty (> 60 seconds is slow)
if (avgTimeSeconds > 60) {
  score -= Math.min(20, (avgTimeSeconds - 60) / 6);
}
```

**Score Ranges:**
- **80-100:** ✅ Excellent - No issues detected
- **60-79:** ⚠️ Fair - Minor sync issues
- **0-59:** 🚨 Poor - Frequent conflicts detected

### Metrics Persistence

- Stored in **IndexedDB** (local only, not synced)
- Key: `conflict_metrics_v1`
- Persists across app restarts
- Can be reset by user

---

## Edge Cases Handled

### 1. Duplicate Conflicts

**Problem:** Multiple UPDATE operations for same entity create multiple conflicts
**Solution:** Check for existing pending conflict before creating new one
**Location:** `reducer.ts:90-102` (completion), `reducer.ts:312-324` (arrangement)

```typescript
const existingConflict = state.conflicts?.find(
  c => c.entityType === 'completion' &&
       c.entityId === originalTimestamp &&
       c.status === 'pending'
);

if (existingConflict) {
  return state; // Skip creating duplicate
}
```

### 2. Entity Deleted While Conflict Pending

**Problem:** User deletes entity but conflict still shows
**Solution:** Auto-dismiss conflicts when entity deleted
**Location:** `reducer.ts:144-172` (completion), `reducer.ts:388-412` (arrangement)

### 3. Stale Conflicts

**Problem:** User ignores conflict for weeks, clutters UI
**Solution:** Auto-dismiss after 7 days
**Location:** `useConflictResolution.ts:122-172`

### 4. Resolved Conflicts Accumulating

**Problem:** Resolved conflicts stay in state forever, memory bloat
**Solution:** Auto-cleanup after 24 hours
**Location:** `useConflictResolution.ts:88-120`

### 5. Modal Closed Without Resolution

**Problem:** User closes modal by clicking outside
**Solution:** Conflict stays pending, modal will reappear on next render
**Behavior:** Modal shows `pendingConflicts[0]` (first pending conflict)

### 6. Multiple Pending Conflicts

**Problem:** User has 3 conflicts pending, modal only shows one
**Solution:** Modal shows first conflict, after resolution, next conflict appears
**Behavior:** Sequential resolution (one at a time)

---

## Technical Implementation

### Phase 2: Optimistic Concurrency Control

**File:** `reducer.ts`
**Lines:** 69-123 (completion), 276-344 (arrangement)

```typescript
// Check version before applying update
if (expectedVersion !== undefined && targetCompletion) {
  const currentVersion = targetCompletion.version || 1;

  if (currentVersion !== expectedVersion) {
    // Version mismatch → Create conflict
    const conflict: VersionConflict = {
      id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      entityType: 'completion',
      entityId: originalTimestamp,
      operationId: operation.id,
      expectedVersion,
      currentVersion,
      remoteData: updates,
      localData: targetCompletion,
      status: 'pending',
    };

    return {
      ...state,
      conflicts: [...(state.conflicts || []), conflict],
    };
  }
}

// No conflict → Apply update with incremented version
return {
  ...state,
  completions: state.completions.map(c =>
    c.timestamp === originalTimestamp
      ? { ...c, ...updates, version: (c.version || 1) + 1 }
      : c
  ),
};
```

### Phase 3: Conflict Resolution UI

**Files:**
- `ConflictResolutionService.ts` - Business logic
- `useConflictResolution.ts` - Application orchestration
- `ConflictResolutionModal.tsx` - UI component
- `ConflictMetricsService.ts` - Metrics business logic
- `ConflictMetricsPanel.tsx` - Metrics UI
- `App.tsx` - Integration

**Key Integration Points:**

1. **App.tsx:** Initializes hook and renders modal
   ```typescript
   const conflictResolution = useConflictResolution({
     conflicts: state.conflicts || [],
     completions: state.completions,
     arrangements: state.arrangements,
     onStateUpdate: setState,
     updateCompletion,
     updateArrangement,
   });

   {conflictResolution.pendingConflicts.length > 0 && (
     <ConflictResolutionModal
       conflict={conflictResolution.pendingConflicts[0]}
       onResolveKeepLocal={() => conflictResolution.resolveKeepLocal(...)}
       onResolveUseRemote={() => conflictResolution.resolveUseRemote(...)}
       onDismiss={() => conflictResolution.dismissConflict(...)}
       onClose={() => conflictResolution.dismissConflict(...)}
     />
   )}
   ```

2. **useConflictResolution:** Orchestrates resolution
   ```typescript
   const resolveUseRemote = useCallback((conflictId: string) => {
     // Get resolution from domain service
     const resolution = ConflictResolutionService.resolveUseRemote(conflict);

     // Submit UPDATE operation (syncs to devices)
     if (conflict.entityType === 'completion') {
       updateCompletion(index, resolution.resolvedData);
     } else {
       updateArrangement(conflict.entityId, resolution.resolvedData);
     }

     // Mark conflict as resolved
     onStateUpdate((state) => ({
       ...state,
       conflicts: state.conflicts?.map(c =>
         c.id === conflictId
           ? { ...c, status: 'resolved', resolution: 'use-remote' }
           : c
       ),
     }));

     // Track in metrics
     ConflictMetricsService.trackConflictResolved(conflict, 'use-remote');
   }, [conflicts, updateCompletion, updateArrangement, onStateUpdate]);
   ```

---

## FAQ

### Q: Do conflicts sync across devices?

**A:** No. Conflicts are **local-only** and ephemeral. Only the **resolution** (UPDATE operation) syncs to other devices.

**Example:**
- Device A detects conflict → Shows modal
- Device B doesn't know about conflict
- Device A resolves with "Use Remote"
- UPDATE operation syncs to Device B
- Device B applies update (no conflict shown)

### Q: What if I choose the wrong resolution?

**A:** You can manually undo it:
1. Go to Completed tab
2. Find the completion
3. Click to modify outcome/amount
4. Change to correct values
5. Syncs to all devices

### Q: Can I see conflict history?

**A:** Yes, in metrics panel:
1. Click 🔍 diagnostic button
2. Click "📊 Conflict Metrics"
3. View total detected, resolutions by strategy, etc.

### Q: What if both devices resolve differently?

**A:** Last write wins:
1. Device A resolves with "Keep Local" (no operation)
2. Device B resolves with "Use Remote" (submits UPDATE)
3. Device B's UPDATE syncs to Device A
4. Device A applies update (Device B's resolution wins)

### Q: Do metrics sync across devices?

**A:** No. Metrics are **local-only** for monitoring your own conflict patterns.

---

## Troubleshooting

### Problem: Conflict modal won't close

**Cause:** Clicking outside dismisses it (conflict stays pending)
**Solution:** Select a resolution strategy and click "Resolve Conflict"

### Problem: Same conflict keeps appearing

**Cause:** Conflict is not being resolved, keeps showing on app reload
**Solution:** Resolve or dismiss the conflict properly

### Problem: Health score is low

**Possible Causes:**
1. High conflict rate (> 1 per day)
2. Low resolution rate (< 80%)
3. Slow resolutions (> 60 seconds)

**Solutions:**
1. Ensure all devices sync frequently (avoid long offline periods)
2. Resolve conflicts promptly instead of dismissing
3. Choose resolution quickly when modal appears

### Problem: No conflicts showing but data is wrong

**Cause:** Conflict was auto-dismissed or entity was deleted
**Solution:** Manually fix the data in Completed tab

---

## Best Practices

1. **Sync frequently** - Avoid working offline for extended periods
2. **Resolve promptly** - Don't let conflicts sit for days
3. **Choose carefully** - Understand which version is correct
4. **Monitor health** - Check metrics panel weekly
5. **Reset metrics** - Clear old metrics if you want fresh stats

---

## References

- **Implementation:** Phase 1-3 (Retry Queue, Optimistic Concurrency, Conflict Resolution)
- **Clean Architecture:** Domain → Application → UI layers
- **Commits:** `41ac5b1`, `65c788c`, `629091d`
- **Files:** 11 files total across services, hooks, components, sync

---

*Last Updated: January 2025*
*Version: 3.0*
*Navigator Web - Enterprise Sync Patterns*
