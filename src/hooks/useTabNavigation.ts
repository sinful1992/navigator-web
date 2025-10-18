// src/hooks/useTabNavigation.ts
import { useState, useCallback, useEffect } from 'react';

export type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";

/**
 * Custom hook to manage tab navigation with URL hash synchronization
 * and browser history support.
 *
 * Features:
 * - Tab state management
 * - URL hash synchronization (#list, #completed, etc.)
 * - Browser back/forward button support
 * - Search state management
 *
 * @param initialTab - Optional initial tab (defaults to reading from URL hash)
 * @returns Tab state and navigation functions
 */
export function useTabNavigation(initialTab?: Tab) {
  /**
   * Get initial tab from URL hash or default to "list"
   */
  const getInitialTab = (): Tab => {
    const hash = window.location.hash.slice(1);
    const validTabs: Tab[] = ["list", "completed", "arrangements", "earnings", "planning"];
    return validTabs.includes(hash as Tab) ? (hash as Tab) : (initialTab || "list");
  };

  const [tab, setTab] = useState<Tab>(getInitialTab);
  const [search, setSearch] = useState("");

  /**
   * Navigate to a tab with history support
   * Updates both state and URL hash, creating a browser history entry
   */
  const navigateToTab = useCallback((newTab: Tab) => {
    if (newTab !== tab) {
      setTab(newTab);
      window.history.pushState({ tab: newTab }, '', `#${newTab}`);
    }
  }, [tab]);

  /**
   * Browser back button navigation support
   * Listens to popstate events and syncs tab state with URL hash
   */
  useEffect(() => {
    const handlePopState = () => {
      const newTab = getInitialTab();
      setTab(newTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []); // Empty deps - only set up listener once

  return {
    tab,
    setTab, // Also expose direct setter for edge cases
    navigateToTab,
    search,
    setSearch,
  };
}
