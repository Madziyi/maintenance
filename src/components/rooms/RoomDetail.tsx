import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Building as BuildingIcon, MapPin, Wrench, Camera, Plus, X, Pencil, ExternalLink, Image as ImageIcon, Map, RefreshCw, ChevronRight, Trash2, Share2, Upload } from 'lucide-react';
import { BuildingData, MaintenanceRoom } from '@/types';
import { api } from '@/api';
import { useToast } from '../common/Toast';

// Component to handle floor plan with proper marker positioning
const FloorPlanWithMarker: React.FC<{
  imageUrl: string;
  markerX?: number;
  markerY?: number;
  isEditing: boolean;
  onMapClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  onFullScreenClick: () => void;
}> = ({ imageUrl, markerX, markerY, isEditing, onMapClick, onFullScreenClick }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageBounds, setImageBounds] = useState<{
    displayWidth: number;
    displayHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    if (imgRef.current && containerRef.current) {
      const img = imgRef.current;
      const container = containerRef.current;
      
      const updateBounds = () => {
        const containerRect = container.getBoundingClientRect();
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        
        if (naturalWidth === 0 || naturalHeight === 0) return;
        
        const containerAspect = containerRect.width / containerRect.height;
        const imageAspect = naturalWidth / naturalHeight;
        
        let displayWidth: number;
        let displayHeight: number;
        let offsetX: number;
        let offsetY: number;
        
        if (containerAspect > imageAspect) {
          // Container is wider - image is letterboxed
          displayHeight = containerRect.height;
          displayWidth = containerRect.height * imageAspect;
          offsetX = (containerRect.width - displayWidth) / 2;
          offsetY = 0;
        } else {
          // Container is taller - image is pillarboxed
          displayWidth = containerRect.width;
          displayHeight = containerRect.width / imageAspect;
          offsetX = 0;
          offsetY = (containerRect.height - displayHeight) / 2;
        }
        
        setImageBounds({ displayWidth, displayHeight, offsetX, offsetY });
      };
      
      updateBounds();
      img.addEventListener('load', updateBounds);
      window.addEventListener('resize', updateBounds);
      return () => {
        img.removeEventListener('load', updateBounds);
        window.removeEventListener('resize', updateBounds);
      };
    }
  }, [imageUrl]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <img 
        ref={imgRef}
        src={imageUrl} 
        className={`w-full h-full object-contain ${
          isEditing ? 'cursor-pointer' : 'cursor-zoom-in'
        }`}
        onClick={(e) => {
          // Always call onFullScreenClick - it now handles both edit and view modes
          e.stopPropagation();
          onFullScreenClick();
        }}
        alt="Floor Plan"
      />
      {/* Pin - positioned relative to actual image content */}
      {(markerX !== undefined && markerY !== undefined && imageBounds) && (
        <div 
          className="absolute transform -translate-x-1/2 -translate-y-full drop-shadow-lg pointer-events-none z-10"
          style={{ 
            left: `${imageBounds.offsetX + (markerX / 100) * imageBounds.displayWidth}px`, 
            top: `${imageBounds.offsetY + (markerY / 100) * imageBounds.displayHeight}px` 
          }}
        >
          <MapPin size={32} fill="#2563eb" stroke="white" strokeWidth={2} />
        </div>
      )}
      
      {/* Helper Text overlay */}
      {isEditing && !markerX && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
            Click map to set location
          </div>
        </div>
      )}
    </div>
  );
};

interface RoomDetailProps {
  data: BuildingData[];
  onSaveRoom: (room: MaintenanceRoom, buildingCode: string) => Promise<MaintenanceRoom | null>;
  onSetFullScreenImage: (data: { imageUrl: string; markerX?: number; markerY?: number } | string | null) => void;
  onDeleteRoom: (roomId: string, buildingCode: string) => Promise<void>;
  canEdit: boolean;
}

export const RoomDetail: React.FC<RoomDetailProps> = ({
  data,
  onSaveRoom,
  onSetFullScreenImage,
  onDeleteRoom,
  canEdit,
}) => {
  const { code, id } = useParams<{ code: string; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  
  const selectedBuilding = useMemo(() => {
      return data.find(b => b.code === code) || null;
  }, [data, code]);

  const selectedRoom = useMemo(() => {
      if (!selectedBuilding || !id) return null;
      return selectedBuilding.maintenanceRooms.find(r => r.id === id) || null;
  }, [selectedBuilding, id]);

  const housedEquipment = useMemo(() => {
      if (!selectedBuilding || !selectedRoom) return [];
      const equipment = selectedBuilding.equipment.filter(
          eq => eq.room === selectedRoom.RoomNumber && eq.Location === selectedBuilding.code
      );
      
      // Sort alphabetically by Equipment name
      return equipment.sort((a, b) => 
        (a.accountingName || '').localeCompare(b.accountingName || '', undefined, { sensitivity: 'base' })
      );
  }, [selectedBuilding, selectedRoom]);

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
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  const [isDragOverImages, setIsDragOverImages] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedEquipmentId, setExpandedEquipmentId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fullScreenImageRef = useRef<{ imageUrl: string; markerX?: number; markerY?: number; isEditing?: boolean; onMapClick?: (x: number, y: number) => void } | null>(null);
  
  useEffect(() => {
      // Only reset form if we're not editing and the room ID actually changed
      if (selectedRoom && !isEditing && selectedRoom.id !== form.id) {
          setForm(selectedRoom);
      }
  }, [selectedRoom?.id, isEditing]);
  
  // Create a stable callback for map clicks that updates both form and fullscreen state
  const handleMapClickInFullscreen = useCallback((x: number, y: number) => {
    // Update the form with new coordinates
    setForm(prev => ({ ...prev, x, y }));
    // Also update the fullscreen image state so marker appears in real-time
    if (fullScreenImageRef.current) {
      const updated = {
        ...fullScreenImageRef.current,
        markerX: x,
        markerY: y
      };
      fullScreenImageRef.current = updated;
      onSetFullScreenImage(updated);
    }
  }, [onSetFullScreenImage]);
  
  const handleSave = async () => {
      if (!canEdit) return;
      setIsUploading(true);
      const savedRoom = await onSaveRoom(form, selectedBuilding.code);
      setIsUploading(false);
      setIsEditing(false);
      if (savedRoom && savedRoom.id !== form.id) {
          navigate(`/building/${selectedBuilding.code}/room/${savedRoom.id}`, { replace: true });
      }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/building/${selectedBuilding.code}/room/${selectedRoom.id}`;
    const title = `Room ${selectedRoom.RoomNumber} at ${selectedBuilding.name}`;
    const text = selectedRoom.Description || 'Maintenance room details';

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showToast('Room link copied to clipboard', 'success');
      } else {
        showToast('Sharing not supported in this browser', 'warning');
      }
    } catch (err: unknown) {
      // Ignore aborts, show error for others
      if ((err as Error)?.name !== 'AbortError') {
        showToast('Failed to share room link', 'error');
      }
    }
  };

  const uploadRoomImagesFromFiles = async (files: File[], inputElement?: HTMLInputElement | null) => {
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const tempIds = imageFiles.map((_, idx) => `temp-${Date.now()}-${idx}`);
      
      setUploadingImageIds(new Set(tempIds));
      setIsUploadingImage(true);
      
      try {
          const uploadPromises = imageFiles.map(async (file, idx) => {
              const tempId = tempIds[idx];
              try {
                  const url = await api.uploadFile(file);
                  setUploadingImageIds(prev => {
                      const next = new Set(prev);
                      next.delete(tempId);
                      return next;
                  });
                  return url;
              } catch (err) {
                  setUploadingImageIds(prev => {
                      const next = new Set(prev);
                      next.delete(tempId);
                      return next;
                  });
                  throw err;
              }
          });
          
          const urls = await Promise.all(uploadPromises);
          // Use functional update to ensure we have the latest form state
          setForm(prevForm => ({
              ...prevForm,
              roomImages: [...(prevForm.roomImages || []), ...urls]
          }));
          showToast("Images uploaded successfully", 'success');
      } catch (err) {
          showToast("Failed to upload some images. Please try again.", 'error');
      } finally {
          setIsUploadingImage(false);
          setUploadingImageIds(new Set());
          if (inputElement) {
              // Reset the input that was used
              inputElement.value = '';
              // Also reset the other input if it exists
              if (uploadInputRef.current && inputElement !== uploadInputRef.current) {
                  uploadInputRef.current.value = '';
              }
              if (cameraInputRef.current && inputElement !== cameraInputRef.current) {
                  cameraInputRef.current.value = '';
              }
          }
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const files = Array.from(e.target.files) as File[];
      const inputElement = e.target;
      await uploadRoomImagesFromFiles(files, inputElement);
  };

  const handleRoomImagesDrop = async (e: React.DragEvent) => {
      if (!isEditing || !canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverImages(false);
      const files = Array.from(e.dataTransfer.files || []) as File[];
      await uploadRoomImagesFromFiles(files, null);
  };

  const handleRoomImagesPaste = (e: React.ClipboardEvent) => {
      if (!isEditing || !canEdit || isUploadingImage) return;
      e.preventDefault();
      const files = (Array.from(e.clipboardData.files || []) as File[]).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;
      uploadRoomImagesFromFiles(files, null);
  };

  const handleImageDelete = async (imageUrl: string) => {
      await api.deleteImage(imageUrl);
      setForm({...form, roomImages: (form.roomImages || []).filter(img => img !== imageUrl)});
  };

  const handleMapClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isEditing || !form.floorPlanId) return;
    
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    
    // Get click position relative to the container
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Calculate actual image bounds (accounting for object-contain letterboxing/pillarboxing)
    const containerAspect = rect.width / rect.height;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const imageAspect = naturalWidth / naturalHeight;
    
    let imageDisplayWidth: number;
    let imageDisplayHeight: number;
    let imageOffsetX: number;
    let imageOffsetY: number;
    
    if (containerAspect > imageAspect) {
      // Container is wider - image is letterboxed (pillarboxed)
      imageDisplayHeight = rect.height;
      imageDisplayWidth = rect.height * imageAspect;
      imageOffsetX = (rect.width - imageDisplayWidth) / 2;
      imageOffsetY = 0;
    } else {
      // Container is taller - image is pillarboxed (letterboxed)
      imageDisplayWidth = rect.width;
      imageDisplayHeight = rect.width / imageAspect;
      imageOffsetX = 0;
      imageOffsetY = (rect.height - imageDisplayHeight) / 2;
    }
    
    // Check if click is within actual image bounds
    const relativeX = clickX - imageOffsetX;
    const relativeY = clickY - imageOffsetY;
    
    if (relativeX < 0 || relativeX > imageDisplayWidth || relativeY < 0 || relativeY > imageDisplayHeight) {
      // Click is outside image bounds (in grey area) - ignore it
      return;
    }
    
    // Calculate percentage relative to the actual image content (0-100)
    const x = (relativeX / imageDisplayWidth) * 100;
    const y = (relativeY / imageDisplayHeight) * 100;
    
    // Clamp to ensure values are within bounds
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    
    setForm({ ...form, x: clampedX, y: clampedY });
  };

  const linkedFloorPlan = selectedBuilding.floorPlans.find(fp => fp.id === form.floorPlanId);

  return (
      <div className="space-y-6 pb-20 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <button 
                onClick={() => {
                  // Prefer real history back (enables browser-like restoration).
                  const idx = (typeof window !== 'undefined' && (window.history.state?.idx as number | undefined)) ?? 0;
                  if (idx > 0) {
                    navigate(-1);
                    return;
                  }

                  const state = location.state as { from?: string; fromKey?: string } | null | undefined;
                  const from = state?.from;
                  const fromKey = state?.fromKey;

                  if (from) {
                    navigate(from, { state: fromKey ? { restoreKey: fromKey } : undefined });
                    return;
                  }

                  // Fallback to building
                  navigate(`/building/${selectedBuilding.code}`);
                }} 
                className="flex items-center text-slate-500 hover:text-brand-600 transition-colors font-medium"
            >
                <ArrowLeft size={20} className="mr-1" /> Back
            </button>
            <div className="flex space-x-2 self-end sm:self-auto">
                <button 
                    onClick={handleShare} 
                    className="flex items-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium"
                >
                    <Share2 size={16} className="mr-2" /> Share
                </button>
                {canEdit && !isEditing && (
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
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Access Key</label>
                              <div className="text-slate-700">
                                {form.KeyAccess && String(form.KeyAccess).trim() !== '' ? form.KeyAccess : 'Probably DG/DB'}
                              </div>
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
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                          <Wrench size={18} className="mr-2 text-brand-500"/> Housed Equipment
                      </h3>
                      {housedEquipment.length > 0 ? (
                          <div className="space-y-2">
                              {housedEquipment.map((eq) => {
                                  const isExpanded = expandedEquipmentId === eq.id;
                                  const images = eq.images || [];

                                  return (
                                      <div
                                          key={eq.id}
                                          onClick={() => navigate(`/equipment/${eq.id}`, { 
                                            state: { 
                                              from: `${location.pathname}${location.search}`,
                                              fromKey: location.key
                                            } 
                                          })}
                                          className="p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors cursor-pointer"
                                      >
                                          <div className="flex items-start justify-between gap-3">
                                              <div className="flex-1 min-w-0">
                                                  <div className="font-semibold text-slate-800 hover:text-brand-600 transition-colors truncate">
                                                      {eq.accountingName}
                                                  </div>
                                                  {eq.description && (
                                                      <div className="text-sm text-slate-600 mt-1 line-clamp-2">
                                                          {eq.description}
                                                      </div>
                                                  )}
                                              </div>
                                              <button
                                                  type="button"
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      setExpandedEquipmentId(prev => prev === eq.id ? null : eq.id);
                                                  }}
                                                  aria-expanded={isExpanded}
                                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                              >
                                                  <ChevronRight
                                                      size={18}
                                                      className={`transition-transform ${isExpanded ? 'rotate-90 text-brand-600' : 'text-slate-300'}`}
                                                  />
                                              </button>
                                          </div>

                                          {isExpanded && (
                                              <div className="mt-3">
                                                  <div className="text-xs font-semibold text-slate-600 mb-1.5">
                                                      Equipment photos ({images.length})
                                                  </div>
                                                  {images.length === 0 ? (
                                                      <div className="text-xs text-slate-500">
                                                          No photos yet for this equipment.
                                                      </div>
                                                  ) : (
                                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                                          {images.map((url, idx) => (
                                                              <button
                                                                  key={url || idx}
                                                                  type="button"
                                                                  onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      onSetFullScreenImage(url);
                                                                  }}
                                                                  className="flex-shrink-0"
                                                              >
                                                                  <img
                                                                      src={url}
                                                                      alt={`Equipment ${eq.accountingName} ${idx + 1}`}
                                                                      loading="lazy"
                                                                      className="h-28 w-28 rounded-md object-cover border border-slate-200"
                                                                  />
                                                              </button>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      ) : (
                          <div className="text-slate-500 text-sm py-4">No equipment found in this room.</div>
                      )}
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                       <div className="flex justify-between items-center mb-4">
                           <h3 className="font-bold text-slate-800 flex items-center">
                               <MapPin size={18} className="mr-2 text-brand-500"/> Floor Plan Location
                           </h3>
                           {isEditing && canEdit && (
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
                       
                       <div 
                           className={`bg-slate-50 border border-slate-200 rounded-lg aspect-video flex items-center justify-center overflow-hidden relative group ${
                               isEditing && linkedFloorPlan ? 'cursor-pointer' : ''
                           }`}
                           onClick={(e) => {
                               // In edit mode, clicking the container opens fullscreen
                               if (isEditing && canEdit && linkedFloorPlan) {
                                   e.stopPropagation(); // Prevent any parent handlers
                                   onSetFullScreenImage({
                                       imageUrl: linkedFloorPlan.imageUrl,
                                       markerX: form.x !== undefined ? form.x : undefined,
                                       markerY: form.y !== undefined ? form.y : undefined,
                                       isEditing: true,
                                       onMapClick: (x: number, y: number) => {
                                           // Update the form with new coordinates
                                           setForm({ ...form, x, y });
                                       }
                                   });
                               }
                           }}
                       >
                           {linkedFloorPlan ? (
                               <FloorPlanWithMarker
                                 imageUrl={linkedFloorPlan.imageUrl}
                                 markerX={form.x}
                                 markerY={form.y}
                                 isEditing={isEditing}
                                 onMapClick={handleMapClick}
                                 onFullScreenClick={() => {
                                   // Handle both edit and view modes
                                   if (linkedFloorPlan) {
                                       if (isEditing && canEdit) {
                                           // In edit mode, open fullscreen with edit capabilities
                                           const fullScreenData = {
                                               imageUrl: linkedFloorPlan.imageUrl,
                                               markerX: form.x !== undefined ? form.x : undefined,
                                               markerY: form.y !== undefined ? form.y : undefined,
                                               isEditing: true,
                                               onMapClick: handleMapClickInFullscreen
                                           };
                                           fullScreenImageRef.current = fullScreenData;
                                           onSetFullScreenImage(fullScreenData);
                                       } else {
                                           // In view mode, just open fullscreen
                                           onSetFullScreenImage({
                                               imageUrl: linkedFloorPlan.imageUrl,
                                               markerX: form.x !== undefined ? form.x : undefined,
                                               markerY: form.y !== undefined ? form.y : undefined
                                           });
                                       }
                                   }
                                 }}
                               />
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
                          <ImageIcon size={18} className="mr-2 text-brand-500"/> Room Interior
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                          {(form.roomImages || []).map((img, idx) => (
                              <div key={idx} className="relative rounded-lg overflow-hidden aspect-video border border-slate-200 group cursor-zoom-in" onClick={() => onSetFullScreenImage(img)}>
                                  <img src={img} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" alt={`Room interior ${idx + 1}`} />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                  {isEditing && (
                                      <button 
                                          onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleImageDelete(img); 
                                          }} 
                                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
                                      >
                                          <X size={12}/>
                                      </button>
                                  )}
                              </div>
                          ))}
                          
                          {/* Uploading Placeholders */}
                          {Array.from(uploadingImageIds).map((tempId) => (
                              <div key={tempId} className="relative rounded-lg overflow-hidden aspect-video border-2 border-dashed border-brand-300 bg-brand-50 flex items-center justify-center">
                                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                      <RefreshCw className="animate-spin text-brand-600 mb-3" size={32} />
                                      <div className="w-full max-w-xs">
                                          <div className="w-full bg-brand-200 rounded-full h-2 mb-2">
                                              <div className="bg-brand-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                          </div>
                                          <span className="text-sm text-brand-600 text-center block">Uploading image...</span>
                                      </div>
                                  </div>
                              </div>
                          ))}
                          
                          {isEditing && canEdit && (
                              <div
                                className="flex gap-2"
                                tabIndex={0}
                                onDragOver={(e) => {
                                  if (!isEditing || !canEdit) return;
                                  e.preventDefault();
                                  setIsDragOverImages(true);
                                }}
                                onDragLeave={() => setIsDragOverImages(false)}
                                onDrop={handleRoomImagesDrop}
                                onPaste={handleRoomImagesPaste}
                              >
                                  <label className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center aspect-video cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''} ${isDragOverImages ? 'border-brand-400 bg-brand-50' : 'border-slate-300'}`}>
                                      {isUploadingImage ? (
                                          <RefreshCw className="animate-spin text-slate-400"/>
                                      ) : (
                                          <Upload size={24} className="text-slate-400" />
                                      )}
                                      <span className="text-sm text-slate-500 mt-2">
                                          {isUploadingImage ? 'Uploading...' : 'Upload / Drag & Drop / Paste'}
                                      </span>
                                      <input 
                                          ref={uploadInputRef}
                                          type="file" 
                                          className="hidden" 
                                          accept="image/*" 
                                          onChange={handleImageUpload} 
                                          multiple
                                          disabled={isUploadingImage}
                                      />
                                  </label>
                                  <label className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center aspect-video cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''} ${isDragOverImages ? 'border-brand-400 bg-brand-50' : 'border-slate-300'}`}>
                                      {isUploadingImage ? (
                                          <RefreshCw className="animate-spin text-slate-400"/>
                                      ) : (
                                          <Camera size={24} className="text-slate-400" />
                                      )}
                                      <span className="text-sm text-slate-500 mt-2">
                                          {isUploadingImage ? 'Uploading...' : 'Take Photo'}
                                      </span>
                                      <input 
                                          ref={cameraInputRef}
                                          type="file" 
                                          className="hidden" 
                                          accept="image/*" 
                                          capture="environment"
                                          onChange={handleImageUpload} 
                                          multiple
                                          disabled={isUploadingImage}
                                      />
                                  </label>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
          
          {/* Cancel, Save, and Delete buttons at bottom */}
          {canEdit && isEditing && (
              <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                  <div className="flex flex-col sm:flex-row gap-3 order-1 sm:order-2 w-full sm:w-auto">
                      <button 
                          onClick={() => { setForm(selectedRoom); setIsEditing(false); }} 
                          className="flex items-center justify-center px-6 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors w-full sm:w-auto"
                      >
                          Cancel
                      </button>
                      <button 
                          disabled={isUploading} 
                          onClick={handleSave} 
                          className="flex items-center justify-center px-6 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors w-full sm:w-auto"
                      >
                          {isUploading ? "Saving..." : "Save"}
                      </button>
                  </div>
                  <button 
                      onClick={async () => {
                          setIsDeleting(true);
                          try {
                              await onDeleteRoom(form.id, selectedBuilding.code);
                          } finally {
                              setIsDeleting(false);
                          }
                      }}
                      disabled={isUploading || isDeleting}
                      className="flex items-center justify-center px-6 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  >
                      {isDeleting ? (
                          <RefreshCw size={18} className="mr-2 animate-spin" />
                      ) : (
                          <Trash2 size={18} className="mr-2" />
                      )}
                      {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
              </div>
          )}
      </div>
  );
};
