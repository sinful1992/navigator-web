/**
 * One-time recovery script to force full sync
 *
 * This script resets the sync cursor in IndexedDB, forcing the app
 * to do a full fetch of all operations from the cloud on next load.
 *
 * Run in browser console while on the Navigator app page:
 * 1. Open DevTools (F12)
 * 2. Go to Console tab
 * 3. Paste this entire script and press Enter
 * 4. Page will reload and fetch ALL operations from cloud
 */

(async function forceFullSync() {
  console.log('🔄 Starting force full sync...');

  // Open the IndexedDB database
  const dbName = 'keyval-store';

  const request = indexedDB.open(dbName);

  request.onerror = () => {
    console.error('❌ Failed to open IndexedDB');
  };

  request.onsuccess = async (event) => {
    const db = event.target.result;
    const storeName = 'keyval';

    if (!db.objectStoreNames.contains(storeName)) {
      console.error('❌ Store not found');
      return;
    }

    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    // Get all keys
    const getAllKeys = store.getAllKeys();

    getAllKeys.onsuccess = () => {
      const keys = getAllKeys.result;
      const opLogKeys = keys.filter(k => k.includes('operation_log'));

      console.log('📋 Found operation log keys:', opLogKeys);

      if (opLogKeys.length === 0) {
        console.log('⚠️ No operation logs found. App may not have synced yet.');
        return;
      }

      let resetCount = 0;

      opLogKeys.forEach(key => {
        const getRequest = store.get(key);

        getRequest.onsuccess = () => {
          const log = getRequest.result;

          if (log && typeof log === 'object') {
            console.log(`📊 Before reset - ${key}:`, {
              lastSyncTimestamp: log.lastSyncTimestamp,
              operationCount: log.operations?.length || 0
            });

            // Reset the sync cursor
            log.lastSyncTimestamp = null;

            // Save back
            const putRequest = store.put(log, key);

            putRequest.onsuccess = () => {
              resetCount++;
              console.log(`✅ Reset sync cursor for: ${key}`);

              if (resetCount === opLogKeys.length) {
                console.log('🎉 All sync cursors reset! Reloading page...');
                setTimeout(() => {
                  location.reload();
                }, 1000);
              }
            };

            putRequest.onerror = () => {
              console.error(`❌ Failed to save ${key}`);
            };
          }
        };
      });
    };

    getAllKeys.onerror = () => {
      console.error('❌ Failed to get keys');
    };
  };
})();
