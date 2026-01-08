import React, { useState, useEffect, useRef } from 'react';
import { Pannellum } from 'pannellum-react';
import 'pannellum-react/lib/pannellum/css/pannellum.css';
import { X, ArrowUpDown } from 'lucide-react';

interface FullscreenPanoramaViewerProps {
  imageUrl: string;
  onClose: () => void;
}

export const FullscreenPanoramaViewer: React.FC<FullscreenPanoramaViewerProps> = ({
  imageUrl,
  onClose
}) => {
  const [dynamicHfov, setDynamicHfov] = useState(100);
  const [freeRotation, setFreeRotation] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panImage = useRef<any>(null);

  // Calculate FOV based on screen size
  const calculateFov = () => {
    let width, height;

    // Check if we are in Fullscreen Mode
    const isFullscreen =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement;

    if (isFullscreen) {
      width = window.innerWidth;
      height = window.innerHeight;
    } else if (containerRef.current) {
      width = containerRef.current.clientWidth;
      height = containerRef.current.clientHeight;
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }

    if (width && height) {
      const screenAspect = width / height;
      const VAOV_DEG = 60; // Standard Phone Camera Vertical Angle
      const VAOV_RAD = (VAOV_DEG * Math.PI) / 180;

      // Calculate HFOV to match the vertical angle
      const tanHfov2 = screenAspect * Math.tan(VAOV_RAD / 2);
      const hfovRad = 2 * Math.atan(tanHfov2);
      const hfovDeg = (hfovRad * 180) / Math.PI;

      setDynamicHfov(hfovDeg);

      // Force immediate update if viewer exists
      if (panImage.current && panImage.current.getViewer()) {
        panImage.current.getViewer().setHfov(hfovDeg);
      }
    }
  };

  // Update pitch constraints when freeRotation changes
  useEffect(() => {
    if (panImage.current && panImage.current.getViewer()) {
      const viewer = panImage.current.getViewer();
      viewer.setPitchBounds(freeRotation ? [-120, 120] : [-2, 2]);
    }
  }, [freeRotation]);

  // Request fullscreen when component mounts
  useEffect(() => {
    const requestFullscreen = async () => {
      if (containerRef.current) {
        try {
          if (containerRef.current.requestFullscreen) {
            await containerRef.current.requestFullscreen();
          } else if ((containerRef.current as any).webkitRequestFullscreen) {
            await (containerRef.current as any).webkitRequestFullscreen();
          } else if ((containerRef.current as any).mozRequestFullScreen) {
            await (containerRef.current as any).mozRequestFullScreen();
          } else if ((containerRef.current as any).msRequestFullscreen) {
            await (containerRef.current as any).msRequestFullscreen();
          }
        } catch (error) {
          console.warn('Fullscreen request failed:', error);
        }
      }
    };

    requestFullscreen();
  }, []);

  // Listeners for size changes and fullscreen
  useEffect(() => {
    // Initial calculation
    calculateFov();

    // Browser resize
    window.addEventListener('resize', calculateFov);

    // Fullscreen events
    const fsEvents = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'msfullscreenchange',
    ];
    fsEvents.forEach((event) => document.addEventListener(event, calculateFov));

    // Container resize observer
    let observer: ResizeObserver | null = null;
    if (containerRef.current) {
      observer = new ResizeObserver(() => {
        calculateFov();
      });
      observer.observe(containerRef.current);
    }

    // ESC key handler - exit fullscreen and close
    const handleEsc = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Exit fullscreen first
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else if ((document as any).webkitFullscreenElement) {
            await (document as any).webkitExitFullscreen();
          } else if ((document as any).mozFullScreenElement) {
            await (document as any).mozCancelFullScreen();
          } else if ((document as any).msFullscreenElement) {
            await (document as any).msExitFullscreen();
          }
        } catch (error) {
          console.warn('Exit fullscreen failed:', error);
        }
        // Then close the viewer
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Cleanup
    return () => {
      window.removeEventListener('resize', calculateFov);
      fsEvents.forEach((event) =>
        document.removeEventListener(event, calculateFov)
      );
      if (observer) observer.disconnect();
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
    >
      {/* Close Button */}
      <button
        onClick={async () => {
          // Exit fullscreen first
          try {
            if (document.fullscreenElement) {
              await document.exitFullscreen();
            } else if ((document as any).webkitFullscreenElement) {
              await (document as any).webkitExitFullscreen();
            } else if ((document as any).mozFullScreenElement) {
              await (document as any).mozCancelFullScreen();
            } else if ((document as any).msFullscreenElement) {
              await (document as any).msExitFullscreen();
            }
          } catch (error) {
            console.warn('Exit fullscreen failed:', error);
          }
          // Then close the viewer
          onClose();
        }}
        className="absolute top-4 right-4 z-[10000] bg-white/90 hover:bg-white text-slate-800 rounded-full p-2 shadow-lg transition-colors"
        aria-label="Close 360 viewer"
      >
        <X size={24} />
      </button>

      {/* Pannellum Viewer */}
      <div className="w-full h-full">
        <Pannellum
          ref={panImage}
          width="100%"
          height="100%"
          image={imageUrl}
          haov={220}
          vaov={60}
          vOffset={0}
          pitch={0}
          minPitch={freeRotation ? -120 : -2}
          maxPitch={freeRotation ? 120 : 2}
          yaw={0}
          minYaw={-110}
          maxYaw={110}
          autoLoad
          showZoomCtrl={false}
          hfov={dynamicHfov}
          maxHfov={110}
        />
      </div>

      {/* Rotate Up/Down Toggle Button */}
      <button
        onClick={() => setFreeRotation(!freeRotation)}
        className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[10000] px-4 py-2 rounded-lg font-medium shadow-lg transition-colors flex items-center gap-2 ${
          freeRotation
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : 'bg-white/90 text-slate-800 hover:bg-white'
        }`}
        aria-label={freeRotation ? 'Disable vertical rotation' : 'Enable vertical rotation'}
      >
        <ArrowUpDown size={18} />
        Rotate Up/Down
      </button>
    </div>
  );
};
