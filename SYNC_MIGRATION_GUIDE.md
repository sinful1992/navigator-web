# Operation-Based Sync Migration Guide

This guide explains how to migrate from the legacy state-based sync to the new operation-based sync system.

## Why the Migration?

The original sync system had a fundamental race condition:
- **Problem**: Full state replacement during sync could overwrite recent user actions
- **Symptom**: Completions would "bounce back" to undone when made during app startup
- **Root Cause**: Last-writer-wins with entire app state blobs

The new system solves this by:
- **Solution**: Syncing individual operations instead of full state
- **Benefits**: Conflict resolution, deterministic ordering, no race conditions
- **Architecture**: Event sourcing with operational transforms

## Implementation Steps

### 1. Database Setup

First, create the operations table in Supabase:

```sql
-- Run this in your Supabase SQL editor
-- File: src/sync/database-schema.sql

CREATE TABLE navigator_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  operation_type TEXT NOT NULL,
  operation_data JSONB NOT NULL,
  client_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  server_timestamp TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, operation_id),
  UNIQUE(user_id, sequence_number)
);

-- Add indexes and RLS policies (see full schema file)
```

### 2. Gradual Migration Strategy

The migration uses a unified adapter that supports both sync modes:

```typescript
// Option 1: Component-by-component migration
import { useAppStateV2 } from './useAppStateV2';

function MyComponent() {
  const appState = useAppStateV2();
  // Same API as before, but with operation support

  // Check migration status
  const { canMigrate, currentSyncMode } = appState.migrationStatus;

  return (
    <div>
      <p>Sync mode: {currentSyncMode}</p>
      {canMigrate && (
        <button onClick={appState.performMigration}>
          Migrate to Operations Sync
        </button>
      )}
    </div>
  );
}
```

### 3. Testing the New Sync

Use localStorage overrides to test different sync modes:

```javascript
// Force operations mode for testing
localStorage.setItem('navigator_sync_mode_override', 'operations');

// Force legacy mode
localStorage.setItem('navigator_sync_mode_override', 'legacy');

// Force hybrid mode (both systems active)
localStorage.setItem('navigator_sync_mode_override', 'hybrid');

// Clear override (use server configuration)
localStorage.removeItem('navigator_sync_mode_override');

// Then reload the page
window.location.reload();
```

### 4. Migration Rollout Plan

**Phase 1: Setup (Week 1)**
- Deploy operations table schema
- Deploy new code with feature flag disabled
- Test infrastructure with internal users

**Phase 2: Limited Rollout (Week 2)**
- Enable for 10% of users via rollout percentage
- Monitor for conflicts and performance issues
- Gather feedback from early adopters

**Phase 3: Full Rollout (Week 3-4)**
- Gradually increase rollout percentage to 100%
- Migrate remaining legacy users
- Remove legacy code after confirmation

**Phase 4: Cleanup (Week 5)**
- Remove `navigator_state` table (after backup)
- Remove legacy sync code
- Update documentation

## Testing Scenarios

### Race Condition Test
1. Open app in two browser tabs/devices
2. Make a completion in tab 1
3. Immediately make a different completion in tab 2
4. Verify both completions persist (no bouncing back)

### Conflict Resolution Test
1. Go offline in one tab
2. Make several completions
3. Go offline in another tab, make overlapping completions
4. Bring both tabs online
5. Verify conflicts are resolved deterministically

### Migration Test
1. Create data in legacy mode
2. Trigger migration to operations mode
3. Verify all data is preserved
4. Continue using app normally

## Debugging Tools

### Operation Log Inspector
```typescript
// Add to development console
import { getOperationLog } from './sync/operationLog';

const log = getOperationLog('your-device-id');
console.log('Operations:', log.getAllOperations());
console.log('Unsynced:', log.getUnsyncedOperations());
```

### State Reconstruction Verification
```typescript
// Verify state matches operations
import { reconstructState } from './sync/reducer';

const operations = log.getAllOperations();
const reconstructed = reconstructState(initialState, operations);
console.log('Reconstructed state:', reconstructed);
```

### Sync Status Dashboard
```typescript
function SyncDebugPanel() {
  const appState = useAppStateV2();

  return (
    <div style={{ position: 'fixed', bottom: 0, right: 0, background: 'white', padding: '1rem' }}>
      <h4>Sync Debug</h4>
      <p>Mode: {appState.currentSyncMode}</p>
      <p>Online: {appState.isOnline ? '✅' : '❌'}</p>
      <p>Syncing: {appState.isSyncing ? '⏳' : '✅'}</p>
      <p>Last Sync: {appState.lastSyncTime?.toLocaleTimeString()}</p>
      {appState.error && <p style={{ color: 'red' }}>Error: {appState.error}</p>}
    </div>
  );
}
```

## Common Issues & Solutions

### Issue: Operations table doesn't exist
**Solution**: Run the database schema migration first

### Issue: Duplicate operations
**Solution**: Check client ID generation and operation ID uniqueness

### Issue: State not updating after operations
**Solution**: Verify subscription is working and state reconstruction is correct

### Issue: Migration fails
**Solution**: Check console for errors, verify user permissions, ensure no ongoing sync

### Issue: Performance problems
**Solution**: Check operation log size, run cleanup functions, optimize queries

## Rollback Plan

If issues arise, you can rollback:

1. **Immediate**: Set rollout percentage to 0
2. **User-level**: Use localStorage override to force legacy mode
3. **Emergency**: Disable operations table via feature flag

## Monitoring

Key metrics to watch:
- Operation log size growth
- Sync success/failure rates
- Conflict resolution frequency
- User-reported race conditions
- Performance impact

## API Changes

The new hook maintains backward compatibility:

```typescript
// ✅ Same API works with both systems
const { complete, setActive, undo } = useAppStateV2();

// ✅ New migration utilities
const { canMigrate, performMigration, currentSyncMode } = useAppStateV2();

// ✅ Operations-specific features (when available)
const { submitOperation, forceSync } = useAppStateV2();
```

## Conclusion

This migration eliminates the race conditions that caused completions to bounce back while maintaining full backward compatibility. The gradual rollout approach ensures minimal risk and allows for quick rollbacks if needed.

The new architecture follows event sourcing principles used by major platforms like Google Docs, Figma, and Notion to handle concurrent edits reliably.