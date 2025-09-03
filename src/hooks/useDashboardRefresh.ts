import { useEffect, useCallback } from 'react';

// Global flag to control dashboard refresh
let dashboardRefreshPaused = false;

// Custom hook to manage dashboard refresh events
export function useDashboardRefresh() {
  const triggerRefresh = useCallback(() => {
    // Only dispatch refresh event if not paused
    if (!dashboardRefreshPaused) {
      window.dispatchEvent(new CustomEvent('dashboardRefresh'));
    }
  }, []);

  const pauseRefresh = useCallback(() => {
    dashboardRefreshPaused = true;
  }, []);

  const resumeRefresh = useCallback(() => {
    dashboardRefreshPaused = false;
    // Trigger a refresh when resuming
    window.dispatchEvent(new CustomEvent('dashboardRefresh'));
  }, []);

  return { triggerRefresh, pauseRefresh, resumeRefresh };
}

// Hook for the dashboard to listen for refresh events
export function useDashboardRefreshListener(callback: () => void) {
  useEffect(() => {
    const handleRefresh = () => {
      // Only execute callback if not paused
      if (!dashboardRefreshPaused) {
        callback();
      }
    };

    window.addEventListener('dashboardRefresh', handleRefresh);
    
    return () => {
      window.removeEventListener('dashboardRefresh', handleRefresh);
    };
  }, [callback]);
}