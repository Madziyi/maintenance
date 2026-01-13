import React from 'react';
import { X, MapPin } from 'lucide-react';

interface FullScreenViewerProps {
  imageUrl: string | null;
  markerX?: number; // Percentage (0-100)
  markerY?: number; // Percentage (0-100)
  onClose: () => void;
}

export const FullScreenViewer: React.FC<FullScreenViewerProps> = ({ 
  imageUrl, 
  markerX, 
  markerY, 
  onClose 
}) => {
  const [imageBounds, setImageBounds] = React.useState<{
    displayWidth: number;
    displayHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (imgRef.current && containerRef.current) {
      const img = imgRef.current;
      const container = containerRef.current;
      
      const updateBounds = () => {
        const containerRect = container.getBoundingClientRect();
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        
        if (naturalWidth === 0 || naturalHeight === 0) return;
        
        const containerAspect = containerRect.width / containerRect.height;
        const imageAspect = naturalWidth / naturalHeight;
        
        let displayWidth: number;
        let displayHeight: number;
        let offsetX: number;
        let offsetY: number;
        
        if (containerAspect > imageAspect) {
          // Container is wider - image is letterboxed
          displayHeight = containerRect.height;
          displayWidth = containerRect.height * imageAspect;
          offsetX = (containerRect.width - displayWidth) / 2;
          offsetY = 0;
        } else {
          // Container is taller - image is pillarboxed
          displayWidth = containerRect.width;
          displayHeight = containerRect.width / imageAspect;
          offsetX = 0;
          offsetY = (containerRect.height - displayHeight) / 2;
        }
        
        setImageBounds({ displayWidth, displayHeight, offsetX, offsetY });
      };
      
      updateBounds();
      img.addEventListener('load', updateBounds);
      window.addEventListener('resize', updateBounds);
      return () => {
        img.removeEventListener('load', updateBounds);
        window.removeEventListener('resize', updateBounds);
      };
    }
  }, [imageUrl]);

  if (!imageUrl) return null;

  const showMarker = markerX !== undefined && markerY !== undefined && imageBounds;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full z-10">
        <X size={32} />
      </button>
      <div ref={containerRef} className="relative max-w-full max-h-[90vh]">
        <img 
          ref={imgRef}
          src={imageUrl} 
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default" 
          onClick={(e) => e.stopPropagation()} 
          alt="Full screen view"
        />
        {showMarker && imageBounds && (
          <div 
            className="absolute transform -translate-x-1/2 -translate-y-full drop-shadow-lg pointer-events-none z-20"
            style={{ 
              left: `${imageBounds.offsetX + (markerX / 100) * imageBounds.displayWidth}px`, 
              top: `${imageBounds.offsetY + (markerY / 100) * imageBounds.displayHeight}px` 
            }}
          >
            <MapPin size={40} fill="#2563eb" stroke="white" strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
};

