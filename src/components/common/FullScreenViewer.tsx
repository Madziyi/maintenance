import React from 'react';
import { X, MapPin } from 'lucide-react';

interface FullScreenViewerProps {
  imageUrl: string | null;
  markerX?: number; // Percentage (0-100)
  markerY?: number; // Percentage (0-100)
  onClose: () => void;
  isEditing?: boolean; // Allow editing in full screen
  onMapClick?: (x: number, y: number) => void; // Callback when clicking to set location
}

export const FullScreenViewer: React.FC<FullScreenViewerProps> = ({ 
  imageUrl, 
  markerX, 
  markerY, 
  onClose,
  isEditing = false,
  onMapClick
}) => {
  const [imageBounds, setImageBounds] = React.useState<{
    displayWidth: number;
    displayHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [showMarker, setShowMarker] = React.useState(true); // Toggle marker visibility
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

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isEditing || !onMapClick || !imageBounds || !containerRef.current) return;
    
    e.stopPropagation();
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Calculate click position relative to container
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Use the already calculated imageBounds
    // Check if click is within actual image bounds
    const relativeX = clickX - imageBounds.offsetX;
    const relativeY = clickY - imageBounds.offsetY;
    
    if (relativeX < 0 || relativeX > imageBounds.displayWidth || relativeY < 0 || relativeY > imageBounds.displayHeight) {
      return; // Click outside image
    }
    
    // Calculate percentage (0-100)
    const x = (relativeX / imageBounds.displayWidth) * 100;
    const y = (relativeY / imageBounds.displayHeight) * 100;
    
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    
    onMapClick(clampedX, clampedY);
  };

  const hasMarker = markerX !== undefined && markerY !== undefined && imageBounds;
  const displayMarker = hasMarker && showMarker;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
      onClick={onClose}
    >
      <button 
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full z-10"
        onClick={onClose}
      >
        <X size={32} />
      </button>
      
      {/* Marker visibility toggle - only show in view mode when marker exists */}
      {!isEditing && hasMarker && (
        <button
          className="absolute top-4 left-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg z-10 flex items-center gap-2 text-sm font-medium"
          onClick={(e) => {
            e.stopPropagation();
            setShowMarker(prev => !prev);
          }}
        >
          <MapPin size={18} className={showMarker ? "fill-white" : "opacity-50"} />
          <span>{showMarker ? "Hide marker" : "Show marker"}</span>
        </button>
      )}
      
      <div 
        ref={containerRef} 
        className="relative max-w-full max-h-[90vh]"
      >
        <img 
          ref={imgRef}
          src={imageUrl} 
          className={`max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl ${isEditing ? 'cursor-crosshair' : 'cursor-default'}`}
          onClick={isEditing ? handleImageClick : (e) => e.stopPropagation()}
          alt="Full screen view"
        />
        
        {/* Helper text in edit mode */}
        {isEditing && !markerX && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="bg-black/50 text-white px-4 py-2 rounded-full text-sm font-bold backdrop-blur-sm">
              Click map to set location
            </div>
          </div>
        )}
        
        {displayMarker && imageBounds && (
          <div 
            className="absolute transform -translate-x-1/2 -translate-y-full drop-shadow-lg pointer-events-none z-20"
            style={{ 
              left: `${imageBounds.offsetX + (markerX! / 100) * imageBounds.displayWidth}px`, 
              top: `${imageBounds.offsetY + (markerY! / 100) * imageBounds.displayHeight}px` 
            }}
          >
            <MapPin size={40} fill="#2563eb" stroke="white" strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
};

