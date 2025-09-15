// src/App.tsx - Modern Design with Right Sidebar
import * as React from "react";
import "./App.css"; // Use the updated modern CSS
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";
import { ModalProvider } from "./components/ModalProvider";
import { Auth } from "./Auth";
import Completed from "./Completed";
import { Arrangements } from "./Arrangements";
import type { AddressRow, Outcome } from "./types";
import { SubscriptionManager } from "./SubscriptionManager";
import { AdminDashboard } from "./AdminDashboard";
import { useSubscription } from "./useSubscription";
import { useAdmin } from "./useAdmin";
import { EarningsCalendar } from "./EarningsCalendar";
import { RoutePlanning } from "./RoutePlanning";

type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";

// Modern Stats Card Component
function StatsCard({ title, value, change, changeType, icon, iconType }: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: string;
  iconType: 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <div className="stat-card-modern">
      <div className="stat-header">
        <div className="stat-title">{title}</div>
        <div className={`stat-icon ${iconType}`}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {change && (
        <div className={`stat-change ${changeType || 'neutral'}`}>
          {changeType === 'positive' && <span>↑</span>}
          {changeType === 'negative' && <span>↓</span>}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}

// Modern Day Panel Component
function ModernDayPanel({ sessions, completions, startDay, endDay }: any) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s: any) => s.date === todayStr);
  const active = todaySessions.find((s: any) => !s.end) || null;
  const isActive = !!active;

  const todays = completions.filter((c: any) => (c.timestamp || "").slice(0, 10) === todayStr);
  const stats = {
    pif: todays.filter((c: any) => c.outcome === "PIF").length,
    done: todays.filter((c: any) => c.outcome === "Done").length,
    da: todays.filter((c: any) => c.outcome === "DA").length,
    arr: todays.filter((c: any) => c.outcome === "ARR").length,
    total: todays.length,
    pifAmount: todays
      .filter((c: any) => c.outcome === "PIF")
      .reduce((sum: number, c: any) => sum + parseFloat(c.amount || "0"), 0)
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-GB", { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="day-panel-modern">
      <div className="day-panel-header">
        <div className="day-status-section">
          {isActive && <div className="day-indicator" />}
          <div className="day-time-info">
            <div className="day-status-label">
              {isActive ? "Day Active" : active ? "Day Ended" : "Day Not Started"}
            </div>
            <div className="day-time">
              {active?.start ? formatTime(active.start) : "—"}
              {isActive ? " - Running" : active?.end ? ` - ${formatTime(active.end)}` : ""}
            </div>
          </div>
        </div>
        <div className="day-actions">
          {!isActive ? (
            <button className="day-action-btn" onClick={startDay}>
              ▶️ Start Day
            </button>
          ) : (
            <button className="day-action-btn" onClick={endDay}>
              ⏹️ End Day
            </button>
          )}
        </div>
      </div>
      
      <div className="day-stats-grid">
        <div className="day-stat">
          <div className="day-stat-value">{stats.total}</div>
          <div className="day-stat-label">Completed</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">£{stats.pifAmount.toFixed(0)}</div>
          <div className="day-stat-label">PIF Total</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.pif}</div>
          <div className="day-stat-label">PIF</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.done}</div>
          <div className="day-stat-label">Done</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.arr}</div>
          <div className="day-stat-label">ARR</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.da}</div>
          <div className="day-stat-label">DA</div>
        </div>
      </div>
    </div>
  );
}

// Modern Address Card Component
function ModernAddressCard({
  address,
  displayIndex,
  isActive,
  onSetActive,
  onNavigate,
  onComplete,
  status 
}: any) {
  return (
    <div className={`address-card-modern ${isActive ? 'active' : ''}`}>
      <div className="address-header-modern">
        <div className="address-content">
          <div className="address-number">{displayIndex + 1}</div>
          <div className="address-info">
            <div className="address-title">{address.address}</div>
            <div className="address-meta">
              {address.customerName && (
                <div className="address-meta-item">
                  <span>👤</span>
                  <span>{address.customerName}</span>
                </div>
              )}
              {address.amount && (
                <div className="address-meta-item">
                  <span>💰</span>
                  <span>£{address.amount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`address-status-badge status-${status || 'pending'}`}>
          {isActive && <span>●</span>}
          {status === 'active' ? 'Active' : status || 'Pending'}
        </div>
      </div>
      
      <div className="address-actions-modern">
        <button className="action-btn-modern btn-navigate" onClick={onNavigate}>
          <span>🧭</span>
          <span>Navigate</span>
        </button>
        {isActive ? (
          <>
            <button className="action-btn-modern btn-complete" onClick={onComplete}>
              <span>✅</span>
              <span>Complete</span>
            </button>
            <button className="action-btn-modern btn-arrangement">
              <span>📅</span>
              <span>Arrangement</span>
            </button>
          </>
        ) : (
          <button className="action-btn-modern btn-set-active" onClick={onSetActive}>
            <span>▶️</span>
            <span>Set Active</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Main App Component with Modern Layout
function AuthedApp() {
  const {
    state,
    loading,
    setAddresses,
    addAddress,
    setActive,
    complete,
    startDay,
    endDay,
    backupState,
    addArrangement,
    updateArrangement,
    deleteArrangement,
    updateReminderSettings,
    updateReminderNotification,
  } = useAppState();

  const cloudSync = useCloudSync();
  const { hasAccess } = useSubscription(cloudSync.user);
  const { isAdmin, isOwner } = useAdmin(cloudSync.user);
  const [showSubscription, setShowSubscription] = React.useState(false);
  const [showAdmin, setShowAdmin] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");

  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const arrangements = Array.isArray(state.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state.daySessions) ? state.daySessions : [];

  // Stats calculation
  const stats = React.useMemo(() => {
    const currentVer = state.currentListVersion;
    const completedIdx = new Set(
      completions
        .filter((c) => c.listVersion === currentVer)
        .map((c) => c.index)
    );
    const total = addresses.length;
    const pending = total - completedIdx.size;
    const pifCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "PIF"
    ).length;
    const doneCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "Done"
    ).length;
    const daCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "DA"
    ).length;
    const arrCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "ARR"
    ).length;
    const completed = completedIdx.size;
    
    const pendingArrangements = arrangements.filter(arr => 
      arr.status !== "Completed" && arr.status !== "Cancelled"
    ).length;

    // Calculate today's earnings
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaysPIF = completions
      .filter((c) => 
        c.outcome === "PIF" && 
        (c.timestamp || "").slice(0, 10) === todayStr
      )
      .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
    
    return { 
      total, pending, completed, pifCount, doneCount, 
      daCount, arrCount, pendingArrangements, todaysPIF 
    };
  }, [addresses, completions, arrangements, state.currentListVersion]);

  // Get visible addresses (not completed)
  const visibleAddresses = React.useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    return addresses
      .map((addr, idx) => ({ addr, idx }))
      .filter(({ idx }) => !completions.some(
        (c) => c.index === idx && c.listVersion === state.currentListVersion
      ))
      .filter(({ addr }) =>
        !lowerSearch || (addr.address ?? "").toLowerCase().includes(lowerSearch)
      );
  }, [addresses, completions, search, state.currentListVersion]);

  const handleImportExcel = React.useCallback((rows: AddressRow[]) => {
    setAddresses(rows, true);
  }, [setAddresses]);

  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => {
      await complete(index, outcome, amount, arrangementId);
    },
    [complete]
  );

  const getUserInitials = () => {
    const email = cloudSync.user?.email || "";
    const parts = email.split("@")[0].split(".");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getSyncStatus = () => {
    if (cloudSync.isSyncing) {
      return { text: "Syncing", color: "var(--warning)" };
    }
    if (!cloudSync.isOnline) {
      return { text: "Offline", color: "var(--danger)" };
    }
    return { text: "Online", color: "var(--success)" };
  };

  const syncStatus = getSyncStatus();

  if (loading) {
    return (
      <div className="app-wrapper">
        <div className="main-area">
          <div className="content-area">
            <div className="loading">
              <div className="spinner" />
              Preparing your workspace...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* Admin Dashboard Modal */}
      {showAdmin && isAdmin && (
        <AdminDashboard 
          user={cloudSync.user!} 
          onClose={() => setShowAdmin(false)} 
        />
      )}

      {/* Subscription Modal */}
      {showSubscription && (
        <SubscriptionManager 
          user={cloudSync.user!} 
          onClose={() => setShowSubscription(false)} 
        />
      )}

      {/* Main Content Area (Left Side) */}
      <main className="main-area">
        {/* Modern Header */}
        <header className="app-header-modern">
          <div className="header-left">
            <div className="logo-section">
              <div className="logo-icon">📍</div>
              <div className="logo-text">
                <div className="logo-title">Navigator</div>
                <div className="logo-subtitle">Enforcement Pro</div>
              </div>
            </div>
            
            <div className="search-container-modern">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                className="search-input-modern"
                placeholder="Search addresses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="header-center">
            <div className="sync-status">
              <div className="sync-indicator" style={{ background: syncStatus.color }} />
              <span>{syncStatus.text}</span>
            </div>
          </div>

          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
        </header>

        {/* Content Area */}
        <div className="content-area">
          {tab === "list" && (
            <>
              {/* Modern Day Panel */}
              <ModernDayPanel
                sessions={daySessions}
                completions={completions}
                startDay={startDay}
                endDay={() => {
                  backupState();
                  // Upload backup logic here
                  endDay();
                }}
              />

              {/* Stats Grid */}
              <div className="stats-grid">
                <StatsCard
                  title="Pending Addresses"
                  value={stats.pending}
                  change={`${stats.completed} completed today`}
                  changeType="positive"
                  icon="📍"
                  iconType="info"
                />
                <StatsCard
                  title="Today's Earnings"
                  value={`£${stats.todaysPIF.toFixed(0)}`}
                  change={`${stats.pifCount} PIF today`}
                  changeType="positive"
                  icon="💰"
                  iconType="success"
                />
                <StatsCard
                  title="Arrangements Due"
                  value={stats.pendingArrangements}
                  change="Check arrangements tab"
                  changeType="neutral"
                  icon="📅"
                  iconType="warning"
                />
                <StatsCard
                  title="Completion Rate"
                  value={`${Math.round((stats.completed / Math.max(stats.total, 1)) * 100)}%`}
                  change="Good performance"
                  changeType="positive"
                  icon="📊"
                  iconType="success"
                />
              </div>

              {/* Address List */}
              <h2 style={{ margin: "2rem 0 1rem", color: "var(--gray-800)" }}>
                Active Addresses ({visibleAddresses.length})
              </h2>
              
              <div className="address-list-modern">
                {visibleAddresses.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📍</div>
                    <div className="empty-title">No Pending Addresses</div>
                    <div className="empty-message">
                      Import an Excel file or add addresses manually to get started
                    </div>
                  </div>
                ) : (
                  visibleAddresses.map(({ addr, idx }, displayIdx) => (
                    <ModernAddressCard
                      key={idx}
                      address={addr}
                      displayIndex={displayIdx}
                      isActive={state.activeIndex === idx}
                      status={state.activeIndex === idx ? 'active' : 'pending'}
                      onSetActive={() => setActive(idx)}
                      onNavigate={() => {
                        window.open(
                          `https://www.google.com/maps/search/${encodeURIComponent(addr.address)}`,
                          "_blank"
                        );
                      }}
                      onComplete={() => {
                        // Show complete modal
                        setActive(idx);
                      }}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {tab === "completed" && (
            <Completed state={state} onChangeOutcome={() => {}} />
          )}

          {tab === "arrangements" && (
            <Arrangements
              state={state}
              onAddArrangement={addArrangement}
              onUpdateArrangement={updateArrangement}
              onDeleteArrangement={deleteArrangement}
              onAddAddress={async (addr: AddressRow) => addAddress(addr)}
              onComplete={handleComplete}
              onUpdateReminderSettings={updateReminderSettings}
              onUpdateReminderNotification={updateReminderNotification}
            />
          )}

          {tab === "earnings" && (
            <EarningsCalendar state={state} user={cloudSync.user} />
          )}

          {tab === "planning" && (
            <RoutePlanning 
              user={cloudSync.user}
              onAddressesReady={(newAddresses) => {
                setAddresses(newAddresses, false);
              }}
            />
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="quick-actions">
          <button className="fab" title="Import Excel">
            <ImportExcel onImported={handleImportExcel} />
          </button>
          <button className="fab fab-main" onClick={() => addAddress({ address: "", lat: null, lng: null })}>
            +
          </button>
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className={`sidebar-right ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="user-profile-section">
            <div className="user-avatar">{getUserInitials()}</div>
            <div className="user-info">
              <div className="user-name">{cloudSync.user?.email?.split("@")[0]}</div>
              <div className="user-plan">
                {isOwner ? "Owner Access" : hasAccess ? "Premium Plan" : "Free Trial"}
              </div>
            </div>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <div 
              className={`nav-item ${tab === 'list' ? 'active' : ''}`}
              onClick={() => setTab('list')}
            >
              <span className="nav-icon">📋</span>
              <span>Address List</span>
              <span className="nav-badge">{stats.pending}</span>
            </div>
            <div 
              className={`nav-item ${tab === 'completed' ? 'active' : ''}`}
              onClick={() => setTab('completed')}
            >
              <span className="nav-icon">✅</span>
              <span>Completed</span>
              <span className="nav-badge">{stats.completed}</span>
            </div>
            <div 
              className={`nav-item ${tab === 'arrangements' ? 'active' : ''}`}
              onClick={() => setTab('arrangements')}
            >
              <span className="nav-icon">📅</span>
              <span>Arrangements</span>
              <span className="nav-badge">{stats.pendingArrangements}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Analytics</div>
            <div 
              className={`nav-item ${tab === 'earnings' ? 'active' : ''}`}
              onClick={() => setTab('earnings')}
            >
              <span className="nav-icon">💰</span>
              <span>Earnings</span>
            </div>
            <div 
              className={`nav-item ${tab === 'planning' ? 'active' : ''}`}
              onClick={() => setTab('planning')}
            >
              <span className="nav-icon">🗺️</span>
              <span>Route Planning</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <div className="nav-item" onClick={() => setShowSubscription(true)}>
              <span className="nav-icon">⭐</span>
              <span>Subscription</span>
            </div>
            {isAdmin && (
              <div className="nav-item" onClick={() => setShowAdmin(true)}>
                <span className="nav-icon">👑</span>
                <span>Admin Panel</span>
              </div>
            )}
            <div className="nav-item" onClick={() => cloudSync.signOut()}>
              <span className="nav-icon">🚪</span>
              <span>Sign Out</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Sidebar Overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );
}

export default function App() {
  const cloudSync = useCloudSync();

  if (cloudSync.isLoading) {
    return (
      <div className="app-wrapper">
        <div className="main-area">
          <div className="content-area">
            <div className="loading">
              <div className="spinner" />
              Restoring session...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!cloudSync.user) {
    return (
      <Auth
        onSignIn={async (email, password) => {
          await cloudSync.signIn(email, password);
        }}
        onSignUp={async (email, password) => {
          await cloudSync.signUp(email, password);
        }}
        isLoading={cloudSync.isLoading}
        error={cloudSync.error}
        onClearError={cloudSync.clearError}
      />
    );
  }

  return (
    <ModalProvider>
      <AuthedApp />
    </ModalProvider>
  );
}
