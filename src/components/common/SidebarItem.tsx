import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-6 py-2.5 mx-2 rounded-md transition-colors text-sm ${
      active 
        ? 'bg-brand-600 text-white font-medium' 
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

