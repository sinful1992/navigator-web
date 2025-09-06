// Enhanced Swipe Hook - src/hooks/useSwipeNavigation.ts
import { useCallback, useEffect, useRef, useState } from 'react';

type SwipeDirection = 'left' | 'right' | null;

interface SwipeConfig {
  threshold: number;
  velocity: number;
  preventScroll: boolean;
  resistance: number;
}

interface SwipeState {
  isActive: boolean;
  startX: number;
  currentX: number;
  deltaX: number;
  direction: SwipeDirection;
  velocity: number;
}

const defaultConfig: SwipeConfig = {
  threshold: 80,      // Minimum swipe distance
  velocity: 0.3,      // Minimum velocity for quick swipes
  preventScroll: true, // Prevent vertical scroll during horizontal swipe
  resistance: 0.25,   // Resistance when swiping past boundaries
};

export function useSwipeNavigation(
  totalTabs: number,
  currentTab: number,
  onTabChange: (index: number) => void,
  config: Partial<SwipeConfig> = {}
) {
  const fullConfig = { ...defaultConfig, ...config };
  const containerRef = useRef<HTMLDivElement>(null);
  const [swipeState, setSwipeState] = useState<SwipeState>({
    isActive: false,
    startX: 0,
    currentX: 0,
    deltaX: 0,
    direction: null,
    velocity: 0,
  });
  
  const lastMoveTime = useRef(0);
  const lastMoveX = useRef(0);
  const animationFrame = useRef<number>();

  // Calculate transform with resistance at boundaries
  const calculateTransform = useCallback((deltaX: number, baseTransform: number) => {
    let transform = baseTransform + deltaX;
    
    // Apply resistance at boundaries
    if (currentTab === 0 && deltaX > 0) {
      // At first tab, swiping right (positive deltaX)
      transform = baseTransform + (deltaX * fullConfig.resistance);
    } else if (currentTab === totalTabs - 1 && deltaX < 0) {
      // At last tab, swiping left (negative deltaX)
      transform = baseTransform + (deltaX * fullConfig.resistance);
    }
    
    return transform;
  }, [currentTab, totalTabs, fullConfig.resistance]);

  const updateTransform = useCallback((immediate = false) => {
    if (!containerRef.current) return;
    
    const baseTransform = -(currentTab * (100 / totalTabs));
    const transform = swipeState.isActive 
      ? calculateTransform(swipeState.deltaX * (100 / totalTabs) / window.innerWidth, baseTransform)
      : baseTransform;
    
    const style = containerRef.current.style;
    
    if (immediate) {
      style.transition = 'none';
    } else if (!swipeState.isActive) {
      style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    } else {
      style.transition = 'none';
    }
    
    style.transform = `translateX(${transform}%)`;
  }, [currentTab, totalTabs, swipeState, calculateTransform]);

  // Handle touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const now = Date.now();
    
    setSwipeState(prev => ({
      ...prev,
      isActive: true,
      startX: touch.clientX,
      currentX: touch.clientX,
      deltaX: 0,
      direction: null,
      velocity: 0,
    }));
    
    lastMoveTime.current = now;
    lastMoveX.current = touch.clientX;
    
    if (fullConfig.preventScroll) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }
  }, [fullConfig.preventScroll]);

  // Handle touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swipeState.isActive) return;
    
    const touch = e.touches[0];
    const now = Date.now();
    const deltaX = touch.clientX - swipeState.startX;
    const timeDiff = now - lastMoveTime.current;
    const positionDiff = touch.clientX - lastMoveX.current;
    
    // Calculate velocity
    const velocity = timeDiff > 0 ? Math.abs(positionDiff) / timeDiff : 0;
    
    // Determine swipe direction
    const direction: SwipeDirection = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null;
    
    setSwipeState(prev => ({
      ...prev,
      currentX: touch.clientX,
      deltaX,
      direction,
      velocity,
    }));
    
    lastMoveTime.current = now;
    lastMoveX.current = touch.clientX;
    
    // Prevent default if it's a horizontal swipe
    if (Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  }, [swipeState.isActive, swipeState.startX]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!swipeState.isActive) return;
    
    const { deltaX, velocity, direction } = swipeState;
    const absDistance = Math.abs(deltaX);
    const shouldChangePage = absDistance > fullConfig.threshold || velocity > fullConfig.velocity;
    
    let newTabIndex = currentTab;
    
    if (shouldChangePage && direction) {
      if (direction === 'right' && currentTab > 0) {
        newTabIndex = currentTab - 1;
      } else if (direction === 'left' && currentTab < totalTabs - 1) {
        newTabIndex = currentTab + 1;
      }
    }
    
    setSwipeState(prev => ({
      ...prev,
      isActive: false,
      deltaX: 0,
      direction: null,
    }));
    
    if (fullConfig.preventScroll) {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    
    if (newTabIndex !== currentTab) {
      onTabChange(newTabIndex);
    }
  }, [swipeState, currentTab, totalTabs, fullConfig, onTabChange]);

  // Update transform when state changes
  useEffect(() => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    
    animationFrame.current = requestAnimationFrame(() => {
      updateTransform();
    });
    
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [updateTransform]);

  // Add event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const options = { passive: false };
    
    container.addEventListener('touchstart', handleTouchStart, options);
    container.addEventListener('touchmove', handleTouchMove, options);
    container.addEventListener('touchend', handleTouchEnd, options);
    container.addEventListener('touchcancel', handleTouchEnd, options);
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (fullConfig.preventScroll) {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
      }
    };
  }, [fullConfig.preventScroll]);

  return {
    containerRef,
    isSwipeActive: swipeState.isActive,
    swipeProgress: swipeState.deltaX / window.innerWidth,
  };
}

