import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, MapPin, Plus, X } from 'lucide-react';
import { BuildingData } from '@/types';
import { fuzzyMatch } from '@/src/utils/fuzzySearch';

interface BuildingListProps {
  data: BuildingData[];
  onAddBuilding: (code: string, name: string) => void;
  canEdit?: boolean;
}

export const BuildingList: React.FC<BuildingListProps> = ({
  data,
  onAddBuilding,
  canEdit = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddingBuilding, setIsAddingBuilding] = useState(false);
  const [newBuildingCode, setNewBuildingCode] = useState('');
  const [newBuildingName, setNewBuildingName] = useState('');
  
  // Local search state (avoids re-rendering entire App on each keystroke)
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => 
    data
      .filter(b => fuzzyMatch(
        b,
        searchTerm,
        ['name', 'code'],
        { threshold: 0.4 } // Balanced: allows ~60% similarity
      ))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data, searchTerm]
  );
  
  const handleAddBuilding = () => {
      if (!newBuildingCode || !newBuildingName) return;
      onAddBuilding(newBuildingCode, newBuildingName);
      setIsAddingBuilding(false);
      setNewBuildingCode('');
      setNewBuildingName('');
  };

  return (
      <div className="space-y-6 pb-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-lg border border-slate-200">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Buildings</h1>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-grow md:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                          type="text" 
                          placeholder="Filter buildings..." 
                          value={searchTerm} 
                          onChange={e => setSearchTerm(e.target.value)} 
                          className="w-full pl-10 pr-4 py-2 h-9 bg-white border-slate-200 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                      />
                  </div>
                  {canEdit && (
                    <button 
                        onClick={() => setIsAddingBuilding(!isAddingBuilding)} 
                        className="bg-brand-600 text-white px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-brand-700 whitespace-nowrap transition-colors shadow-sm"
                    >
                        {isAddingBuilding ? <X size={16} className="mr-2"/> : <Plus size={16} className="mr-2"/>}
                        {isAddingBuilding ? 'Cancel' : 'Add Building'}
                    </button>
                  )}
              </div>
          </div>

          {canEdit && isAddingBuilding && (
              <div className="bg-brand-50 border border-brand-100 p-6 rounded-xl animate-fade-in">
                  <h3 className="font-bold text-brand-800 mb-4">Add New Building</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div>
                          <label className="block text-xs font-bold text-brand-600 mb-1">Building Code</label>
                          <input 
                              placeholder="e.g. BIO" 
                              value={newBuildingCode} 
                              onChange={e => setNewBuildingCode(e.target.value.toUpperCase())} 
                              className="w-full border border-brand-200 rounded p-2 focus:ring-2 focus:ring-brand-500" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-brand-600 mb-1">Building Name</label>
                          <input 
                              placeholder="e.g. Biology Building" 
                              value={newBuildingName} 
                              onChange={e => setNewBuildingName(e.target.value)} 
                              className="w-full border border-brand-200 rounded p-2 focus:ring-2 focus:ring-brand-500" 
                          />
                      </div>
                      <button 
                          onClick={handleAddBuilding} 
                          className="bg-brand-600 text-white py-2 px-4 rounded font-bold hover:bg-brand-700 w-full md:w-auto"
                      >
                          Create Building
                      </button>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(b => (
                  <div 
                      key={b.code} 
                      onClick={() => navigate(`/building/${b.code}`, { 
                        state: { 
                          from: `${location.pathname}${location.search}`,
                          fromKey: location.key
                        } 
                      })} 
                      className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer group hover:border-brand-200 transition-all"
                  >
                       <div className="flex justify-between items-center mb-3">
                          <span className="bg-brand-50 text-brand-700 px-2 py-1 rounded text-xs font-bold group-hover:bg-brand-600 group-hover:text-white transition-colors">
                              {b.code}
                          </span>
                          <span className="text-slate-400 text-sm flex items-center">
                              <MapPin size={14} className="mr-1"/> {b.maintenanceRooms.length} Rooms
                          </span>
                       </div>
                       <h3 className="font-bold text-slate-800">{b.name}</h3>
                  </div>
              ))}
          </div>
      </div>
  );
};
