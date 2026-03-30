import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick, collapsed = false }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`w-full flex items-center transition-all duration-200 text-sm rounded-xl mx-2 py-2.5 ${
      collapsed ? 'justify-center px-0' : 'space-x-3 px-4'
    } ${
      active
        ? 'bg-brand-600 text-white font-medium shadow-soft'
        : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
    }`}
  >
    <Icon size={18} className="shrink-0 opacity-90" />
    {!collapsed && <span className="truncate">{label}</span>}
  </button>
);

