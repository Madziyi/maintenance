import React, { useMemo } from 'react';
import { Building as BuildingIcon, Wrench, MapPin, Image as ImageIcon, LogIn } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BuildingData } from '../../../types';

interface DashboardProps {
  data: BuildingData[];
  isAuthenticated: boolean;
  onLoginClick: () => void;
  onViewEquipment: () => void;
  onViewBuildings: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  isAuthenticated,
  onLoginClick,
  onViewEquipment,
  onViewBuildings,
}) => {
  const totalEquipment = useMemo(() => 
    data.reduce((acc, b) => acc + b.equipment.length, 0), 
    [data]
  );
  const totalRooms = useMemo(() => 
    data.reduce((acc, b) => acc + b.maintenanceRooms.length, 0), 
    [data]
  );
  const totalPlans = useMemo(() => 
    data.reduce((acc, b) => acc + b.floorPlans.length, 0), 
    [data]
  );
  
  const chartData = useMemo(() => 
    data.map(b => ({
      name: b.code,
      full: b.name,
      count: b.equipment.length
    })).sort((a,b) => b.count - a.count).slice(0, 10),
    [data]
  );

  const cardBase =
    'bg-white p-6 rounded-2xl shadow-card ring-1 ring-slate-900/5 hover:shadow-card-hover transition-shadow duration-200';

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Facility Overview</h1>
          <p className="text-slate-500 text-sm mt-2">Welcome to WayFinder Dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!isAuthenticated && (
            <button
              onClick={onLoginClick}
              className="px-5 h-10 rounded-full bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors duration-200 flex items-center gap-2 shadow-soft"
            >
              <LogIn size={16} />
              <span>Log In</span>
            </button>
          )}
          <button
            onClick={onViewEquipment}
            className="px-5 h-10 rounded-full bg-white border border-slate-200/80 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 hover:shadow-soft transition-all duration-200 whitespace-nowrap ring-1 ring-slate-900/5"
          >
            View Equipment
          </button>
          <button
            onClick={onViewBuildings}
            className="px-5 h-10 rounded-full bg-white border border-slate-200/80 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 hover:shadow-soft transition-all duration-200 whitespace-nowrap ring-1 ring-slate-900/5"
          >
            View Buildings
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardBase}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100/80">
              <BuildingIcon className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Buildings</p>
          <p className="text-3xl font-semibold text-slate-900 tabular-nums">{data.length}</p>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100/80">
              <Wrench className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Equipment</p>
          <p className="text-3xl font-semibold text-slate-900 tabular-nums">{totalEquipment}</p>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100/80">
              <MapPin className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Maint. Rooms</p>
          <p className="text-3xl font-semibold text-slate-900 tabular-nums">{totalRooms}</p>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100/80">
              <ImageIcon className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Floor Plans</p>
          <p className="text-3xl font-semibold text-slate-900 tabular-nums">{totalPlans}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-card ring-1 ring-slate-900/5">
        <h2 className="text-lg font-semibold mb-6 text-slate-900">Top Equipment Density by Building</h2>
        <div className="h-64 md:h-80 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: '#f4f6fb'}}
                contentStyle={{borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(15 23 42 / 0.08)', padding: '10px 12px'}}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={40} fill="#5b6cff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

