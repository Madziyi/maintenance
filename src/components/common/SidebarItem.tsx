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
    className={`relative flex items-center transition-all duration-200 text-sm rounded-xl py-2.5 ${
      collapsed ? 'justify-center px-0 w-12 mx-auto' : 'w-[calc(100%-1rem)] mx-2 space-x-3 px-4'
    } ${
      active
        ? 'bg-brand-600 text-white font-medium shadow-soft'
        : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
    }`}
  >
    {active && (
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full ${
          collapsed ? 'bg-brand-300' : 'bg-white/40'
        }`}
      />
    )}
    <Icon size={18} className="shrink-0 opacity-90" />
    {!collapsed && <span className="truncate">{label}</span>}
  </button>
);

