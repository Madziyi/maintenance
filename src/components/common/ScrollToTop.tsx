import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  const prevPathnameRef = useRef<string>('');

  useEffect(() => {
    // Helper to check if a route is a detail page
    const isDetailRoute = (route: string): boolean => {
      return (
        (route.includes('/equipment/') && route.match(/^\/equipment\/\d+$/)) ||
        route.includes('/room/') ||
        (route.includes('/building/') && 
         !route.endsWith('/building') &&
         !route.includes('/floor-plans') &&
         route.match(/^\/building\/[^/]+$/))
      );
    };

    // Helper to check if a route is a list page
    const isListRoute = (route: string): boolean => {
      return (
        route === '/equipment' ||
        route === '/rooms' ||
        route === '/building' ||
        (route.startsWith('/building/') && route.includes('/floor-plans'))
      );
    };

    const currentIsDetail = isDetailRoute(pathname);
    const currentIsList = isListRoute(pathname);
    const prevWasDetail = prevPathnameRef.current ? isDetailRoute(prevPathnameRef.current) : false;
    const prevWasList = prevPathnameRef.current ? isListRoute(prevPathnameRef.current) : false;

    // Always scroll to top when navigating TO a detail page
    if (currentIsDetail) {
      const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        window.scrollTo(0, 0);
      }
    }
    // Don't scroll when navigating from detail back to list (let restoration happen)
    else if (prevWasDetail && currentIsList) {
      // Do nothing - let the list component restore scroll position
    }
    // For all other cases, scroll to top
    else {
      const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        window.scrollTo(0, 0);
      }
    }
    
    prevPathnameRef.current = pathname;
  }, [pathname]);

  return null;
};
