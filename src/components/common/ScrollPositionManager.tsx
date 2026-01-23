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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'D',location:'ScrollPositionManager.tsx:saveEffectEnter',message:'save effect attach',data:{path:`${location.pathname}${location.search}`,key:location.key,navType:navigationType,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const handleScroll = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;

        // If route changed, don't attribute a scroll event to the previous page key.
        const currentPath = `${window.location.pathname}${window.location.search}`;
        if (currentPath !== pathAtEffect) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'D',location:'ScrollPositionManager.tsx:saveSkipPathMismatch',message:'skip save due to path mismatch',data:{key:location.key,pathAtEffect,currentPath,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          return;
        }

        try {
          sessionStorage.setItem(storageKeyForLocation(location.key), String(el.scrollTop));
        } catch {
          // ignore storage errors (private mode, quota, etc.)
        }

        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'D',location:'ScrollPositionManager.tsx:save',message:'saved scroll',data:{key:location.key,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'A',location:'ScrollPositionManager.tsx:firstMount',message:'first mount -> scroll top',data:{path:`${location.pathname}${location.search}`,key:location.key,navType:navigationType,scrollTop:el.scrollTop},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return;
    }

    const shouldRestore = navigationType === 'POP' || !!restoreKeyFromState;
    const keyToRestore = restoreKeyFromState || location.key;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'B',location:'ScrollPositionManager.tsx:restoreEffectEnter',message:'restore effect',data:{path:`${location.pathname}${location.search}`,key:location.key,navType:navigationType,restoreKey:restoreKeyFromState,shouldRestore,keyToRestore,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!shouldRestore) {
      el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'B',location:'ScrollPositionManager.tsx:restoreSkip',message:'skip restore -> scroll top',data:{path:`${location.pathname}${location.search}`,key:location.key,navType:navigationType},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'C',location:'ScrollPositionManager.tsx:restoreApplied',message:'restore applied',data:{key:location.key,keyToRestore,requestedTop:top,actualTop:el.scrollTop,clamped,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/548404a9-c8cb-455b-b674-66bbed331a6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'C',location:'ScrollPositionManager.tsx:restoreRetry',message:'restore retry after resize',data:{targetTop:pending.targetTop,actualTop:el.scrollTop,clamped,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollContainerRef]);

  return null;
};

