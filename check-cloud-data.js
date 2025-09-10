// Run this in your browser's console while on the Navigator app
// This will check for recent cloud sync data

console.log("🔍 Checking for recent cloud sync data...");

// Check if there's cloud sync metadata
const cloudMeta = localStorage.getItem('navigator_cloud_meta');
if (cloudMeta) {
    console.log("☁️ Cloud sync metadata found:", JSON.parse(cloudMeta));
}

// Check device ID
const deviceId = localStorage.getItem('navigator_device_id');
console.log("📱 Device ID:", deviceId);

// Check for any backup-related data
Object.keys(localStorage).forEach(key => {
    if (key.includes('backup') || key.includes('sync') || key.includes('navigator')) {
        console.log(`🔑 Found key: ${key}`, localStorage.getItem(key)?.substring(0, 100) + '...');
    }
});

// If you have access to the app's state, check last sync time
console.log("ℹ️ To check cloud backups:");
console.log("1. Go to your Navigator app");
console.log("2. Click 'Show tools' if tools are hidden");
console.log("3. Click 'Restore from Cloud'");
console.log("4. Look for backups from before your file upload");

// Also check browser's Application tab > Storage > IndexedDB
console.log("ℹ️ Also check: Browser DevTools > Application > Storage > IndexedDB > keyval-store");