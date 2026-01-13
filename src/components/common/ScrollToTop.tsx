import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Find the scrollable container (the div with overflow-y-auto)
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
    
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      // Fallback to window scroll if container not found
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};
