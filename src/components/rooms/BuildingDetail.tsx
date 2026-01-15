import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Building as BuildingIcon, Camera, Plus, ChevronRight, ExternalLink, X, Filter, RefreshCw, Share2, Wrench, Layers, FileText, Info, ChevronDown, Upload, Copy } from 'lucide-react';
import { BuildingData, Equipment } from '@/types';
import { MaintenanceRoom } from '@/types';
import { api } from '@/api';
import { useToast } from '../common/Toast';

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
  const [newEquipmentDesc, setNewEquipmentDesc] = useState('');
  const [newEquipmentRoom, setNewEquipmentRoom] = useState('');
  const [newEquipmentManufacturer, setNewEquipmentManufacturer] = useState('');
  const [newEquipmentVendor, setNewEquipmentVendor] = useState('');
  const [newEquipmentSerialNum, setNewEquipmentSerialNum] = useState('');
  const [newEquipmentNotes, setNewEquipmentNotes] = useState('');
  const [newEquipmentStatus, setNewEquipmentStatus] = useState<'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN'>('UNKNOWN');
  const [newEquipmentImages, setNewEquipmentImages] = useState<string[]>([]);
  const [isSavingEquipment, setIsSavingEquipment] = useState(false);
  const [isUploadingEquipmentImages, setIsUploadingEquipmentImages] = useState(false);
  const [uploadingEquipmentImageIds, setUploadingEquipmentImageIds] = useState<Set<string>>(new Set());
  const equipmentUploadInputRef = useRef<HTMLInputElement>(null);
  const equipmentCameraInputRef = useRef<HTMLInputElement>(null);
  
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
      .map(e => e.EquipmentDesc?.trim())
      .filter(d => d && d !== '')
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort();
    return descriptions;
  }, [selectedBuilding.equipment]);
  
  const statusOptions: Array<'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN'> = ['INACTIVE', 'ONSHELF', 'OPERATING', 'REPAIR', 'UNKNOWN'];
  
  const statusOptionsWithCounts = useMemo(() => {
    return statusOptions.map(status => ({
      value: status,
      count: selectedBuilding.equipment.filter(e => (e.status || 'UNKNOWN') === status).length
    }));
  }, [selectedBuilding.equipment]);
  
  // Filtered equipment
  const filteredEquipment = useMemo(() => {
    return selectedBuilding.equipment.filter(eq => {
      const eqDesc = eq.EquipmentDesc?.trim() || '';
      const eqStatus = eq.status || 'UNKNOWN';
      
      const descMatch = selectedEquipmentDescriptions.length === 0 ||
        selectedEquipmentDescriptions.includes(eqDesc);
      
      const statusMatch = selectedStatuses.length === 0 ||
        selectedStatuses.includes(eqStatus);
      
      return descMatch && statusMatch;
    });
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
          setNewEquipmentName(equipmentToDuplicate.Equipment || '');
          setNewEquipmentDesc(equipmentToDuplicate.EquipmentDesc || '');
          setNewEquipmentRoom(equipmentToDuplicate.Room || '');
          setNewEquipmentManufacturer(equipmentToDuplicate.Manufacturer || '');
          setNewEquipmentVendor(equipmentToDuplicate.Vendor || '');
          setNewEquipmentSerialNum(equipmentToDuplicate.SerialNum || '');
          setNewEquipmentNotes(equipmentToDuplicate.Notes || '');
          setNewEquipmentStatus(equipmentToDuplicate.status || 'UNKNOWN');
          setNewEquipmentImages([]); // Don't copy images
      } else {
          // Reset form for new equipment
          setNewEquipmentName('');
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
              navigate(`/building/${selectedBuilding.code}/room/${savedRoom.id}`);
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
              Equipment: newEquipmentName.trim(),
              EquipmentDesc: newEquipmentDesc.trim(),
              Notes: newEquipmentNotes.trim(),
              Location: selectedBuilding.code,
              LocationDesc: selectedBuilding.name,
              Room: newEquipmentRoom || '',
              KeyAccess: '',
              AssetTag: '',
              SerialNum: newEquipmentSerialNum.trim(),
              Manufacturer: newEquipmentManufacturer.trim(),
              Model: '',
              Vendor: newEquipmentVendor.trim(),
              PurchaseDate: '',
              WarrantyDate: '',
              images: newEquipmentImages,
              status: newEquipmentStatus
          };
          
          await onSaveEquipment(newEq);
          
          // Reset form and stay on building detail page
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

  const handleEquipmentPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      const files: File[] = Array.from(e.target.files);
      const tempIds = files.map((_, idx) => `temp-${Date.now()}-${idx}`);
      const inputElement = e.target;
      
      setUploadingEquipmentImageIds(new Set(tempIds));
      setIsUploadingEquipmentImages(true);
      
      try {
          const uploadPromises = files.map(async (file, idx) => {
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
          inputElement.value = '';
          if (equipmentUploadInputRef.current && inputElement !== equipmentUploadInputRef.current) {
              equipmentUploadInputRef.current.value = '';
          }
          if (equipmentCameraInputRef.current && inputElement !== equipmentCameraInputRef.current) {
              equipmentCameraInputRef.current.value = '';
          }
      }
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
              <div className="flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
                  {canEdit && (
                    <>
                      <button 
                          onClick={handleCreateRoom} 
                          className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 shadow-sm"
                      >
                          <Plus size={18} className="mr-2" /> Add Room
                      </button>
                      <button 
                          onClick={handleCreateEquipment} 
                          className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 shadow-sm"
                      >
                          <Wrench size={18} className="mr-2" /> Add Equipment
                      </button>
                    </>
                  )}
                  <button
                      onClick={handleShareBuilding}
                      className="w-full md:w-auto bg-white text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center justify-center border border-slate-200 hover:bg-slate-50 shadow-sm"
                  >
                      <Share2 size={18} className="mr-2" /> Share
                  </button>
              </div>
          </div>

          {/* Add Room Modal */}
          {canEdit && isAddingRoom && (
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

          {/* Add Equipment Modal */}
          {canEdit && isAddingEquipment && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
                      <div className="flex justify-between items-center mb-4">
                          <h2 className="text-xl font-bold text-slate-800">
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
                                  Equipment Name <span className="text-red-500">*</span>
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
                              
                              {/* Upload Buttons */}
                              <div className="flex gap-2">
                                  <label className={`flex-1 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingEquipmentImages ? 'opacity-50 pointer-events-none' : ''}`}>
                                      {isUploadingEquipmentImages ? (
                                          <>
                                              <RefreshCw className="animate-spin text-slate-400" size={24} />
                                              <span className="text-sm text-slate-500 mt-2">Uploading...</span>
                                          </>
                                      ) : (
                                          <>
                                              <Upload size={24} className="text-slate-400" />
                                              <span className="text-sm text-slate-500 mt-2">Upload Photo</span>
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
                                  <label className={`flex-1 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingEquipmentImages ? 'opacity-50 pointer-events-none' : ''}`}>
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Rooms</h2>
              
              <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm font-medium text-slate-700">Filters:</span>
                  
                  {/* Floor Filter Dropdown */}
                  <div className="relative" ref={floorDropdownRef}>
                      <button
                          onClick={() => {
                              setShowFloorFilter(!showFloorFilter);
                              setShowDescriptionFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                              selectedFloors.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                              selectedDescriptions.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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

          {/* Equipment Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Equipment</h2>
              
              <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm font-medium text-slate-700">Filters:</span>
                  
                  {/* Description Filter Dropdown */}
                  <div className="relative" ref={equipmentDescriptionDropdownRef}>
                      <button
                          onClick={() => {
                              setShowEquipmentDescriptionFilter(!showEquipmentDescriptionFilter);
                              setShowStatusFilter(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                              selectedEquipmentDescriptions.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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
                                                      ({selectedBuilding.equipment.filter(e => e.EquipmentDesc?.trim() === desc).length})
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
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                              selectedStatuses.length > 0
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                              <th className="p-4 text-sm font-bold text-slate-600">Equipment</th>
                              <th className="p-4 text-sm font-bold text-slate-600">Description</th>
                              <th className="p-4 text-sm font-bold text-slate-600">Room</th>
                              <th className="p-4 text-sm font-bold text-slate-600">Status</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredEquipment.length > 0 ? (
                              filteredEquipment.map(eq => (
                                  <tr 
                                      key={eq.id} 
                                      className="hover:bg-slate-50 group cursor-pointer" 
                                      onClick={() => navigate(`/equipment/${eq.id}`)}
                                  >
                                      <td className="p-4 font-bold text-slate-700 flex items-center">
                                          {canEdit && (
                                              <button
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleCreateEquipment(eq);
                                                  }}
                                                  className="mr-2 p-1.5 rounded hover:bg-brand-100 text-slate-400 hover:text-brand-600 transition-colors"
                                                  title="Duplicate equipment"
                                              >
                                                  <Copy size={14} />
                                              </button>
                                          )}
                                          <ChevronRight size={16} className="text-slate-300 mr-2 group-hover:text-brand-600 transition-colors" />
                                          {eq.Equipment}
                                      </td>
                                      <td className="p-4 text-slate-600 max-w-xs lg:max-w-md truncate">{eq.EquipmentDesc || '—'}</td>
                                      <td className="p-4 text-slate-600">{eq.Room || '—'}</td>
                                      <td className="p-4">
                                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                            eq.status === 'OPERATING' ? 'bg-green-100 text-green-700' :
                                            eq.status === 'REPAIR' ? 'bg-red-100 text-red-700' :
                                            eq.status === 'INACTIVE' ? 'bg-slate-100 text-slate-600' :
                                            eq.status === 'ONSHELF' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-slate-100 text-slate-500'
                                          }`}>
                                              {eq.status || 'UNKNOWN'}
                                          </span>
                                      </td>
                                  </tr>
                              ))
                          ) : (
                              <tr>
                                  <td colSpan={4} className="p-8 text-center text-slate-400">
                                      No equipment matches the selected filters
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
