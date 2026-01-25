import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

type RestoreState = {
  restoreKey?: string;
};

type ScrollPositionManagerProps = {
  /** The main page scroll container (App's overflow-y-auto div). */
  scrollContainerRef: React.RefObject<HTMLElement>;
};

const STORAGE_PREFIX = 'pageScroll:';

export const ScrollPositionManager: React.FC<ScrollPositionManagerProps> = ({ scrollContainerRef }) => {
  const location = useLocation();
  const navigationType = useNavigationType(); // POP (browser back/forward), PUSH, REPLACE

  const didMountRef = useRef(false);
  const rafPendingRef = useRef(false);
  const pendingRestoreRef = useRef<{ targetTop: number; keyToRestore: string; clamped: boolean } | null>(null);

  const restoreKeyFromState = useMemo(() => {
    const state = location.state as RestoreState | null | undefined;
    return state?.restoreKey;
  }, [location.state]);

  const storageKeyForLocation = (key: string) => `${STORAGE_PREFIX}${key}`;

  // Save scroll position for the current history entry (location.key)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const pathAtEffect = `${location.pathname}${location.search}`;

    const handleScroll = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;

        // If route changed, don't attribute a scroll event to the previous page key.
        const currentPath = `${window.location.pathname}${window.location.search}`;
        if (currentPath !== pathAtEffect) {
          return;
        }

        try {
          sessionStorage.setItem(storageKeyForLocation(location.key), String(el.scrollTop));
        } catch {
          // ignore storage errors (private mode, quota, etc.)
        }


      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    // Save once immediately (useful if user navigates without scrolling)
    handleScroll();

    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [location.key, location.pathname, location.search, scrollContainerRef]);

  // Restore on back navigation only (browser POP or explicit restoreKey).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Never restore on initial page load (covers manual URL entry / reload).
    if (!didMountRef.current) {
      didMountRef.current = true;
      el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });



      return;
    }

    const shouldRestore = navigationType === 'POP' || !!restoreKeyFromState;
    const keyToRestore = restoreKeyFromState || location.key;




    if (!shouldRestore) {
      el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  

      return;
    }

    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(storageKeyForLocation(keyToRestore));
    } catch {
      saved = null;
    }

    if (!saved) return;
    const top = parseInt(saved, 10);
    if (Number.isNaN(top)) return;

    pendingRestoreRef.current = { targetTop: top, keyToRestore, clamped: false };

    // Wait for content to render/layout before restoring.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
        const clamped = el.scrollTop < top - 1; // allow tiny float diffs
        if (pendingRestoreRef.current) {
          pendingRestoreRef.current.clamped = clamped;
        }


      });
    });
  }, [location.key, navigationType, restoreKeyFromState, scrollContainerRef]);

  // If restoration was clamped (page too short), re-apply once content grows (e.g., pagination expands).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      const pending = pendingRestoreRef.current;
      if (!pending || !pending.clamped) return;

      const maxTop = el.scrollHeight - el.clientHeight;
      if (maxTop < pending.targetTop - 1) {
        // Still not tall enough.
        return;
      }

      el.scrollTo({ top: pending.targetTop, behavior: 'instant' as ScrollBehavior });
      const clamped = el.scrollTop < pending.targetTop - 1;
      pendingRestoreRef.current = { ...pending, clamped };

    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollContainerRef]);

  return null;
};

