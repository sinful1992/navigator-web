// src/components/Sidebar.tsx
import * as React from 'react';
import { getUserInitials } from '../utils/userUtils';
import type { Tab } from '../App';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  isOwner: boolean;
  hasAccess: boolean;
  isAdmin: boolean;
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
  stats: {
    pending: number;
    completed: number;
    pendingArrangements: number;
  };
  onShowAdmin: () => void;
}

/**
 * Right Sidebar Navigation
 *
 * Displays:
 * - User profile section
 * - Main navigation (List, Completed, Arrangements)
 * - Analytics section (Earnings, Route Planning)
 * - Admin section (if admin)
 */
export function Sidebar({
  isOpen,
  onClose,
  user,
  isOwner,
  hasAccess,
  isAdmin,
  currentTab,
  onTabChange,
  stats,
  onShowAdmin
}: SidebarProps) {
  const handleTabClick = (tab: Tab) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <aside className={`sidebar-right ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="user-profile-section">
          <div className="user-avatar">{getUserInitials(user?.email || "")}</div>
          <div className="user-info">
            <div className="user-name">{user?.email?.split("@")[0]}</div>
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
            className={`nav-item ${currentTab === 'list' ? 'active' : ''}`}
            onClick={() => handleTabClick('list')}
          >
            <span className="nav-icon">📋</span>
            <span>Address List</span>
            <span className="nav-badge">{stats.pending}</span>
          </div>
          <div
            className={`nav-item ${currentTab === 'completed' ? 'active' : ''}`}
            onClick={() => handleTabClick('completed')}
          >
            <span className="nav-icon">✅</span>
            <span>Completed</span>
            <span className="nav-badge">{stats.completed}</span>
          </div>
          <div
            className={`nav-item ${currentTab === 'arrangements' ? 'active' : ''}`}
            onClick={() => handleTabClick('arrangements')}
          >
            <span className="nav-icon">📅</span>
            <span>Arrangements</span>
            <span className="nav-badge">{stats.pendingArrangements}</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Analytics</div>
          <div
            className={`nav-item ${currentTab === 'earnings' ? 'active' : ''}`}
            onClick={() => handleTabClick('earnings')}
          >
            <span className="nav-icon">💰</span>
            <span>Earnings</span>
          </div>
          <div
            className={`nav-item ${currentTab === 'planning' ? 'active' : ''}`}
            onClick={() => handleTabClick('planning')}
          >
            <span className="nav-icon">🗺️</span>
            <span>Route Planning</span>
          </div>
        </div>

        {/* Admin section - only visible for admins */}
        {isAdmin && (
          <div className="nav-section">
            <div className="nav-section-title">Admin</div>
            <div
              className="nav-item"
              onClick={() => {
                onShowAdmin();
                onClose();
              }}
            >
              <span className="nav-icon">👑</span>
              <span>Admin Panel</span>
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
