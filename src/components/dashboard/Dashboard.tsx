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
    <div className="space-y-6 animate-fade-in pb-16">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Facility Overview</h1>
          <p className="text-slate-500">Welcome to WayFinder Dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isAuthenticated && (
            <button
              onClick={onLoginClick}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
            >
              <LogIn size={16} />
              <span>Log In</span>
            </button>
          )}
          <button
            onClick={onViewEquipment}
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            View Equipment
          </button>
          <button
            onClick={onViewBuildings}
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            View Buildings
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 rounded-full opacity-10 bg-brand-600 text-brand-600">
            <BuildingIcon size={24} />
          </div>
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Buildings</span>
          <span className="text-3xl font-bold mt-2 text-slate-800">{data.length}</span>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 rounded-full opacity-10 bg-green-600 text-green-600">
            <Wrench size={24} />
          </div>
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Equipment</span>
          <span className="text-3xl font-bold mt-2 text-slate-800">{totalEquipment}</span>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 rounded-full opacity-10 bg-orange-600 text-orange-600">
            <MapPin size={24} />
          </div>
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Maint. Rooms</span>
          <span className="text-3xl font-bold mt-2 text-slate-800">{totalRooms}</span>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 rounded-full opacity-10 bg-purple-600 text-purple-600">
            <ImageIcon size={24} />
          </div>
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Floor Plans</span>
          <span className="text-3xl font-bold mt-2 text-slate-800">{totalPlans}</span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-semibold mb-6 text-slate-700">Top Equipment Density by Building</h2>
        <div className="h-64 md:h-80 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: '#f1f5f9'}}
                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40} fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

