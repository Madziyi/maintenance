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
    className={`w-full flex items-center transition-colors text-sm rounded-md mx-2 py-2.5 ${
      collapsed ? 'justify-center px-0' : 'space-x-3 px-6'
    } ${
      active
        ? 'bg-brand-600 text-white font-medium'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`}
  >
    <Icon size={18} />
    {!collapsed && <span>{label}</span>}
  </button>
);

