import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Building as BuildingIcon, MapPin, Wrench, Camera, Plus, X, Pencil, ExternalLink, Image as ImageIcon, Map, RefreshCw } from 'lucide-react';
import { BuildingData, MaintenanceRoom } from '@/types';
import { api } from '@/api';
import { FullscreenPanoramaViewer } from '../common/FullscreenPanoramaViewer';

interface RoomDetailProps {
  data: BuildingData[];
  onSaveRoom: (room: MaintenanceRoom, buildingCode: string) => Promise<MaintenanceRoom | null>;
  onSetFullScreenImage: (url: string | null) => void;
}

export const RoomDetail: React.FC<RoomDetailProps> = ({
  data,
  onSaveRoom,
  onSetFullScreenImage
}) => {
  const { code, id } = useParams<{ code: string; id: string }>();
  const navigate = useNavigate();
  
  const selectedBuilding = useMemo(() => {
      return data.find(b => b.code === code) || null;
  }, [data, code]);

  const selectedRoom = useMemo(() => {
      if (!selectedBuilding || !id) return null;
      return selectedBuilding.maintenanceRooms.find(r => r.id === id) || null;
  }, [selectedBuilding, id]);

  if (!selectedRoom || !selectedBuilding) {
      if (code) {
          return <Navigate to={`/building/${code}`} replace />;
      }
      return <Navigate to="/building" replace />;
  }
  
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(selectedRoom);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [show360Viewer, setShow360Viewer] = useState(false);
  
  useEffect(() => {
      if (selectedRoom) {
          setForm(selectedRoom);
      }
  }, [selectedRoom]);
  
  const handleSave = async () => {
      setIsUploading(true);
      const savedRoom = await onSaveRoom(form, selectedBuilding.code);
      setIsUploading(false);
      setIsEditing(false);
      if (savedRoom && savedRoom.id !== form.id) {
          navigate(`/building/${selectedBuilding.code}/room/${savedRoom.id}`, { replace: true });
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setIsUploadingImage(true);
          try {
              const oldImageUrl = form.roomImage;
              const url = await api.uploadFile(e.target.files[0], oldImageUrl);
              setForm({...form, roomImage: url});
          } catch (e) { 
              alert("Upload failed"); 
          } finally {
              setIsUploadingImage(false);
          }
      }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing || !form.floorPlanId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setForm({ ...form, x, y });
  };

  const linkedFloorPlan = selectedBuilding.floorPlans.find(fp => fp.id === form.floorPlanId);

  return (
      <div className="space-y-6 pb-20 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <button 
                onClick={() => navigate(`/building/${selectedBuilding.code}`)} 
                className="flex items-center text-slate-500 hover:text-brand-600 transition-colors font-medium"
            >
                <ArrowLeft size={20} className="mr-1" /> Back to {selectedBuilding.name}
            </button>
            <div className="flex space-x-2 self-end sm:self-auto">
                {isEditing ? (
                    <>
                        <button 
                            onClick={() => { setForm(selectedRoom); setIsEditing(false); }} 
                            className="flex items-center px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            disabled={isUploading} 
                            onClick={handleSave} 
                            className="flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium disabled:opacity-50"
                        >
                            {isUploading ? "Saving..." : "Save"}
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={() => setIsEditing(true)} 
                        className="flex items-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium"
                    >
                        <Pencil size={16} className="mr-2" /> Edit
                    </button>
                )}
            </div>
          </div>

          {/* Building Context Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row gap-6 items-center">
              <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                   {selectedBuilding.buildingImage ? (
                       <img src={selectedBuilding.buildingImage} className="w-full h-full object-cover" alt="Building" />
                   ) : (
                       <div className="w-full h-full flex items-center justify-center text-slate-300">
                           <BuildingIcon size={32}/>
                       </div>
                   )}
              </div>
              <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-800">{selectedBuilding.name} ({selectedBuilding.code})</h2>
              </div>
              {selectedBuilding.googleMapsLink && (
                  <a 
                      href={selectedBuilding.googleMapsLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium whitespace-nowrap"
                  >
                      <MapPin size={18} />
                      View on Maps
                      <ExternalLink size={16} />
                  </a>
              )}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Form & Floor Plan */}
              <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                          <Wrench size={18} className="mr-2 text-brand-500"/> Room Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Room Number</label>
                              {isEditing ? (
                                  <input 
                                      value={form.RoomNumber} 
                                      onChange={e => setForm({...form, RoomNumber: e.target.value})} 
                                      className="border rounded p-2 w-full"
                                  />
                              ) : (
                                  <div className="text-lg font-bold text-slate-800">{form.RoomNumber}</div>
                              )}
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Floor</label>
                              {isEditing ? (
                                  <input 
                                      value={form.Floor} 
                                      onChange={e => setForm({...form, Floor: e.target.value})} 
                                      className="border rounded p-2 w-full"
                                  />
                              ) : (
                                  <div className="text-lg text-slate-700">{form.Floor}</div>
                              )}
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                              {isEditing ? (
                                  <input 
                                      value={form.Description} 
                                      onChange={e => setForm({...form, Description: e.target.value})} 
                                      className="border rounded p-2 w-full"
                                  />
                              ) : (
                                  <div className="text-slate-700">{form.Description}</div>
                              )}
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
                              {isEditing ? (
                                  <textarea 
                                      value={form.Notes || ''} 
                                      onChange={e => setForm({...form, Notes: e.target.value})} 
                                      className="border rounded p-2 w-full min-h-[100px] resize-y"
                                      placeholder="Add notes about this room..."
                                  />
                              ) : (
                                  <div className="text-slate-700 whitespace-pre-wrap">{form.Notes || 'No notes'}</div>
                              )}
                          </div>
                      </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                       <div className="flex justify-between items-center mb-4">
                           <h3 className="font-bold text-slate-800 flex items-center">
                               <MapPin size={18} className="mr-2 text-brand-500"/> Floor Plan Location
                           </h3>
                           {isEditing && (
                               <select 
                                    className="text-sm border rounded p-1"
                                    value={form.floorPlanId || ''}
                                    onChange={e => setForm({...form, floorPlanId: e.target.value || undefined})}
                               >
                                   <option value="">Select Floor Plan...</option>
                                   {selectedBuilding.floorPlans.map(fp => (
                                       <option key={fp.id} value={fp.id}>{fp.name}</option>
                                   ))}
                               </select>
                           )}
                       </div>
                       
                       <div className="bg-slate-50 border border-slate-200 rounded-lg aspect-video flex items-center justify-center overflow-hidden relative group">
                           {linkedFloorPlan ? (
                               <div className="relative w-full h-full" onClick={handleMapClick}>
                                  <img 
                                    src={linkedFloorPlan.imageUrl} 
                                    className={`w-full h-full object-contain ${isEditing ? 'cursor-crosshair' : 'cursor-zoom-in'}`}
                                    onClick={() => !isEditing && onSetFullScreenImage(linkedFloorPlan.imageUrl)}
                                    alt="Floor Plan"
                                  />
                                  {/* Pin */}
                                  {(form.x !== undefined && form.y !== undefined) && (
                                      <div 
                                        className="absolute transform -translate-x-1/2 -translate-y-full text-brand-600 drop-shadow-md pointer-events-none"
                                        style={{ left: `${form.x}%`, top: `${form.y}%` }}
                                      >
                                          <MapPin size={32} fill="currentColor" />
                                      </div>
                                  )}
                                  
                                  {/* Helper Text overlay */}
                                  {isEditing && !form.x && (
                                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                          <div className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                                              Click map to set location
                                          </div>
                                      </div>
                                  )}
                               </div>
                           ) : (
                               <div className="text-center text-slate-400">
                                   <Map size={48} className="mx-auto mb-2 opacity-50"/>
                                   <p>No Floor Plan Linked</p>
                               </div>
                           )}
                       </div>
                  </div>
              </div>

              {/* Right Column: Photos */}
              <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                          <ImageIcon size={18} className="mr-2 text-brand-500"/> Room Panorama
                      </h3>
                      <div className="relative aspect-video bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden group">
                           {form.roomImage ? (
                               <>
                                {isUploadingImage && (
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
                                    src={form.roomImage} 
                                    className="w-full h-full object-cover cursor-zoom-in" 
                                    onClick={() => onSetFullScreenImage(form.roomImage || null)} 
                                    alt="Room Panorama" 
                                />
                                {isEditing && !isUploadingImage && (
                                    <>
                                        <label className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors opacity-0 group-hover:opacity-100 bg-black/0">
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploadingImage}/>
                                            <div className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-slate-600 shadow-sm flex items-center">
                                                <Camera size={12} className="mr-1"/> Replace
                                            </div>
                                        </label>
                                        <button 
                                            onClick={async (e) => { 
                                                e.stopPropagation(); 
                                                if (form.roomImage) {
                                                    await api.deleteImage(form.roomImage);
                                                }
                                                setForm({...form, roomImage: undefined});
                                            }} 
                                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 z-10"
                                        >
                                            <X size={14}/>
                                        </button>
                                    </>
                                )}
                               </>
                           ) : (
                               <>
                                   {isUploadingImage ? (
                                       <div className="flex flex-col items-center w-full h-full justify-center p-4">
                                           <RefreshCw className="animate-spin text-brand-600 mb-3" size={32} />
                                           <div className="w-full max-w-xs px-4">
                                               <div className="w-full bg-brand-200 rounded-full h-2 mb-2">
                                                   <div className="bg-brand-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                               </div>
                                               <span className="text-sm text-brand-600 text-center block">Uploading image...</span>
                                           </div>
                                       </div>
                                   ) : (
                                       <div className="text-center p-4">
                                           <Camera className="text-slate-400 mx-auto mb-2" size={32} />
                                           <span className="text-xs text-slate-500 block">No panorama photo</span>
                                       </div>
                                   )}
                               </>
                           )}
                           {isEditing && !form.roomImage && !isUploadingImage && (
                                <label className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors">
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploadingImage}/>
                                    <div className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-slate-600 shadow-sm flex items-center">
                                        <Plus size={12} className="mr-1"/> Add
                                    </div>
                                </label>
                           )}
                      </div>
                      
                      {/* View in 360 Button - Only show when image exists and not uploading */}
                      {form.roomImage && !isUploadingImage && (
                        <button
                          onClick={() => setShow360Viewer(true)}
                          className="mt-4 w-full bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <ImageIcon size={18} />
                          View in 360°
                        </button>
                      )}
                  </div>
              </div>
          </div>
          
          {/* Fullscreen 360 Viewer */}
          {show360Viewer && form.roomImage && (
            <FullscreenPanoramaViewer
              imageUrl={form.roomImage}
              onClose={() => setShow360Viewer(false)}
            />
          )}
      </div>
  );
};
