// src/App.tsx
import * as React from "react";
import "./App.css";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { Auth } from "./Auth";
import { ImportExcel } from "./ImportExcel";
import { Arrangements } from "./Arrangements";
import type { AppState, Outcome } from "./types";
import { BackupsPanel } from "./components/BackupsPanel";

// Version-safe outcome updates
import { updateOutcomeByIndexAndVersion } from "./state/updateOutcome";
// Creation path (listVersion + snapshot)
import { createCompletion, upsertCompletion } from "./state/createCompletion";
// Version-scoped stats
import { computeCurrentStats } from "./state/selectors";
// Backup helpers
import { localDateKey, makeDaySnapshot, performBackup } from "./backup/backup";
// App state and cloud sync
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";

export default function App() {
  const { state, setState } = useAppState();
  const cloudSync = useCloudSync();
  
  // Handle case where cloud sync might not be available
  const {
    user,
    isLoading: authLoading = false,
    isOnline = false,
    error: authError,
    clearError,
    signIn,
    signUp,
    signOut,
    // syncData,
    // subscribeToData,
  } = cloudSync || {};

  const [filterText, setFilterText] = React.useState("");
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [showBackups, setShowBackups] = React.useState(false);
  const [showArrangements, setShowArrangements] = React.useState(false);
  const [autoCreateArrangementForAddress, setAutoCreateArrangementForAddress] = React.useState<number | null>(null);

  // Cloud sync effects - completely remove to test if this is causing the issue
  /*
  React.useEffect(() => {
    if (!user || !isOnline || !subscribeToData) return;
    const unsubscribe = subscribeToData((cloudState) => {
      setState(cloudState);
    });
    return unsubscribe;
  }, [user, isOnline]); // Removed subscribeToData and setState from deps

  // Sync data periodically instead of on every state change
  React.useEffect(() => {
    if (!user || !isOnline || !syncData) return;
    
    const syncInterval = setInterval(() => {
      syncData(state);
    }, 10000); // Sync every 10 seconds
    
    // Also sync immediately
    syncData(state);
    
    return () => clearInterval(syncInterval);
  }, [user, isOnline]); // Only depend on auth state, not full state
  */

  // Wrapper functions to match Auth component expectations
  const handleSignIn = React.useCallback(async (email: string, password: string): Promise<void> => {
    if (signIn) {
      await signIn(email, password);
    }
  }, [signIn]);

  const handleSignUp = React.useCallback(async (email: string, password: string): Promise<void> => {
    if (signUp) {
      await signUp(email, password);
    }
  }, [signUp]);

  // Debug logging - expand the object
  console.log('Auth state details:', { 
    user: user ? `${user.email} (${user.id})` : null, 
    authLoading, 
    authError,
    isOnline,
    supabaseAvailable: !!cloudSync
  });

  // Show auth screen if not authenticated
  if (authLoading) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "2rem" }}>
        <div>Loading authentication...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Auth
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        isLoading={authLoading}
        error={authError}
        onClearError={clearError}
      />
    );
  }

  const setActive = React.useCallback(
    (index: number) => setState((s: AppState) => ({ ...s, activeIndex: index })),
    [setState]
  );
  const cancelActive = React.useCallback(
    () => setState((s: AppState) => ({ ...s, activeIndex: undefined })),
    [setState]
  );

  const ensureDayStarted = React.useCallback(() => {
    setState((s: AppState) => {
      if (s?.day?.startTime) return s;
      return { ...s, day: { ...(s.day ?? {}), startTime: new Date().toISOString() } };
    });
  }, [setState]);

  const onCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementForAddress(addressIndex);
    setShowArrangements(true);
  }, []);

  const onComplete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s: AppState) => {
        const comp = createCompletion(s, index, outcome, amount);
        return upsertCompletion(s, comp);
      });
    },
    [setState]
  );

  const handleChangeOutcome = React.useCallback(
    (index: number, o: Outcome, amount?: string, listVersion?: number) => {
      setState((s: AppState) => updateOutcomeByIndexAndVersion(s, index, o, amount, listVersion));
    },
    [setState]
  );

  // Import addresses
  const handleImportAddresses = React.useCallback((rows: any[]) => {
    setState((s: AppState) => ({
      ...s,
      addresses: rows,
      currentListVersion: (s.currentListVersion || 1) + 1,
      activeIndex: undefined,
    }));
  }, [setState]);

  // Arrangements
  const handleAddArrangement = React.useCallback((arrangement: any) => {
    setState((s: AppState) => {
      const now = new Date().toISOString();
      const newArrangement = {
        ...arrangement,
        id: `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, arrangements: [...s.arrangements, newArrangement] };
    });
  }, [setState]);

  const handleUpdateArrangement = React.useCallback((id: string, updates: any) => {
    setState((s: AppState) => ({
      ...s,
      arrangements: s.arrangements.map((arr) =>
        arr.id === id ? { ...arr, ...updates, updatedAt: new Date().toISOString() } : arr
      ),
    }));
  }, [setState]);

  const handleDeleteArrangement = React.useCallback((id: string) => {
    setState((s: AppState) => ({
      ...s,
      arrangements: s.arrangements.filter((arr) => arr.id !== id),
    }));
  }, [setState]);

  const handleAddAddress = React.useCallback(async (address: any): Promise<number> => {
    return new Promise((resolve) => {
      setState((s: AppState) => {
        const newAddresses = [...s.addresses, address];
        const newIndex = newAddresses.length - 1;
        setTimeout(() => resolve(newIndex), 0);
        return { ...s, addresses: newAddresses };
      });
    });
  }, [setState]);

  // Backups (Supabase)
  const handleBackupNow = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey);
      await performBackup(dayKey, snapshot);
      alert("Backup completed.");
      setState((s: AppState) => ({ ...s, lastBackupAt: new Date().toISOString() }));
    } catch (e) {
      console.error(e);
      alert("Backup failed. Please try again.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  const handleFinishDay = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const nowIso = new Date().toISOString();
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey, { endTime: nowIso });

      setState((s: AppState) => ({
        ...s,
        day: { ...(s.day ?? {}), endTime: nowIso },
      }));

      await performBackup(dayKey, snapshot);
      alert(`Day ${dayKey} finished and backed up.`);
      setState((s: AppState) => ({ ...s, lastBackupAt: nowIso }));
    } catch (e) {
      console.error(e);
      alert("Finish Day backup failed. Your data is still on this device.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  const stats = React.useMemo(() => computeCurrentStats(state), [state]);

  return (
    <div className="container">
      {/* Header with auth info */}
      <header className="app-header">
        <div className="left">
          <h1 className="app-title">📍 Address Navigator</h1>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            <strong>List v{state.currentListVersion}</strong>
            <span className="ml-6">Total: {stats.total}</span>
            <span className="ml-6">PIF: {stats.pifCount}</span>
            <span className="ml-6">DA: {stats.daCount}</span>
            <span className="ml-6">Done: {stats.doneCount}</span>
            <span className="ml-6">ARR: {stats.arrCount}</span>
            {state?.lastBackupAt && (
              <span className="ml-6">Last backup: {new Date(state.lastBackupAt).toLocaleString()}</span>
            )}
            {user && (
              <span className="ml-6">
                👤 {user.email} {isOnline ? "🟢" : "🔴"}
              </span>
            )}
          </div>

          <div className="btn-row" style={{ marginTop: "0.5rem" }}>
            <ImportExcel onImported={handleImportAddresses} />
            <button
              onClick={() => setShowArrangements(true)}
              className="btn btn-ghost"
              title="View payment arrangements"
            >
              📅 Arrangements ({state.arrangements?.length || 0})
            </button>
            <button
              onClick={() => setShowBackups(true)}
              className="btn btn-ghost"
              title="View/restore previous backups"
            >
              📦 Backups
            </button>
            <button
              onClick={handleBackupNow}
              disabled={isBackingUp}
              className="btn btn-primary"
              title="Backup current data to Supabase"
            >
              {isBackingUp ? "Backing up…" : "💾 Backup now"}
            </button>
            <button
              onClick={handleFinishDay}
              disabled={isBackingUp}
              className="btn btn-outline"
              title="Set end time and back up today's data"
            >
              {isBackingUp ? "Finishing…" : "✅ Finish Day"}
            </button>
            <button
              onClick={signOut}
              className="btn btn-ghost"
              title="Sign out"
            >
              🚪 Sign Out
            </button>
          </div>
        </div>

        <div className="right">
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search address or postcode…"
            className="input"
            style={{ minWidth: 260 }}
          />
        </div>
      </header>

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <section>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Active List</h2>
          <AddressList
            state={state}
            setActive={setActive}
            cancelActive={cancelActive}
            onComplete={onComplete}
            onCreateArrangement={onCreateArrangement}
            filterText={filterText}
            ensureDayStarted={ensureDayStarted}
          />
        </section>

        <section style={{ marginTop: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Completed</h2>
          <Completed
            addresses={state.addresses ?? []}
            completions={state.completions ?? []}
            currentListVersion={state.currentListVersion}
            onChangeOutcome={handleChangeOutcome}
          />
        </section>
      </div>

      {/* Modals */}
      <BackupsPanel open={showBackups} onClose={() => setShowBackups(false)} setState={setState} />
      
      {showArrangements && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white w-[min(1100px,95vw)] max-h-[90vh] rounded-xl shadow overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Payment Arrangements</h2>
              <button
                onClick={() => {
                  setShowArrangements(false);
                  setAutoCreateArrangementForAddress(null);
                }}
                className="btn btn-ghost"
              >
                ✖ Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <Arrangements
                state={state}
                onAddArrangement={handleAddArrangement}
                onUpdateArrangement={handleUpdateArrangement}
                onDeleteArrangement={handleDeleteArrangement}
                onAddAddress={handleAddAddress}
                onComplete={onComplete}
                autoCreateForAddress={autoCreateArrangementForAddress}
                onAutoCreateHandled={() => setAutoCreateArrangementForAddress(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
