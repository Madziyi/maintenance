import React from 'react';
import { X } from 'lucide-react';

interface FullScreenViewerProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const FullScreenViewer: React.FC<FullScreenViewerProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full">
        <X size={32} />
      </button>
      <img 
        src={imageUrl} 
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default" 
        onClick={(e) => e.stopPropagation()} 
        alt="Full screen view"
      />
    </div>
  );
};

