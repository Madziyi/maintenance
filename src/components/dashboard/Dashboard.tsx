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

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Facility Overview</h1>
          <p className="text-slate-500 text-sm mt-1.5">Welcome to WayFinder Dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!isAuthenticated && (
            <button
              onClick={onLoginClick}
              className="px-4 py-2 h-9 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <LogIn size={16} />
              <span>Log In</span>
            </button>
          )}
          <button
            onClick={onViewEquipment}
            className="px-4 py-2 h-9 rounded-md bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
          >
            View Equipment
          </button>
          <button
            onClick={onViewBuildings}
            className="px-4 py-2 h-9 rounded-md bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
          >
            View Buildings
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-md bg-brand-50">
              <BuildingIcon className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Buildings</p>
          <p className="text-3xl font-semibold text-slate-900">{data.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-md bg-brand-50">
              <Wrench className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Equipment</p>
          <p className="text-3xl font-semibold text-slate-900">{totalEquipment}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-md bg-brand-50">
              <MapPin className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Maint. Rooms</p>
          <p className="text-3xl font-semibold text-slate-900">{totalRooms}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-md bg-brand-50">
              <ImageIcon className="text-brand-600" size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Floor Plans</p>
          <p className="text-3xl font-semibold text-slate-900">{totalPlans}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg border border-slate-200">
        <h2 className="text-lg font-semibold mb-6 text-slate-900">Top Equipment Density by Building</h2>
        <div className="h-64 md:h-80 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: '#f1f5f9'}}
                contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'}}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40} fill="#5b6cff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

