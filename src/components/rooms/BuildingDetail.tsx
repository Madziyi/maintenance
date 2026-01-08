import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Building as BuildingIcon, Camera, Plus, ChevronRight, ExternalLink, X, Filter, RefreshCw } from 'lucide-react';
import { BuildingData } from '@/types';
import { MaintenanceRoom } from '@/types';
import { api } from '@/api';

interface BuildingDetailProps {
  data: BuildingData[];
  onUpdateBuilding: (buildingCode: string, updates: Partial<BuildingData>) => Promise<void>;
  onSetFullScreenImage: (url: string | null) => void;
  onSaveRoom: (room: MaintenanceRoom, buildingCode: string) => Promise<MaintenanceRoom | null>;
}

export const BuildingDetail: React.FC<BuildingDetailProps> = ({
  data,
  onUpdateBuilding,
  onSetFullScreenImage,
  onSaveRoom
}) => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  
  const selectedBuilding = useMemo(() => {
      return data.find(b => b.code === code) || null;
  }, [data, code]);

  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBuildingImage, setIsUploadingBuildingImage] = useState(false);
  
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>([]);

  if (!selectedBuilding) {
      return <Navigate to="/building" replace />;
  }

  // Extract unique filter options (normalized)
  const floorOptions = useMemo(() => {
      const floors = selectedBuilding.maintenanceRooms
          .map(r => r.Floor?.trim())
          .filter(f => f && f !== '') // Remove empty strings
          .filter((f, i, arr) => arr.indexOf(f) === i) // Get unique values
          .sort(); // Sort alphabetically
      return floors;
  }, [selectedBuilding.maintenanceRooms]);

  const descriptionOptions = useMemo(() => {
      const descriptions = selectedBuilding.maintenanceRooms
          .map(r => r.Description?.trim())
          .filter(d => d && d !== '')
          .filter((d, i, arr) => arr.indexOf(d) === i)
          .sort();
      return descriptions;
  }, [selectedBuilding.maintenanceRooms]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
      return selectedBuilding.maintenanceRooms.filter(room => {
          const roomFloor = room.Floor?.trim() || '';
          const roomDesc = room.Description?.trim() || '';
          
          const floorMatch = selectedFloors.length === 0 || 
              (roomFloor && selectedFloors.includes(roomFloor));
          
          const descMatch = selectedDescriptions.length === 0 || 
              (roomDesc && selectedDescriptions.includes(roomDesc));
          
          return floorMatch && descMatch;
      });
  }, [selectedBuilding.maintenanceRooms, selectedFloors, selectedDescriptions]);

  // Toggle filter selection
  const toggleFloor = (floor: string) => {
      setSelectedFloors(prev => 
          prev.includes(floor) 
              ? prev.filter(f => f !== floor)
              : [...prev, floor]
      );
  };

  const toggleDescription = (desc: string) => {
      setSelectedDescriptions(prev => 
          prev.includes(desc)
              ? prev.filter(d => d !== desc)
              : [...prev, desc]
      );
  };

  const clearFilters = () => {
      setSelectedFloors([]);
      setSelectedDescriptions([]);
  };

  const hasActiveFilters = selectedFloors.length > 0 || selectedDescriptions.length > 0;

  const handleCreateRoom = () => {
      setIsAddingRoom(true);
  };

  const handleSaveNewRoom = async () => {
      if (!newRoomNumber.trim()) {
          alert("Room number is required");
          return;
      }
      
      setIsSaving(true);
      try {
          const newRoom: MaintenanceRoom = {
              id: `${selectedBuilding.code}-NEW-${Date.now()}`,
              Building: selectedBuilding.code,
              RoomNumber: newRoomNumber.trim(),
              Description: newRoomDescription.trim() || 'Maintenance Room',
              Floor: newRoomFloor.trim(),
              floorPlanId: undefined,
              Notes: ''
          };
          
          const savedRoom = await onSaveRoom(newRoom, selectedBuilding.code);
          
          if (savedRoom) {
              setIsAddingRoom(false);
              setNewRoomNumber('');
              setNewRoomFloor('');
              setNewRoomDescription('');
              navigate(`/building/${selectedBuilding.code}/room/${savedRoom.id}`);
          }
      } catch (error) {
          alert("Failed to create room. Please try again.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleCancelAddRoom = () => {
      setIsAddingRoom(false);
      setNewRoomNumber('');
      setNewRoomFloor('');
      setNewRoomDescription('');
  };

  const handleBuildingImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setIsUploadingBuildingImage(true);
          try {
              const oldImageUrl = selectedBuilding.buildingImage;
              const url = await api.uploadFile(e.target.files[0], oldImageUrl);
              onUpdateBuilding(selectedBuilding.code, { buildingImage: url });
          } catch(e) { 
              alert("Upload failed"); 
          } finally {
              setIsUploadingBuildingImage(false);
          }
      }
  };

  return (
      <div className="space-y-6 pb-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center space-x-4">
                  <button 
                      onClick={() => navigate('/building')} 
                      className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
                  >
                      <ArrowLeft size={24}/>
                  </button>
                  <div>
                      <h1 className="text-xl md:text-2xl font-bold text-slate-800">{selectedBuilding.name}</h1>
                      <p className="text-slate-500 text-sm">Select a maintenance room to view details</p>
                  </div>
              </div>
              <button 
                  onClick={handleCreateRoom} 
                  className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 shadow-sm"
              >
                  <Plus size={18} className="mr-2" /> Add Room
              </button>
          </div>

          {/* Add Room Modal */}
          {isAddingRoom && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
                      <div className="flex justify-between items-center mb-4">
                          <h2 className="text-xl font-bold text-slate-800">Add New Room</h2>
                          <button 
                              onClick={handleCancelAddRoom}
                              className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                              <X size={20} />
                          </button>
                      </div>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Room Number <span className="text-red-500">*</span>
                              </label>
                              <input
                                  type="text"
                                  value={newRoomNumber}
                                  onChange={(e) => setNewRoomNumber(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="e.g. 101, A-201"
                                  autoFocus
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                          handleSaveNewRoom();
                                      }
                                  }}
                              />
                          </div>
                          
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Floor
                              </label>
                              <input
                                  type="text"
                                  value={newRoomFloor}
                                  onChange={(e) => setNewRoomFloor(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="e.g. 1st Floor, Ground Floor"
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                          handleSaveNewRoom();
                                      }
                                  }}
                              />
                          </div>
                          
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Description
                              </label>
                              <input
                                  type="text"
                                  value={newRoomDescription}
                                  onChange={(e) => setNewRoomDescription(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="e.g. Electrical Room, Storage"
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                          handleSaveNewRoom();
                                      }
                                  }}
                              />
                          </div>
                      </div>
                      
                      <div className="flex justify-end gap-3 mt-6">
                          <button
                              onClick={handleCancelAddRoom}
                              disabled={isSaving}
                              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
                          >
                              Cancel
                          </button>
                          <button
                              onClick={handleSaveNewRoom}
                              disabled={isSaving || !newRoomNumber.trim()}
                              className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              {isSaving ? 'Creating...' : 'Create Room'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col md:flex-row gap-6">
               <div 
                  className="w-full md:w-1/3 aspect-video bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative group"
                  onClick={() => selectedBuilding.buildingImage && !isUploadingBuildingImage && onSetFullScreenImage(selectedBuilding.buildingImage || null)}
               >
                   {selectedBuilding.buildingImage ? (
                       <>
                          {isUploadingBuildingImage && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                                  <div className="flex flex-col items-center">
                                      <RefreshCw className="animate-spin text-white mb-3" size={32} />
                                      <div className="w-full max-w-xs px-4">
                                          <div className="w-full bg-white/30 rounded-full h-2 mb-2">
                                              <div className="bg-white h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                          </div>
                                          <span className="text-sm text-white text-center block">Uploading image...</span>
                                      </div>
                                  </div>
                              </div>
                          )}
                          <img 
                              src={selectedBuilding.buildingImage} 
                              className={`w-full h-full object-cover ${selectedBuilding.buildingImage && !isUploadingBuildingImage ? 'cursor-zoom-in' : ''}`} 
                              alt="Building Exterior" 
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                       </>
                   ) : (
                       <>
                           {isUploadingBuildingImage ? (
                               <div className="flex flex-col items-center justify-center h-full">
                                   <RefreshCw className="animate-spin text-brand-600 mb-3" size={32} />
                                   <div className="w-full max-w-xs px-4">
                                       <div className="w-full bg-brand-200 rounded-full h-2 mb-2">
                                           <div className="bg-brand-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                       </div>
                                       <span className="text-sm text-brand-600 text-center block">Uploading image...</span>
                                   </div>
                               </div>
                           ) : (
                               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                   <BuildingIcon size={48} className="mb-2 opacity-50"/>
                                   <span className="text-sm">No Building Photo</span>
                               </div>
                           )}
                       </>
                   )}
                   <label 
                      className={`absolute bottom-2 right-2 bg-white/90 hover:bg-white text-slate-700 p-2 rounded-full cursor-pointer shadow-sm transition-colors ${isUploadingBuildingImage ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={e => e.stopPropagation()}
                   >
                       <Camera size={16} />
                       <input type="file" className="hidden" accept="image/*" onChange={handleBuildingImageUpload} disabled={isUploadingBuildingImage}/>
                   </label>
               </div>
               <div className="flex-1 space-y-4">
                   <div>
                      <h3 className="font-bold text-slate-800 text-lg">Building Details</h3>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                           <div className="bg-slate-50 p-3 rounded border border-slate-100">
                               <span className="text-xs text-slate-500 font-bold uppercase block">Code</span>
                               <span className="text-brand-700 font-mono font-bold">{selectedBuilding.code}</span>
                           </div>
                           <div className="bg-slate-50 p-3 rounded border border-slate-100">
                               <span className="text-xs text-slate-500 font-bold uppercase block">Total Rooms</span>
                               <span className="text-slate-800 font-bold">{selectedBuilding.maintenanceRooms.length}</span>
                           </div>
                           <div className="col-span-2">
                              <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Google Maps Link</label>
                              <div className="flex gap-2">
                                  <input 
                                      type="text" 
                                      value={selectedBuilding.googleMapsLink || ''} 
                                      onChange={(e) => onUpdateBuilding(selectedBuilding.code, { googleMapsLink: e.target.value })}
                                      className="flex-grow border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                      placeholder="https://maps.google.com/..."
                                  />
                                  {selectedBuilding.googleMapsLink && (
                                      <a 
                                          href={selectedBuilding.googleMapsLink} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="p-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 flex items-center justify-center"
                                      >
                                          <ExternalLink size={18} />
                                      </a>
                                  )}
                              </div>
                           </div>
                           <div 
                              onClick={() => navigate(`/building/${selectedBuilding.code}/floor-plans`)}
                              className="col-span-2 bg-brand-50 hover:bg-brand-100 p-3 rounded border border-brand-100 cursor-pointer transition-colors flex items-center justify-between group"
                           >
                               <div>
                                   <span className="text-xs text-brand-600 font-bold uppercase block">Floor Plans</span>
                                   <span className="text-brand-900 font-bold">{selectedBuilding.floorPlans.length} uploaded</span>
                               </div>
                               <ChevronRight className="text-brand-400 group-hover:text-brand-600" />
                           </div>
                      </div>
                   </div>
               </div>
          </div>

          {/* Filter Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                      <button
                          onClick={() => setShowFilters(!showFilters)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium transition-colors"
                      >
                          <Filter size={16} />
                          Filters
                          {hasActiveFilters && (
                              <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                  {selectedFloors.length + selectedDescriptions.length}
                              </span>
                          )}
                      </button>
                      {hasActiveFilters && (
                          <button
                              onClick={clearFilters}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
                          >
                              <X size={12} />
                              Clear all
                          </button>
                      )}
                  </div>
                  <span className="text-sm text-slate-500">
                      Showing {filteredRooms.length} of {selectedBuilding.maintenanceRooms.length} rooms
                  </span>
              </div>

              {showFilters && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                      {/* Floor Filter */}
                      <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                              Floor ({floorOptions.length} options)
                          </label>
                          <div className="max-h-40 overflow-y-auto space-y-1.5">
                              {floorOptions.length > 0 ? (
                                  floorOptions.map(floor => (
                                      <label
                                          key={floor}
                                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                                      >
                                          <input
                                              type="checkbox"
                                              checked={selectedFloors.includes(floor)}
                                              onChange={() => toggleFloor(floor)}
                                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                          />
                                          <span className="text-sm text-slate-700">{floor}</span>
                                          <span className="text-xs text-slate-400 ml-auto">
                                              ({selectedBuilding.maintenanceRooms.filter(r => r.Floor?.trim() === floor).length})
                                          </span>
                                      </label>
                                  ))
                              ) : (
                                  <p className="text-xs text-slate-400 italic">No floor data available</p>
                              )}
                          </div>
                      </div>

                      {/* Description Filter */}
                      <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                              Description ({descriptionOptions.length} options)
                          </label>
                          <div className="max-h-40 overflow-y-auto space-y-1.5">
                              {descriptionOptions.length > 0 ? (
                                  descriptionOptions.map(desc => (
                                      <label
                                          key={desc}
                                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                                      >
                                          <input
                                              type="checkbox"
                                              checked={selectedDescriptions.includes(desc)}
                                              onChange={() => toggleDescription(desc)}
                                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                          />
                                          <span className="text-sm text-slate-700">{desc}</span>
                                          <span className="text-xs text-slate-400 ml-auto">
                                              ({selectedBuilding.maintenanceRooms.filter(r => r.Description?.trim() === desc).length})
                                          </span>
                                      </label>
                                  ))
                              ) : (
                                  <p className="text-xs text-slate-400 italic">No description data available</p>
                              )}
                          </div>
                      </div>
                  </div>
              )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                              <th className="p-4 text-sm font-bold text-slate-600">Room #</th>
                              <th className="p-4 text-sm font-bold text-slate-600">Floor</th>
                              <th className="p-4 text-sm font-bold text-slate-600">Description</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredRooms.length > 0 ? (
                              filteredRooms.map(room => (
                                  <tr 
                                      key={room.id} 
                                      className="hover:bg-slate-50 group cursor-pointer" 
                                      onClick={() => navigate(`/building/${selectedBuilding.code}/room/${room.id}`)}
                                  >
                                      <td className="p-4 font-bold text-slate-700 flex items-center">
                                          <ChevronRight size={16} className="text-slate-300 mr-2 group-hover:text-brand-600 transition-colors" />
                                          {room.RoomNumber}
                                      </td>
                                      <td className="p-4 text-slate-600">{room.Floor || '—'}</td>
                                      <td className="p-4 text-slate-600">{room.Description || '—'}</td>
                                  </tr>
                              ))
                          ) : (
                              <tr>
                                  <td colSpan={3} className="p-8 text-center text-slate-400">
                                      No rooms match the selected filters
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
  );
};
