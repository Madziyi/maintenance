import React from 'react';
import { RefreshCw } from 'lucide-react';

export const LoadingScreen: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-slate-400">
    <RefreshCw className="animate-spin mb-4" size={48} />
    <p>Connecting to Cloudflare D1...</p>
  </div>
);

