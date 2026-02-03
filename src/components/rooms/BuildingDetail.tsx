import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Building as BuildingIcon, Camera, Plus, ChevronRight, ExternalLink, X, Filter, RefreshCw, Share2, Wrench, Layers, FileText, Info, ChevronDown, Upload, Copy } from 'lucide-react';
import { BuildingData, Equipment } from '@/types';
import { MaintenanceRoom } from '@/types';
import { api } from '@/api';
import { useToast } from '../common/Toast';

const STATUS_PILLS: Record<string, { label: string; className: string }> = {
  OPERATING: {
    label: "Operating",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  INACTIVE: {
    label: "Inactive",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  REMOVED: {
    label: "Deleted",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
  UNKNOWN: {
    label: "Unknown",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  REPAIR: {
    label: "Repair",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
  "ON-SHELF": {
    label: "On-Shelf",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  },
};

function getStatusPill(status: string | null | undefined) {
  const raw = (status || 'UNKNOWN').toString();
  const key = raw === 'ONSHELF' ? 'ON-SHELF' : raw;
  return STATUS_PILLS[key] || STATUS_PILLS.UNKNOWN;
}

interface BuildingDetailProps {
  data: BuildingData[];
  onUpdateBuilding: (buildingCode: string, updates: Partial<BuildingData>) => Promise<void>;
  onSetFullScreenImage: (url: string | null) => void;
  onSaveRoom: (room: MaintenanceRoom, buildingCode: string) => Promise<MaintenanceRoom | null>;
  onSaveEquipment: (equipment: Equipment) => Promise<void>;
  canEdit: boolean;
}

export const BuildingDetail: React.FC<BuildingDetailProps> = ({
  data,
  onUpdateBuilding,
  onSetFullScreenImage,
  onSaveRoom,
  onSaveEquipment,
  canEdit,
}) => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  
  const selectedBuilding = useMemo(() => {
      return data.find(b => b.code === code) || null;
  }, [data, code]);

  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBuildingImage, setIsUploadingBuildingImage] = useState(false);
  
  // Equipment form state
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentScadaName, setNewEquipmentScadaName] = useState('');
  const [newEquipmentDesc, setNewEquipmentDesc] = useState('');
  const [newEquipmentRoom, setNewEquipmentRoom] = useState('');
  const [newEquipmentManufacturer, setNewEquipmentManufacturer] = useState('');
  const [newEquipmentVendor, setNewEquipmentVendor] = useState('');
  const [newEquipmentSerialNum, setNewEquipmentSerialNum] = useState('');
  const [newEquipmentNotes, setNewEquipmentNotes] = useState('');
  const [newEquipmentStatus, setNewEquipmentStatus] = useState<
    'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'REMOVED' | 'UNKNOWN'
  >('UNKNOWN');
  const [newEquipmentImages, setNewEquipmentImages] = useState<string[]>([]);
  const [isSavingEquipment, setIsSavingEquipment] = useState(false);
  const [isUploadingEquipmentImages, setIsUploadingEquipmentImages] = useState(false);
  const [uploadingEquipmentImageIds, setUploadingEquipmentImageIds] = useState<Set<string>>(new Set());
  const [isDragOverEquipmentImages, setIsDragOverEquipmentImages] = useState(false);
  const equipmentUploadInputRef = useRef<HTMLInputElement>(null);
  const equipmentCameraInputRef = useRef<HTMLInputElement>(null);

  // Accordion state for quick-view rows
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [expandedEquipmentId, setExpandedEquipmentId] = useState<string | null>(null);
  
  // Room filter state
  const [showFloorFilter, setShowFloorFilter] = useState(false);
  const [showDescriptionFilter, setShowDescriptionFilter] = useState(false);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>([]);
  
  // Equipment filter state
  const [showEquipmentDescriptionFilter, setShowEquipmentDescriptionFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedEquipmentDescriptions, setSelectedEquipmentDescriptions] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  
  // Refs for dropdowns
  const floorDropdownRef = useRef<HTMLDivElement>(null);
  const descriptionDropdownRef = useRef<HTMLDivElement>(null);
  const equipmentDescriptionDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (floorDropdownRef.current && !floorDropdownRef.current.contains(event.target as Node)) {
        setShowFloorFilter(false);
      }
      if (descriptionDropdownRef.current && !descriptionDropdownRef.current.contains(event.target as Node)) {
        setShowDescriptionFilter(false);
      }
      if (equipmentDescriptionDropdownRef.current && !equipmentDescriptionDropdownRef.current.contains(event.target as Node)) {
        setShowEquipmentDescriptionFilter(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const removeFloor = (floor: string) => {
      toggleFloor(floor);
  };

  const removeDescription = (desc: string) => {
      toggleDescription(desc);
  };

  const hasActiveFilters = selectedFloors.length > 0 || selectedDescriptions.length > 0;
  
  // Equipment filter options
  const equipmentDescriptionOptions = useMemo(() => {
    const descriptions = selectedBuilding.equipment
      .map(e => e.description?.trim())
      .filter(d => d && d !== '')
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort();
    return descriptions;
  }, [selectedBuilding.equipment]);
  
  const statusOptions: Array<'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'REMOVED' | 'UNKNOWN'> = [
    'INACTIVE',
    'ONSHELF',
    'OPERATING',
    'REPAIR',
    'REMOVED',
    'UNKNOWN',
  ];
  
  const statusOptionsWithCounts = useMemo(() => {
    return statusOptions.map(status => ({
      value: status,
      count: selectedBuilding.equipment.filter(e => (e.status || 'UNKNOWN') === status).length
    }));
  }, [selectedBuilding.equipment]);
  
  // Filtered equipment
  const filteredEquipment = useMemo(() => {
    const filtered = selectedBuilding.equipment.filter(eq => {
      const eqDesc = eq.description?.trim() || '';
      const eqStatus = eq.status || 'UNKNOWN';
      
      const descMatch = selectedEquipmentDescriptions.length === 0 ||
        selectedEquipmentDescriptions.includes(eqDesc);
      
      const statusMatch = selectedStatuses.length === 0 ||
        selectedStatuses.includes(eqStatus);
      
      return descMatch && statusMatch;
    });
    
    // Sort alphabetically by Equipment name
    return filtered.sort((a, b) => 
      (a.accountingName || '').localeCompare(b.accountingName || '', undefined, { sensitivity: 'base' })
    );
  }, [selectedBuilding.equipment, selectedEquipmentDescriptions, selectedStatuses]);
  
  // Toggle equipment filter selection
  const toggleEquipmentDescription = (desc: string) => {
    setSelectedEquipmentDescriptions(prev =>
      prev.includes(desc)
        ? prev.filter(d => d !== desc)
        : [...prev, desc]
    );
  };
  
  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };
  
  const clearEquipmentFilters = () => {
    setSelectedEquipmentDescriptions([]);
    setSelectedStatuses([]);
  };
  
  const removeEquipmentDescription = (desc: string) => {
    toggleEquipmentDescription(desc);
  };
  
  const removeStatus = (status: string) => {
    toggleStatus(status);
  };
  
  const hasActiveEquipmentFilters = selectedEquipmentDescriptions.length > 0 || selectedStatuses.length > 0;

  const handleCreateRoom = () => {
      if (!canEdit) return;
      setIsAddingRoom(true);
  };

  const handleCreateEquipment = (equipmentToDuplicate?: Equipment) => {
      if (!canEdit) return;
      if (equipmentToDuplicate) {
          // Pre-fill form with equipment data (excluding images)
          setNewEquipmentName(equipmentToDuplicate.accountingName || '');
          setNewEquipmentScadaName(equipmentToDuplicate.scadaName || '');
          setNewEquipmentDesc(equipmentToDuplicate.description || '');
          setNewEquipmentRoom(equipmentToDuplicate.room || '');
          setNewEquipmentManufacturer(equipmentToDuplicate.manufacturer || '');
          setNewEquipmentVendor(equipmentToDuplicate.vendor || '');
          setNewEquipmentSerialNum(equipmentToDuplicate.serialNum || '');
          setNewEquipmentNotes(equipmentToDuplicate.notes || '');
          setNewEquipmentStatus(equipmentToDuplicate.status || 'UNKNOWN');
          setNewEquipmentImages([]); // Don't copy images
      } else {
          // Reset form for new equipment
          setNewEquipmentName('');
          setNewEquipmentScadaName('');
          setNewEquipmentDesc('');
          setNewEquipmentRoom('');
          setNewEquipmentManufacturer('');
          setNewEquipmentVendor('');
          setNewEquipmentSerialNum('');
          setNewEquipmentNotes('');
          setNewEquipmentStatus('UNKNOWN');
          setNewEquipmentImages([]);
      }
      setIsAddingEquipment(true);
  };

  const handleShareBuilding = async () => {
      if (!selectedBuilding) return;

      const url = `${window.location.origin}/building/${selectedBuilding.code}`;
      const title = selectedBuilding.name;
      const text = `Maintenance rooms for ${selectedBuilding.name} (${selectedBuilding.code})`;

      try {
          if (navigator.share) {
              await navigator.share({ title, text, url });
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(url);
              showToast('Building link copied to clipboard', 'success');
          } else {
              showToast('Sharing not supported in this browser', 'warning');
          }
      } catch (err: unknown) {
          if ((err as Error)?.name !== 'AbortError') {
              showToast('Failed to share building link', 'error');
          }
      }
  };

  const handleSaveNewRoom = async () => {
      if (!newRoomNumber.trim()) {
          showToast("Room number is required", 'warning');
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
              navigate(`/building/${selectedBuilding.code}/room/${savedRoom.id}`, { 
                state: { 
                  from: `${location.pathname}${location.search}`,
                  fromKey: location.key
                } 
              });
              showToast("Room created successfully", 'success');
          }
      } catch (error) {
          showToast("Failed to create room. Please try again.", 'error');
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

  const handleSaveNewEquipment = async () => {
      if (!newEquipmentName.trim()) {
          showToast("Equipment name is required", 'warning');
          return;
      }
      
      setIsSavingEquipment(true);
      try {
          const newEq: Equipment = {
              id: `EQ-NEW-${Date.now()}`,
              accountingName: newEquipmentName.trim(),
              previousAccountingName: null,
              scadaName: newEquipmentScadaName.trim() || null,

              description: newEquipmentDesc.trim(),
              notes: newEquipmentNotes.trim(),
              Location: selectedBuilding.code,
              LocationDesc: selectedBuilding.name,
              room: newEquipmentRoom || '',
              KeyAccess: '',
              AssetTag: '',
              serialNum: newEquipmentSerialNum.trim(),
              manufacturer: newEquipmentManufacturer.trim(),
              Model: '',
              vendor: newEquipmentVendor.trim(),
              PurchaseDate: '',
              WarrantyDate: '',
              images: newEquipmentImages,
              status: newEquipmentStatus
          };
          
          await onSaveEquipment(newEq);
          
          // Reset form and stay on building detail page
          setIsAddingEquipment(false);
          setNewEquipmentName('');
          setNewEquipmentScadaName('');
          setNewEquipmentDesc('');
          setNewEquipmentRoom('');
          setNewEquipmentManufacturer('');
          setNewEquipmentVendor('');
          setNewEquipmentSerialNum('');
          setNewEquipmentNotes('');
          setNewEquipmentStatus('UNKNOWN');
          setNewEquipmentImages([]);
          setUploadingEquipmentImageIds(new Set());
          showToast("Equipment created successfully", 'success');
      } catch (error) {
          showToast("Failed to create equipment. Please try again.", 'error');
      } finally {
          setIsSavingEquipment(false);
      }
  };

  const handleCancelAddEquipment = async () => {
      // Delete any uploaded images that weren't saved
      if (newEquipmentImages.length > 0) {
          try {
              await Promise.all(newEquipmentImages.map(img => api.deleteImage(img)));
          } catch (err) {
              console.error('Failed to delete unsaved images:', err);
          }
      }
      
      setIsAddingEquipment(false);
      setNewEquipmentName('');
      setNewEquipmentDesc('');
      setNewEquipmentRoom('');
      setNewEquipmentManufacturer('');
      setNewEquipmentVendor('');
      setNewEquipmentSerialNum('');
      setNewEquipmentNotes('');
      setNewEquipmentStatus('UNKNOWN');
      setNewEquipmentImages([]);
      setUploadingEquipmentImageIds(new Set());
  };

  const uploadEquipmentPhotosFromFiles = async (files: File[], inputElement?: HTMLInputElement | null) => {
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const tempIds = imageFiles.map((_, idx) => `temp-${Date.now()}-${idx}`);
      
      setUploadingEquipmentImageIds(new Set(tempIds));
      setIsUploadingEquipmentImages(true);
      
      try {
          const uploadPromises = imageFiles.map(async (file, idx) => {
              const tempId = tempIds[idx];
              try {
                  const url = await api.uploadFile(file);
                  setUploadingEquipmentImageIds(prev => {
                      const next = new Set(prev);
                      next.delete(tempId);
                      return next;
                  });
                  return url;
              } catch (err) {
                  setUploadingEquipmentImageIds(prev => {
                      const next = new Set(prev);
                      next.delete(tempId);
                      return next;
                  });
                  throw err;
              }
          });
          
          const urls = await Promise.all(uploadPromises);
          setNewEquipmentImages(prev => [...prev, ...urls]);
      } catch (err) {
          showToast("Failed to upload some images. Please try again.", 'error');
      } finally {
          setIsUploadingEquipmentImages(false);
          setUploadingEquipmentImageIds(new Set());
          if (inputElement) {
              inputElement.value = '';
              if (equipmentUploadInputRef.current && inputElement !== equipmentUploadInputRef.current) {
                  equipmentUploadInputRef.current.value = '';
              }
              if (equipmentCameraInputRef.current && inputElement !== equipmentCameraInputRef.current) {
                  equipmentCameraInputRef.current.value = '';
              }
          }
      }
  };

  const handleEquipmentPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const files: File[] = Array.from(e.target.files);
      const inputElement = e.target;
      await uploadEquipmentPhotosFromFiles(files, inputElement);
  };

  const handleEquipmentPhotosDrop = async (e: React.DragEvent) => {
      if (!canEdit || !isAddingEquipment) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverEquipmentImages(false);
      const files = Array.from(e.dataTransfer.files || []) as File[];
      await uploadEquipmentPhotosFromFiles(files, null);
  };

  const handleEquipmentPhotoDelete = async (imageUrl: string) => {
      try {
          await api.deleteImage(imageUrl);
          setNewEquipmentImages(prev => prev.filter(img => img !== imageUrl));
          showToast("Image deleted successfully", 'success');
      } catch (err) {
          showToast("Failed to delete image", 'error');
      }
  };

  const handleBuildingImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setIsUploadingBuildingImage(true);
          try {
              const oldImageUrl = selectedBuilding.buildingImage;
              const url = await api.uploadFile(e.target.files[0], oldImageUrl);
              onUpdateBuilding(selectedBuilding.code, { buildingImage: url });
              showToast("Building image uploaded successfully", 'success');
          } catch(e) { 
              showToast("Upload failed", 'error'); 
          } finally {
              setIsUploadingBuildingImage(false);
          }
      }
  };

  return (
      <div className="space-y-6 pb-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-4">
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

                        navigate('/building');
                      }} 
                      className="p-2 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
                  >
                      <ArrowLeft size={20}/>
                  </button>
                  <div>
                      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{selectedBuilding.name}</h1>
                      <p className="text-slate-500 text-sm mt-1.5">Select a maintenance room to view details</p>
                  </div>
              </div>
              <div className="flex flex-col items-stretch md:items-end gap-2.5 w-full md:w-auto">
                  {canEdit && (
                    <>
                      <button 
                          onClick={handleCreateRoom} 
                          className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-brand-700 transition-colors shadow-sm"
                      >
                          <Plus size={16} className="mr-2" /> Add Room
                      </button>
                      <button 
                          onClick={handleCreateEquipment} 
                          className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-brand-700 transition-colors shadow-sm"
                      >
                          <Wrench size={16} className="mr-2" /> Add Equipment
                      </button>
                    </>
                  )}
                  <button
                      onClick={handleShareBuilding}
                      className="w-full md:w-auto bg-white text-slate-700 px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                      <Share2 size={16} className="mr-2" /> Share
                  </button>
              </div>
          </div>

          {/* Add Room Modal */}
          {canEdit && isAddingRoom && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-fade-in border border-slate-200">
                      <div className="flex justify-between items-center mb-6">
                          <h2 className="text-xl font-semibold text-slate-900">Add New Room</h2>
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

          {/* Add Equipment Modal */}
          {canEdit && isAddingEquipment && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto border border-slate-200">
                      <div className="flex justify-between items-center mb-6">
                          <h2 className="text-xl font-semibold text-slate-900">
                              {newEquipmentName ? 'Duplicate Equipment' : 'Add New Equipment'}
                          </h2>
                          <button 
                              onClick={handleCancelAddEquipment}
                              className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                              <X size={20} />
                          </button>
                      </div>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Accounting Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                  type="text"
                                  value={newEquipmentName}
                                  onChange={(e) => setNewEquipmentName(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="e.g. HVAC Unit, Generator"
                                  autoFocus
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newEquipmentName.trim()) {
                                          handleSaveNewEquipment();
                                      }
                                  }}
                              />
                          </div>

                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">SCADA Name</label>
                              <input
                                  type="text"
                                  value={newEquipmentScadaName}
                                  onChange={(e) => setNewEquipmentScadaName(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="SCADA tag/name (optional)"
                              />
                          </div>
                          
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Description
                              </label>
                              <input
                                  type="text"
                                  value={newEquipmentDesc}
                                  onChange={(e) => setNewEquipmentDesc(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="Brief description of the equipment"
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newEquipmentName.trim()) {
                                          handleSaveNewEquipment();
                                      }
                                  }}
                              />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-bold text-slate-600 mb-1">
                                      Room
                                  </label>
                                  <select
                                      value={newEquipmentRoom}
                                      onChange={(e) => setNewEquipmentRoom(e.target.value)}
                                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  >
                                      <option value="">Select a room...</option>
                                      {selectedBuilding.maintenanceRooms.map(room => (
                                          <option key={room.id} value={room.RoomNumber}>
                                              {room.RoomNumber} {room.Description ? `- ${room.Description}` : ''}
                                          </option>
                                      ))}
                                  </select>
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-slate-600 mb-1">
                                      Status
                                  </label>
                                  <select
                                      value={newEquipmentStatus}
                                      onChange={(e) => setNewEquipmentStatus(e.target.value as typeof newEquipmentStatus)}
                                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  >
                                      <option value="UNKNOWN">Unknown</option>
                                      <option value="OPERATING">Operating</option>
                                      <option value="REPAIR">Repair</option>
                                      <option value="INACTIVE">Inactive</option>
                                      <option value="ONSHELF">On Shelf</option>
                                      <option value="REMOVED">Deleted</option>
                                  </select>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-bold text-slate-600 mb-1">
                                      Manufacturer
                                  </label>
                                  <input
                                      type="text"
                                      value={newEquipmentManufacturer}
                                      onChange={(e) => setNewEquipmentManufacturer(e.target.value)}
                                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                      placeholder="e.g. Carrier, Trane"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-slate-600 mb-1">
                                      Serial Number
                                  </label>
                                  <input
                                      type="text"
                                      value={newEquipmentSerialNum}
                                      onChange={(e) => setNewEquipmentSerialNum(e.target.value)}
                                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                      placeholder="Serial number"
                                  />
                              </div>
                          </div>

                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Vendor
                              </label>
                              <input
                                  type="text"
                                  value={newEquipmentVendor}
                                  onChange={(e) => setNewEquipmentVendor(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="Vendor name"
                              />
                          </div>

                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-1">
                                  Notes
                              </label>
                              <textarea
                                  value={newEquipmentNotes}
                                  onChange={(e) => setNewEquipmentNotes(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                  placeholder="Additional notes..."
                                  rows={3}
                              />
                          </div>

                          {/* Photo Upload Section */}
                          <div>
                              <label className="block text-sm font-bold text-slate-600 mb-2">
                                  Photos
                              </label>
                              
                              {/* Photo Grid */}
                              {newEquipmentImages.length > 0 && (
                                  <div className="grid grid-cols-3 gap-2 mb-3">
                                      {newEquipmentImages.map((img, idx) => (
                                          <div key={idx} className="relative rounded-lg overflow-hidden aspect-square border border-slate-200 group">
                                              <img src={img} className="w-full h-full object-cover" alt={`Upload ${idx + 1}`} />
                                              <button
                                                  onClick={() => handleEquipmentPhotoDelete(img)}
                                                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                              >
                                                  <X size={12} />
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              
                              {/* Uploading Placeholders */}
                              {uploadingEquipmentImageIds.size > 0 && (
                                  <div className="grid grid-cols-3 gap-2 mb-3">
                                      {Array.from(uploadingEquipmentImageIds).map((tempId) => (
                                          <div key={tempId} className="relative rounded-lg overflow-hidden aspect-square border-2 border-dashed border-brand-300 bg-brand-50 flex items-center justify-center">
                                              <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                                  <RefreshCw className="animate-spin text-brand-600 mb-2" size={20} />
                                                  <div className="w-full px-2">
                                                      <div className="w-full bg-brand-200 rounded-full h-1.5">
                                                          <div className="bg-brand-600 h-1.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                                      </div>
                                                  </div>
                                                  <span className="text-xs text-brand-600 mt-1">Uploading...</span>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              
                              {/* Upload Buttons + drag & drop */}
                              <div
                                className="flex gap-2"
                                onDragOver={(e) => {
                                  if (!canEdit || !isAddingEquipment) return;
                                  e.preventDefault();
                                  setIsDragOverEquipmentImages(true);
                                }}
                                onDragLeave={() => setIsDragOverEquipmentImages(false)}
                                onDrop={handleEquipmentPhotosDrop}
                              >
                                  <label className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingEquipmentImages ? 'opacity-50 pointer-events-none' : ''} ${isDragOverEquipmentImages ? 'border-brand-400 bg-brand-50' : 'border-slate-300'}`}>
                                      {isUploadingEquipmentImages ? (
                                          <>
                                              <RefreshCw className="animate-spin text-slate-400" size={24} />
                                              <span className="text-sm text-slate-500 mt-2">Uploading...</span>
                                          </>
                                      ) : (
                                          <>
                                              <Upload size={24} className="text-slate-400" />
                                              <span className="text-sm text-slate-500 mt-2">Upload/Drag & Drop</span>
                                          </>
                                      )}
                                      <input 
                                          ref={equipmentUploadInputRef}
                                          type="file" 
                                          className="hidden" 
                                          accept="image/*" 
                                          multiple
                                          onChange={handleEquipmentPhotoUpload}
                                          disabled={isUploadingEquipmentImages}
                                      />
                                  </label>
                                  <label className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingEquipmentImages ? 'opacity-50 pointer-events-none' : ''} ${isDragOverEquipmentImages ? 'border-brand-400 bg-brand-50' : 'border-slate-300'}`}>
                                      {isUploadingEquipmentImages ? (
                                          <>
                                              <RefreshCw className="animate-spin text-slate-400" size={24} />
                                              <span className="text-sm text-slate-500 mt-2">Uploading...</span>
                                          </>
                                      ) : (
                                          <>
                                              <Camera size={24} className="text-slate-400" />
                                              <span className="text-sm text-slate-500 mt-2">Take Photo</span>
                                          </>
                                      )}
                                      <input 
                                          ref={equipmentCameraInputRef}
                                          type="file" 
                                          className="hidden" 
                                          accept="image/*" 
                                          capture="environment"
                                          multiple
                                          onChange={handleEquipmentPhotoUpload}
                                          disabled={isUploadingEquipmentImages}
                                      />
                                  </label>
                              </div>
                          </div>
                      </div>
                      
                      <div className="flex justify-end gap-3 mt-6">
                          <button
                              onClick={handleCancelAddEquipment}
                              disabled={isSavingEquipment}
                              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
                          >
                              Cancel
                          </button>
                          <button
                              onClick={handleSaveNewEquipment}
                              disabled={isSavingEquipment || !newEquipmentName.trim()}
                              className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              {isSavingEquipment ? 'Creating...' : 'Create Equipment'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row gap-8">
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
                   {canEdit && (
                     <div className="absolute bottom-2 right-2 flex gap-2">
                         <label 
                            className={`bg-white/90 hover:bg-white text-slate-700 px-3 py-2 rounded-full cursor-pointer shadow-sm transition-colors flex items-center gap-1.5 ${isUploadingBuildingImage ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={e => e.stopPropagation()}
                         >
                             <Upload size={14} />
                             <span className="text-xs">Upload</span>
                             <input type="file" className="hidden" accept="image/*" onChange={handleBuildingImageUpload} disabled={isUploadingBuildingImage}/>
                         </label>
                         <label 
                            className={`bg-white/90 hover:bg-white text-slate-700 px-3 py-2 rounded-full cursor-pointer shadow-sm transition-colors flex items-center gap-1.5 ${isUploadingBuildingImage ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={e => e.stopPropagation()}
                         >
                             <Camera size={14} />
                             <span className="text-xs">Camera</span>
                             <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleBuildingImageUpload} disabled={isUploadingBuildingImage}/>
                         </label>
                     </div>
                   )}
               </div>
               <div className="flex-1 space-y-4">
                   <div>
                      <h3 className="font-bold text-slate-800 text-lg">Building Details</h3>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                           <div className="bg-slate-50 p-4 rounded-md border border-slate-200">
                               <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">Code</span>
                               <span className="text-brand-600 font-mono font-semibold text-lg">{selectedBuilding.code}</span>
                           </div>
                           <div className="bg-slate-50 p-4 rounded-md border border-slate-200">
                               <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">Total Rooms</span>
                               <span className="text-slate-900 font-semibold text-lg">{selectedBuilding.maintenanceRooms.length}</span>
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
                                      readOnly={!canEdit}
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

          {/* Rooms Section */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">Rooms</h2>
              
              <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm font-medium text-slate-700">Filters:</span>
                  
                  {/* Floor Filter Dropdown */}
                  <div className="relative" ref={floorDropdownRef}>
                      <button
                          onClick={() => {
                              setShowFloorFilter(!showFloorFilter);
                              setShowDescriptionFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                              selectedFloors.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                      >
                          <Layers size={14} />
                          Floor
                          {selectedFloors.length > 0 && (
                              <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                  {selectedFloors.length}
                              </span>
                          )}
                          <ChevronDown size={14} className={showFloorFilter ? 'transform rotate-180' : ''} />
                      </button>
                      
                      {showFloorFilter && (
                          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                              <div className="p-3">
                                  <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                                      Select Floors ({floorOptions.length})
                                  </div>
                                  <div className="space-y-1.5">
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
                                                  <span className="text-sm text-slate-700 flex-1">{floor}</span>
                                                  <span className="text-xs text-slate-400">
                                                      ({selectedBuilding.maintenanceRooms.filter(r => r.Floor?.trim() === floor).length})
                                                  </span>
                                              </label>
                                          ))
                                      ) : (
                                          <p className="text-xs text-slate-400 italic">No floor data available</p>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Description Filter Dropdown */}
                  <div className="relative" ref={descriptionDropdownRef}>
                      <button
                          onClick={() => {
                              setShowDescriptionFilter(!showDescriptionFilter);
                              setShowFloorFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                              selectedDescriptions.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                      >
                          <FileText size={14} />
                          Description
                          {selectedDescriptions.length > 0 && (
                              <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                  {selectedDescriptions.length}
                              </span>
                          )}
                          <ChevronDown size={14} className={showDescriptionFilter ? 'transform rotate-180' : ''} />
                      </button>
                      
                      {showDescriptionFilter && (
                          <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                              <div className="p-3">
                                  <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                                      Select Descriptions ({descriptionOptions.length})
                                  </div>
                                  <div className="space-y-1.5">
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
                                                  <span className="text-sm text-slate-700 flex-1 line-clamp-1" title={desc}>{desc}</span>
                                                  <span className="text-xs text-slate-400">
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

                  {/* Active Filter Chips */}
                  {hasActiveFilters && (
                      <>
                          {selectedFloors.map(floor => (
                              <div
                                  key={floor}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm"
                              >
                                  <Layers size={12} />
                                  <span>{floor}</span>
                                  <button
                                      onClick={() => removeFloor(floor)}
                                      className="hover:bg-brand-200 rounded p-0.5 transition-colors"
                                  >
                                      <X size={12} />
                                  </button>
                              </div>
                          ))}
                          
                          {selectedDescriptions.map(desc => (
                              <div
                                  key={desc}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm max-w-xs"
                              >
                                  <FileText size={12} />
                                  <span className="truncate" title={desc}>{desc}</span>
                                  <button
                                      onClick={() => removeDescription(desc)}
                                      className="hover:bg-brand-200 rounded p-0.5 transition-colors flex-shrink-0"
                                  >
                                      <X size={12} />
                                  </button>
                              </div>
                          ))}
                          
                          <button
                              onClick={clearFilters}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors px-2 py-1"
                          >
                              <X size={12} />
                              Clear all
                          </button>
                      </>
                  )}
              </div>
              
              <div className="text-sm text-slate-500 pt-2 border-t border-slate-200">
                  Showing {filteredRooms.length} of {selectedBuilding.maintenanceRooms.length} rooms
              </div>
          </div>

          {/* Rooms list - responsive */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              {/* Desktop table view */}
              <div className="hidden md:block">
                  <table className="w-full text-left table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                              <th className="py-3.5 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider w-48">Room #</th>
                              <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">Floor</th>
                              <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredRooms.length > 0 ? (
                              filteredRooms.map(room => {
                                  const isExpanded = expandedRoomId === room.id;
                                  const images = room.roomImages || [];

                                  return (
                                      <React.Fragment key={room.id}>
                                          <tr 
                                              className="hover:bg-slate-50 group cursor-pointer transition-colors" 
                                              onClick={() => navigate(`/building/${selectedBuilding.code}/room/${room.id}`, { 
                                                state: { 
                                                  from: `${location.pathname}${location.search}`,
                                                  fromKey: location.key
                                                } 
                                              })}
                                          >
                                              <td className="py-3.5 px-6 font-semibold text-slate-900">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                      <button
                                                          type="button"
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              setExpandedRoomId(prev => prev === room.id ? null : room.id);
                                                          }}
                                                          aria-expanded={isExpanded}
                                                          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                                      >
                                                          <ChevronRight
                                                              size={16}
                                                              className={`transition-transform ${isExpanded ? 'rotate-90 text-brand-600' : 'text-slate-300'}`}
                                                          />
                                                      </button>
                                                      <span className="truncate">{room.RoomNumber}</span>
                                                  </div>
                                              </td>
                                              <td className="py-3.5 px-4 text-sm text-slate-700 truncate">{room.Floor || '—'}</td>
                                              <td className="py-3.5 px-4 text-sm text-slate-700 truncate">{room.Description || '—'}</td>
                                          </tr>
                                          {isExpanded && (
                                              <tr className="bg-slate-50/60">
                                                  <td colSpan={3} className="px-6 pt-1 pb-4">
                                                      <div className="text-xs font-semibold text-slate-600 mb-2">
                                                          Room photos ({images.length})
                                                      </div>
                                                      {images.length === 0 ? (
                                                          <div className="text-sm text-slate-500">
                                                              No photos yet for this room.
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
                                                                          alt={`Room ${room.RoomNumber} interior ${idx + 1}`}
                                                                          loading="lazy"
                                                                          className="h-56 w-56 rounded-md object-cover border border-slate-200"
                                                                      />
                                                                  </button>
                                                              ))}
                                                          </div>
                                                      )}
                                                  </td>
                                              </tr>
                                          )}
                                      </React.Fragment>
                                  );
                              })
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

              {/* Mobile card view */}
              <div className="md:hidden divide-y divide-slate-100">
                  {filteredRooms.length > 0 ? (
                      filteredRooms.map(room => {
                          const isExpanded = expandedRoomId === room.id;
                          const images = room.roomImages || [];

                          return (
                              <div 
                                  key={room.id}
                                  onClick={() => navigate(`/building/${selectedBuilding.code}/room/${room.id}`, { 
                                    state: { 
                                      from: `${location.pathname}${location.search}`,
                                      fromKey: location.key
                                    } 
                                  })}
                                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1">
                                          <div className="font-semibold text-sm text-slate-900">
                                              {room.RoomNumber}
                                          </div>
                                          {room.Description && (
                                              <div className="text-sm text-slate-600 mt-0.5 line-clamp-2">
                                                  {room.Description}
                                              </div>
                                          )}
                                          {room.Floor && (
                                              <div className="text-xs text-slate-500 mt-1">
                                                  <span className="font-medium">Floor:</span> {room.Floor}
                                              </div>
                                          )}
                                      </div>
                                      <button
                                          type="button"
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedRoomId(prev => prev === room.id ? null : room.id);
                                          }}
                                          aria-expanded={isExpanded}
                                          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                      >
                                          <ChevronRight
                                              size={16}
                                              className={`transition-transform ${isExpanded ? 'rotate-90 text-brand-600' : 'text-slate-300'}`}
                                          />
                                      </button>
                                  </div>

                                  {isExpanded && (
                                      <div className="mt-3">
                                          <div className="text-xs font-semibold text-slate-600 mb-1.5">
                                              Room photos ({images.length})
                                          </div>
                                          {images.length === 0 ? (
                                              <div className="text-xs text-slate-500">
                                                  No photos yet for this room.
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
                                                              alt={`Room ${room.RoomNumber} interior ${idx + 1}`}
                                                              loading="lazy"
                                                              className="h-40 w-40 rounded-md object-cover border border-slate-200"
                                                          />
                                                      </button>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  )}
                              </div>
                          );
                      })
                  ) : (
                      <div className="p-8 text-center text-slate-400 text-sm">
                          No rooms match the selected filters
                      </div>
                  )}
              </div>
          </div>

          {/* Equipment Section */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">Equipment</h2>
              
              <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm font-medium text-slate-700">Filters:</span>
                  
                  {/* Description Filter Dropdown */}
                  <div className="relative" ref={equipmentDescriptionDropdownRef}>
                      <button
                          onClick={() => {
                              setShowEquipmentDescriptionFilter(!showEquipmentDescriptionFilter);
                              setShowStatusFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                              selectedEquipmentDescriptions.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                      >
                          <FileText size={14} />
                          Description
                          {selectedEquipmentDescriptions.length > 0 && (
                              <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                  {selectedEquipmentDescriptions.length}
                              </span>
                          )}
                          <ChevronDown size={14} className={showEquipmentDescriptionFilter ? 'transform rotate-180' : ''} />
                      </button>
                      
                      {showEquipmentDescriptionFilter && (
                          <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                              <div className="p-3">
                                  <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                                      Select Descriptions ({equipmentDescriptionOptions.length})
                                  </div>
                                  <div className="space-y-1.5">
                                      {equipmentDescriptionOptions.length > 0 ? (
                                          equipmentDescriptionOptions.map(desc => (
                                              <label
                                                  key={desc}
                                                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                                              >
                                                  <input
                                                      type="checkbox"
                                                      checked={selectedEquipmentDescriptions.includes(desc)}
                                                      onChange={() => toggleEquipmentDescription(desc)}
                                                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                  />
                                                  <span className="text-sm text-slate-700 flex-1 line-clamp-1" title={desc}>{desc}</span>
                                                  <span className="text-xs text-slate-400">
                                                      ({selectedBuilding.equipment.filter(e => e.description?.trim() === desc).length})
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

                  {/* Status Filter Dropdown */}
                  <div className="relative" ref={statusDropdownRef}>
                      <button
                          onClick={() => {
                              setShowStatusFilter(!showStatusFilter);
                              setShowEquipmentDescriptionFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                              selectedStatuses.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                      >
                          <Info size={14} />
                          Status
                          {selectedStatuses.length > 0 && (
                              <span className="bg-brand-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                                  {selectedStatuses.length}
                              </span>
                          )}
                          <ChevronDown size={14} className={showStatusFilter ? 'transform rotate-180' : ''} />
                      </button>
                      
                      {showStatusFilter && (
                          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                              <div className="p-3">
                                  <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                                      Select Status ({statusOptionsWithCounts.length})
                                  </div>
                                  <div className="space-y-1.5">
                                      {statusOptionsWithCounts.map(status => (
                                          <label
                                              key={status.value}
                                              className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                                          >
                                              <input
                                                  type="checkbox"
                                                  checked={selectedStatuses.includes(status.value)}
                                                  onChange={() => toggleStatus(status.value)}
                                                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                              />
                                              <span className="text-sm text-slate-700 flex-1">
                                                  {status.value}
                                              </span>
                                              <span className="text-xs text-slate-400">
                                                  ({status.count})
                                              </span>
                                          </label>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Active Filter Chips */}
                  {hasActiveEquipmentFilters && (
                      <>
                          {selectedEquipmentDescriptions.map(desc => (
                              <div
                                  key={desc}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm max-w-xs"
                              >
                                  <FileText size={12} />
                                  <span className="truncate" title={desc}>{desc}</span>
                                  <button
                                      onClick={() => removeEquipmentDescription(desc)}
                                      className="hover:bg-brand-200 rounded p-0.5 transition-colors flex-shrink-0"
                                  >
                                      <X size={12} />
                                  </button>
                              </div>
                          ))}
                          
                          {selectedStatuses.map(status => (
                              <div
                                  key={status}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm"
                              >
                                  <Info size={12} />
                                  <span>{status}</span>
                                  <button
                                      onClick={() => removeStatus(status)}
                                      className="hover:bg-brand-200 rounded p-0.5 transition-colors flex-shrink-0"
                                  >
                                      <X size={12} />
                                  </button>
                              </div>
                          ))}
                          
                          <button
                              onClick={clearEquipmentFilters}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors px-2 py-1"
                          >
                              <X size={12} />
                              Clear all
                          </button>
                      </>
                  )}
              </div>
              
              <div className="text-sm text-slate-500 pt-2 border-t border-slate-200">
                  Showing {filteredEquipment.length} of {selectedBuilding.equipment.length} equipment
              </div>
          </div>

          {/* Equipment list - responsive */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              {/* Desktop table view */}
              <div className="hidden md:block">
                  <table className="w-full text-left table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                              <th className="py-3.5 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider w-48">Equipment</th>
                              <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                              <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">Room</th>
                              <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">Status</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredEquipment.length > 0 ? (
                              filteredEquipment.map(eq => {
                                  const isExpanded = expandedEquipmentId === eq.id;
                                  const images = eq.images || [];

                                  return (
                                      <React.Fragment key={eq.id}>
                                          <tr 
                                              className="hover:bg-slate-50 group cursor-pointer transition-colors" 
                                              onClick={() => navigate(`/equipment/${eq.id}`, { 
                                                state: { 
                                                  from: `${location.pathname}${location.search}`,
                                                  fromKey: location.key
                                                } 
                                              })}
                                          >
                                              <td className="py-3.5 px-6 font-semibold text-slate-900">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                      {canEdit && (
                                                          <button
                                                              type="button"
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  handleCreateEquipment(eq);
                                                              }}
                                                              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                                              title="Duplicate equipment"
                                                          >
                                                              <Copy size={14} />
                                                          </button>
                                                      )}
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
                                                              size={16}
                                                              className={`transition-transform ${isExpanded ? 'rotate-90 text-brand-600' : 'text-slate-300'}`}
                                                          />
                                                      </button>
                                                      <span className="truncate">{eq.accountingName}</span>
                                                  </div>
                                              </td>
                                              <td className="py-3.5 px-4 text-sm text-slate-700 truncate">{eq.description || '—'}</td>
                                              <td className="py-3.5 px-4 text-sm text-slate-700 truncate">{eq.room || '—'}</td>
                                              <td className="py-3.5 px-4">
                                                  {(() => {
                                                    const pill = getStatusPill(eq.status);
                                                    return (
                                                      <span className={`text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${pill.className}`}>
                                                        {pill.label}
                                                      </span>
                                                    );
                                                  })()}
                                              </td>
                                          </tr>
                                          {isExpanded && (
                                              <tr className="bg-slate-50/60">
                                                  <td colSpan={4} className="px-6 pt-1 pb-4">
                                                      <div className="text-xs font-semibold text-slate-600 mb-2">
                                                          Equipment photos ({images.length})
                                                      </div>
                                                      {images.length === 0 ? (
                                                          <div className="text-sm text-slate-500">
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
                                                                          className="h-36 w-36 rounded-md object-cover border border-slate-200"
                                                                      />
                                                                  </button>
                                                              ))}
                                                          </div>
                                                      )}
                                                  </td>
                                              </tr>
                                          )}
                                      </React.Fragment>
                                  );
                              })
                          ) : (
                              <tr>
                                  <td colSpan={4} className="py-12 px-6 text-center text-slate-400 text-sm">
                                      No equipment matches the selected filters
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden divide-y divide-slate-100">
                  {filteredEquipment.length > 0 ? (
                      filteredEquipment.map(eq => {
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
                                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 mb-1">
                                              <span className="font-semibold text-sm text-slate-900 truncate">
                                                  {eq.accountingName}
                                              </span>
                                              {canEdit && (
                                                  <button
                                                      type="button"
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleCreateEquipment(eq);
                                                      }}
                                                      className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                                      title="Duplicate equipment"
                                                  >
                                                      <Copy size={12} />
                                                  </button>
                                              )}
                                          </div>
                                          {eq.description && (
                                              <div className="text-sm text-slate-600 line-clamp-2">
                                                  {eq.description}
                                              </div>
                                          )}
                                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                              {eq.room && (
                                                  <span className="truncate">
                                                      <span className="font-medium">Room:</span> {eq.room}
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                          <span
                                              className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${
                                                  eq.status === 'OPERATING'
                                                      ? 'bg-green-50 text-green-700 border border-green-200'
                                                      : eq.status === 'REPAIR'
                                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                                      : eq.status === 'INACTIVE'
                                                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                                      : eq.status === 'ONSHELF'
                                                      ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                              }`}
                                          >
                                              {eq.status || 'UNKNOWN'}
                                          </span>
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
                                                  size={16}
                                                  className={`transition-transform ${isExpanded ? 'rotate-90 text-brand-600' : 'text-slate-300'}`}
                                              />
                                          </button>
                                      </div>
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
                                                              className="h-32 w-32 rounded-md object-cover border border-slate-200"
                                                          />
                                                      </button>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  )}
                              </div>
                          );
                      })
                  ) : (
                      <div className="py-8 px-4 text-center text-slate-400 text-sm">
                          No equipment matches the selected filters
                      </div>
                  )}
              </div>
          </div>
      </div>
  );
};
