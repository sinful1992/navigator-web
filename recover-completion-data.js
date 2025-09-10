// Recovery script to rebuild completion data from Supabase operations table
// Run this in your browser console while logged into Navigator app

async function recoverCompletionData() {
    console.log("🔄 Starting completion data recovery...");
    
    if (!window.supabase) {
        console.error("❌ Supabase not available. Make sure you're on the Navigator app page.");
        return;
    }
    
    try {
        // Get user ID
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.error("❌ Not authenticated");
            return;
        }
        
        console.log("👤 User ID:", user.id);
        
        // Fetch all completion operations
        const { data: operations, error } = await supabase
            .from('navigator_operations')
            .select('*')
            .eq('user_id', user.id)
            .eq('entity', 'completion')
            .eq('type', 'create')
            .order('timestamp', { ascending: true });
            
        if (error) throw error;
        
        console.log(`📊 Found ${operations.length} completion operations`);
        
        // Convert operations to completion format
        const completions = operations.map(op => {
            const data = op.data;
            return {
                index: data.index,
                address: data.address || `Address ${data.index}`,
                lat: data.lat || null,
                lng: data.lng || null,
                outcome: data.outcome,
                amount: data.amount || undefined,
                timestamp: op.timestamp,
                listVersion: data.listVersion,
                arrangementId: data.arrangementId || undefined
            };
        });
        
        // Group by list version for analysis
        const byVersion = completions.reduce((acc, comp) => {
            const version = comp.listVersion || 1;
            if (!acc[version]) acc[version] = [];
            acc[version].push(comp);
            return acc;
        }, {});
        
        console.log("📈 Completions by list version:");
        Object.keys(byVersion).forEach(version => {
            const comps = byVersion[version];
            const pifCount = comps.filter(c => c.outcome === 'PIF').length;
            const doneCount = comps.filter(c => c.outcome === 'Done').length;
            const daCount = comps.filter(c => c.outcome === 'DA').length;
            const arrCount = comps.filter(c => c.outcome === 'ARR').length;
            
            console.log(`  Version ${version}: ${comps.length} total (PIF: ${pifCount}, Done: ${doneCount}, DA: ${daCount}, ARR: ${arrCount})`);
        });
        
        // Create recovery state
        const recoveryState = {
            addresses: [], // Will be empty - user needs to import addresses again
            completions: completions,
            activeIndex: null,
            daySessions: [], // Will be empty 
            arrangements: [], // Will be empty
            currentListVersion: Math.max(...Object.keys(byVersion).map(Number)),
            _schemaVersion: 5,
            _recoveredFrom: 'navigator_operations',
            _recoveryTimestamp: new Date().toISOString()
        };
        
        // Download recovery file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `navigator-completions-recovery-${timestamp}.json`;
        
        const blob = new Blob([JSON.stringify(recoveryState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`✅ Recovery file created: ${filename}`);
        console.log(`📊 Total completions recovered: ${completions.length}`);
        console.log("🚀 Next steps:");
        console.log("1. Use 'Restore (file)' in Navigator to import this recovery file");
        console.log("2. Import your Excel addresses again");
        console.log("3. Your completion history will be preserved!");
        
        return recoveryState;
        
    } catch (error) {
        console.error("❌ Recovery failed:", error);
    }
}

// Auto-run the recovery
recoverCompletionData();