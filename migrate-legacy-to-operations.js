// Migration Script: Convert Legacy State to Operations
// Run this in browser console while logged into the app

async function migrateLegacyToOperations() {
  console.log('🔄 Starting migration: Legacy State → Operations');

  // Check if cloudSync is available
  if (!window.cloudSync) {
    console.error('❌ cloudSync not available. Make sure you are logged in and the app is loaded.');
    return;
  }

  if (!window.cloudSync.user) {
    console.error('❌ Not authenticated. Please log in first.');
    return;
  }

  console.log('✅ Authenticated as:', window.cloudSync.user.email);

  // Read legacy state from IndexedDB
  const state = await new Promise((resolve, reject) => {
    const openRequest = indexedDB.open('keyval-store');
    openRequest.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['keyval'], 'readonly');
      const objectStore = transaction.objectStore('keyval');
      const getRequest = objectStore.get('navigator_state_v5');

      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
    openRequest.onerror = () => reject(openRequest.error);
  });

  if (!state) {
    console.error('❌ No legacy state found');
    return;
  }

  console.log('📦 Legacy state loaded:', {
    addresses: state.addresses?.length || 0,
    completions: state.completions?.length || 0,
    arrangements: state.arrangements?.length || 0,
    daySessions: state.daySessions?.length || 0
  });

  // Remove duplicates from arrangements
  const uniqueArrangements = [];
  const seenIds = new Set();
  for (const arr of (state.arrangements || [])) {
    if (!seenIds.has(arr.id)) {
      seenIds.add(arr.id);
      // Remove version field to prevent conflicts
      const { version, ...cleanArr } = arr;
      uniqueArrangements.push(cleanArr);
    }
  }

  if (uniqueArrangements.length < (state.arrangements?.length || 0)) {
    console.log(`🧹 Removed ${(state.arrangements?.length || 0) - uniqueArrangements.length} duplicate arrangements`);
  }

  let operationsSubmitted = 0;

  try {
    // 1. Submit ADDRESS_BULK_IMPORT
    if (state.addresses && state.addresses.length > 0) {
      console.log('📍 Submitting addresses...');
      await window.cloudSync.submitOperation({
        type: 'ADDRESS_BULK_IMPORT',
        payload: {
          addresses: state.addresses,
          newListVersion: state.currentListVersion || 1,
          preserveCompletions: true
        }
      });
      operationsSubmitted++;
      console.log(`✅ Submitted ${state.addresses.length} addresses`);
    }

    // 2. Submit COMPLETION_CREATE for each completion
    if (state.completions && state.completions.length > 0) {
      console.log('✅ Submitting completions...');
      for (const completion of state.completions) {
        await window.cloudSync.submitOperation({
          type: 'COMPLETION_CREATE',
          payload: { completion }
        });
        operationsSubmitted++;
      }
      console.log(`✅ Submitted ${state.completions.length} completions`);
    }

    // 3. Submit ARRANGEMENT_CREATE for each arrangement (without version)
    if (uniqueArrangements.length > 0) {
      console.log('📅 Submitting arrangements...');
      for (const arrangement of uniqueArrangements) {
        await window.cloudSync.submitOperation({
          type: 'ARRANGEMENT_CREATE',
          payload: { arrangement }
        });
        operationsSubmitted++;
      }
      console.log(`✅ Submitted ${uniqueArrangements.length} arrangements`);
    }

    // 4. Submit SESSION_START for each day session
    if (state.daySessions && state.daySessions.length > 0) {
      console.log('📊 Submitting day sessions...');
      for (const session of state.daySessions) {
        await window.cloudSync.submitOperation({
          type: 'SESSION_START',
          payload: { session }
        });
        operationsSubmitted++;
      }
      console.log(`✅ Submitted ${state.daySessions.length} sessions`);
    }

    // 5. Submit settings if they exist
    if (state.subscription) {
      console.log('⚙️ Submitting subscription settings...');
      await window.cloudSync.submitOperation({
        type: 'SETTINGS_UPDATE_SUBSCRIPTION',
        payload: { subscription: state.subscription }
      });
      operationsSubmitted++;
    }

    if (state.reminderSettings) {
      console.log('🔔 Submitting reminder settings...');
      await window.cloudSync.submitOperation({
        type: 'SETTINGS_UPDATE_REMINDER',
        payload: { settings: state.reminderSettings }
      });
      operationsSubmitted++;
    }

    if (state.bonusSettings) {
      console.log('💰 Submitting bonus settings...');
      await window.cloudSync.submitOperation({
        type: 'SETTINGS_UPDATE_BONUS',
        payload: { settings: state.bonusSettings }
      });
      operationsSubmitted++;
    }

    console.log(`\n✅ Migration complete! Submitted ${operationsSubmitted} operations`);

    // Wait a moment for operations to be saved
    console.log('⏳ Waiting for operations to save...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Clear legacy state and conflicts
    console.log('🧹 Clearing legacy state and conflicts...');
    await new Promise((resolve, reject) => {
      const openRequest = indexedDB.open('keyval-store');
      openRequest.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['keyval'], 'readwrite');
        const objectStore = transaction.objectStore('keyval');
        const getRequest = objectStore.get('navigator_state_v5');

        getRequest.onsuccess = () => {
          const currentState = getRequest.result;
          const clearedState = {
            ...currentState,
            conflicts: [], // Clear all conflicts
            _migrated: true,
            _migrationTimestamp: new Date().toISOString()
          };

          const putRequest = objectStore.put(clearedState, 'navigator_state_v5');
          putRequest.onsuccess = () => {
            console.log('✅ Cleared conflicts from legacy state');
            resolve();
          };
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
      openRequest.onerror = () => reject(openRequest.error);
    });

    console.log('\n✅ MIGRATION SUCCESSFUL!');
    console.log('📝 Summary:');
    console.log(`   - Operations submitted: ${operationsSubmitted}`);
    console.log(`   - Conflicts cleared: ✅`);
    console.log(`   - Duplicates removed: ${(state.arrangements?.length || 0) - uniqueArrangements.length}`);
    console.log('\n🔄 Please refresh the page to see changes.');
    console.log('💡 The conflict modal should no longer appear.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack:', error.stack);
    console.log('\n⚠️ No data was lost - legacy state is still intact');
  }
}

// Run the migration
migrateLegacyToOperations();
