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

  const restoreKeyFromState = useMemo(() => {
    const state = location.state as RestoreState | null | undefined;
    return state?.restoreKey;
  }, [location.state]);

  const storageKeyForLocation = (key: string) => `${STORAGE_PREFIX}${key}`;

  // Save scroll position for the current history entry (location.key)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
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
  }, [location.key, scrollContainerRef]);

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

    // Wait for content to render/layout before restoring.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      });
    });
  }, [location.key, navigationType, restoreKeyFromState, scrollContainerRef]);

  return null;
};

