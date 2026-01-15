import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Plus, Filter, X, ChevronDown, MapPin, Building, FileText, Camera, RefreshCw, Info, Upload } from 'lucide-react';
import { BuildingData, Equipment } from '../../../types';
import { api } from '../../../api';
import { useToast } from '@/src/components/common/Toast';
import { fuzzyMatch } from '@/src/utils/fuzzySearch';

interface EquipmentListProps {
  data: BuildingData[];
  onSelectEquipment: (equipment: Equipment) => void;
  onNavigate: (view: string) => void;
  onSaveEquipment: (equipment: Equipment) => Promise<void>;
  canEdit: boolean;
}

export const EquipmentList: React.FC<EquipmentListProps> = ({
  data,
  onSelectEquipment,
  onNavigate,
  onSaveEquipment,
  canEdit,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const allEquipment = data.flatMap(b => b.equipment);
  
  // Load filter state from sessionStorage on mount
  const loadFilterState = () => {
    try {
      const saved = sessionStorage.getItem('equipmentListFilters');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          searchTerm: parsed.searchTerm || '',
          selectedLocations: parsed.selectedLocations || [],
          selectedRooms: parsed.selectedRooms || [],
          selectedDescriptions: parsed.selectedDescriptions || [],
          selectedStatuses: parsed.selectedStatuses || [],
        };
      }
    } catch (e) {
      console.error('Failed to load filter state:', e);
    }
    return {
      searchTerm: '',
      selectedLocations: [],
      selectedRooms: [],
      selectedDescriptions: [],
      selectedStatuses: [],
    };
  };

  const savedFilterState = loadFilterState();
  
  // Local search state (avoids re-rendering entire App on each keystroke)
  const [searchTerm, setSearchTerm] = useState(savedFilterState.searchTerm);
  
  // Add Equipment state
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentDesc, setNewEquipmentDesc] = useState('');
  const [newEquipmentLocation, setNewEquipmentLocation] = useState('');
  const [newEquipmentRoom, setNewEquipmentRoom] = useState('');
  const [newEquipmentManufacturer, setNewEquipmentManufacturer] = useState('');
  const [newEquipmentVendor, setNewEquipmentVendor] = useState('');
  const [newEquipmentSerialNum, setNewEquipmentSerialNum] = useState('');
  const [newEquipmentNotes, setNewEquipmentNotes] = useState('');
  const [newEquipmentStatus, setNewEquipmentStatus] = useState<'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN'>('UNKNOWN');
  const [newEquipmentImages, setNewEquipmentImages] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  
  // Filter state
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [showRoomFilter, setShowRoomFilter] = useState(false);
  const [showDescriptionFilter, setShowDescriptionFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(savedFilterState.selectedLocations);
  const [selectedRooms, setSelectedRooms] = useState<string[]>(savedFilterState.selectedRooms);
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>(savedFilterState.selectedDescriptions);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(savedFilterState.selectedStatuses);
  
  // Save filter state to sessionStorage whenever filters change
  useEffect(() => {
    try {
      sessionStorage.setItem('equipmentListFilters', JSON.stringify({
        searchTerm,
        selectedLocations,
        selectedRooms,
        selectedDescriptions,
        selectedStatuses,
      }));
    } catch (e) {
      console.error('Failed to save filter state:', e);
    }
  }, [searchTerm, selectedLocations, selectedRooms, selectedDescriptions, selectedStatuses]);
  
  // Refs for dropdowns
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const roomDropdownRef = useRef<HTMLDivElement>(null);
  const descriptionDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setShowLocationFilter(false);
      }
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(event.target as Node)) {
        setShowRoomFilter(false);
      }
      if (descriptionDropdownRef.current && !descriptionDropdownRef.current.contains(event.target as Node)) {
        setShowDescriptionFilter(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract unique locations with building names
  const locationOptions = useMemo(() => {
    const locations = data
      .filter(b => b.equipment.length > 0)
      .map(b => ({
        code: b.code,
        name: b.name,
        count: b.equipment.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return locations;
  }, [data]);

  // Extract rooms (only from selected locations)
  const roomOptions = useMemo(() => {
    if (selectedLocations.length === 0) return [];
    
    const relevantEquipment = allEquipment.filter(e => 
      selectedLocations.includes(e.Location)
    );
    
    const rooms = relevantEquipment
      .map(e => ({
        room: e.Room?.trim() || '',
        location: e.Location
      }))
      .filter(r => r.room && r.room !== '') // Exclude empty
      .filter((r, i, arr) => {
        // Unique by location + room combination
        return arr.findIndex(item => 
          item.location === r.location && item.room === r.room
        ) === i;
      })
      .map(r => ({
        room: r.room,
        location: r.location,
        count: relevantEquipment.filter(e => 
          e.Location === r.location && e.Room?.trim() === r.room
        ).length
      }))
      .sort((a, b) => {
        // Sort by location first, then room
        if (a.location !== b.location) {
          return a.location.localeCompare(b.location);
        }
        return a.room.localeCompare(b.room);
      });
    
    return rooms;
  }, [allEquipment, selectedLocations]);

  // Extract unique descriptions (exact match, preserve casing)
  const descriptionOptions = useMemo(() => {
    const descriptions = allEquipment
      .map(e => e.EquipmentDesc?.trim())
      .filter(d => d && d !== '') // Exclude empty
      .filter((d, i, arr) => {
        // Case-insensitive uniqueness check, but preserve original casing
        const lower = d.toLowerCase();
        return arr.findIndex(item => item.toLowerCase() === lower) === i;
      })
      .map(desc => ({
        value: desc,
        count: allEquipment.filter(e => 
          e.EquipmentDesc?.trim().toLowerCase() === desc.toLowerCase()
        ).length
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
    return descriptions;
  }, [allEquipment]);

  // Status options
  const statusOptions: Array<'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN'> = ['INACTIVE', 'ONSHELF', 'OPERATING', 'REPAIR', 'UNKNOWN'];
  
  const statusOptionsWithCounts = useMemo(() => {
    return statusOptions.map(status => ({
      value: status,
      count: allEquipment.filter(e => (e.status || 'UNKNOWN') === status).length
    }));
  }, [allEquipment]);

  // Filtered equipment
  const filtered = useMemo(() => {
    return allEquipment.filter(e => {
      // Fuzzy search filter (handles typos and similar words)
      const searchMatch = fuzzyMatch(
        e,
        searchTerm,
        ['Equipment', 'EquipmentDesc', 'AssetTag'],
        { threshold: 0.4 } // Balanced: allows ~60% similarity
      );
      
      // Location filter
      const locationMatch = selectedLocations.length === 0 || 
        selectedLocations.includes(e.Location);
      
      // Room filter (must match both location and room)
      const roomMatch = selectedRooms.length === 0 || 
        selectedRooms.some(selected => {
          // Format: "Location|Room" if multiple locations (pipe separator), or just "Room" if single location
          if (selected.includes('|') && selectedLocations.length > 1) {
            // Multiple locations: format is "Location|Room" (pipe to avoid conflicts with room names containing dashes)
            const [loc, room] = selected.split('|', 2);
            return e.Location === loc && e.Room?.trim() === room;
          } else {
            // Single location selected, room format is just room name
            // Check if equipment is in the selected location and matches the room
            return selectedLocations.length === 1 && 
                   selectedLocations.includes(e.Location) && 
                   e.Room?.trim() === selected;
          }
        });
      
      // Description filter (exact match, case-insensitive)
      const descMatch = selectedDescriptions.length === 0 ||
        selectedDescriptions.some(selected => 
          e.EquipmentDesc?.trim().toLowerCase() === selected.toLowerCase()
        );
      
      // Status filter
      const statusMatch = selectedStatuses.length === 0 ||
        selectedStatuses.includes(e.status || 'UNKNOWN');
      
      return searchMatch && locationMatch && roomMatch && descMatch && statusMatch;
    });
  }, [allEquipment, searchTerm, selectedLocations, selectedRooms, selectedDescriptions, selectedStatuses]);

  // Pagination - limit displayed items for performance
  const ITEMS_PER_PAGE = 50;
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(ITEMS_PER_PAGE);
  }, [searchTerm, selectedLocations, selectedRooms, selectedDescriptions, selectedStatuses]);
  
  const displayedItems = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);
  const hasMoreItems = filtered.length > displayLimit;

  // Toggle functions
  const toggleLocation = (code: string) => {
    setSelectedLocations(prev => {
      if (prev.includes(code)) {
        const newLocations = prev.filter(l => l !== code);
        // Clear room selections if location is removed
        if (newLocations.length === 0) {
          setSelectedRooms([]);
        } else {
          // Remove rooms that are no longer valid
          setSelectedRooms(prevRooms => 
            prevRooms.filter(room => {
              if (room.includes('|')) {
                // Multiple locations format: "Location|Room"
                const [loc] = room.split('|', 2);
                return newLocations.includes(loc);
              }
              // Single location format: just room name (only valid if exactly one location remains)
              return newLocations.length === 1;
            })
          );
        }
        return newLocations;
      } else {
        return [...prev, code];
      }
    });
  };

  const toggleRoom = (roomKey: string) => {
    setSelectedRooms(prev => 
      prev.includes(roomKey)
        ? prev.filter(r => r !== roomKey)
        : [...prev, roomKey]
    );
  };

  const toggleDescription = (desc: string) => {
    setSelectedDescriptions(prev => 
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

  const clearFilters = () => {
    setSelectedLocations([]);
    setSelectedRooms([]);
    setSelectedDescriptions([]);
    setSelectedStatuses([]);
  };

  const removeLocation = (code: string) => {
    toggleLocation(code);
  };

  const removeRoom = (roomKey: string) => {
    toggleRoom(roomKey);
  };

  const removeDescription = (desc: string) => {
    toggleDescription(desc);
  };

  const removeStatus = (status: string) => {
    toggleStatus(status);
  };

  const hasActiveFilters = selectedLocations.length > 0 || 
    selectedRooms.length > 0 || 
    selectedDescriptions.length > 0 ||
    selectedStatuses.length > 0;

  // Get available rooms for selected building
  const availableRooms = useMemo(() => {
    if (!newEquipmentLocation) return [];
    const building = data.find(b => b.code === newEquipmentLocation);
    if (!building) return [];
    return building.maintenanceRooms
      .map(r => r.RoomNumber)
      .filter((room, index, arr) => arr.indexOf(room) === index) // Unique
      .sort();
  }, [data, newEquipmentLocation]);

  const handleCreate = () => {
    if (!canEdit) return;
    setIsAddingEquipment(true);
    // Pre-select first building if available
    if (data.length > 0 && !newEquipmentLocation) {
      setNewEquipmentLocation(data[0].code);
    }
  };

  // Reset room when building changes
  useEffect(() => {
    if (isAddingEquipment) {
      setNewEquipmentRoom('');
    }
  }, [newEquipmentLocation, isAddingEquipment]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files: File[] = Array.from(e.target.files);
    const tempIds = files.map((_, idx) => `temp-${Date.now()}-${idx}`);
    const inputElement = e.target;
    
    // Mark all as uploading
    setUploadingImageIds(new Set(tempIds));
    setIsUploadingImages(true);
    
    try {
      const uploadPromises = files.map(async (file, idx) => {
        const tempId = tempIds[idx];
        try {
          const url = await api.uploadFile(file);
          // Remove from uploading set
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
      // Use functional update to ensure we have the latest state
      setNewEquipmentImages(prev => [...prev, ...urls]);
    } catch (err) {
      showToast("Failed to upload some images. Please try again.", 'error');
    } finally {
      setIsUploadingImages(false);
      setUploadingImageIds(new Set());
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
  };

  const handlePhotoDelete = async (imageUrl: string) => {
    try {
      await api.deleteImage(imageUrl);
      setNewEquipmentImages(prev => prev.filter(img => img !== imageUrl));
      showToast("Image deleted successfully", 'success');
    } catch (err) {
      showToast("Failed to delete image", 'error');
    }
  };

  const handleSaveNewEquipment = async () => {
    if (!newEquipmentName.trim()) {
      showToast("Equipment name is required", 'warning');
      return;
    }
    if (!newEquipmentLocation) {
      showToast("Please select a location", 'warning');
      return;
    }
    
    setIsSaving(true);
    try {
      const selectedBuilding = data.find(b => b.code === newEquipmentLocation);
      const newEq: Equipment = {
        id: `EQ-NEW-${Date.now()}`,
        Equipment: newEquipmentName.trim(),
        EquipmentDesc: newEquipmentDesc.trim(),
        Notes: newEquipmentNotes.trim(),
        Location: newEquipmentLocation,
        LocationDesc: selectedBuilding?.name || '',
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
      
      // Save the equipment
      await onSaveEquipment(newEq);
      
      // Navigate to the detail page
      onSelectEquipment(newEq);
      navigate(`/equipment/${newEq.id}`);
      
      // Reset form
      setIsAddingEquipment(false);
      setNewEquipmentName('');
      setNewEquipmentDesc('');
      setNewEquipmentLocation('');
      setNewEquipmentRoom('');
      setNewEquipmentManufacturer('');
      setNewEquipmentVendor('');
      setNewEquipmentSerialNum('');
      setNewEquipmentNotes('');
      setNewEquipmentStatus('UNKNOWN');
      setNewEquipmentImages([]);
      setUploadingImageIds(new Set());
      showToast("Equipment created successfully", 'success');
    } catch (error) {
      showToast("Failed to create equipment. Please try again.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelAddEquipment = async () => {
    // Delete any uploaded images that weren't saved
    if (newEquipmentImages.length > 0) {
      try {
        await Promise.all(newEquipmentImages.map(url => api.deleteImage(url)));
      } catch (err) {
        console.error("Failed to delete some images:", err);
      }
    }
    
    setIsAddingEquipment(false);
    setNewEquipmentName('');
    setNewEquipmentDesc('');
    setNewEquipmentLocation('');
    setNewEquipmentRoom('');
    setNewEquipmentManufacturer('');
    setNewEquipmentVendor('');
    setNewEquipmentSerialNum('');
    setNewEquipmentNotes('');
    setNewEquipmentImages([]);
    setUploadingImageIds(new Set());
  };

  const handleExport = () => {
    const headers = [
      "Equipment", "EquipmentDesc", "Notes", "Location", "LocationDesc", "Room", 
      "Key For Access", "CreationDate", "AssetTag", "SerialNum", "PurchaseDate", 
      "FailureClass", "Hazardous", "Instructions", "ItemNum", "Manufacturer", 
      "PurchaseDate", "PurchasePrice", "Vendor", "WarrantyDate"
    ];
    const csvContent = allEquipment.map(e => {
      return [
        e.Equipment, e.EquipmentDesc, e.Notes, e.Location, e.LocationDesc, e.Room, e.KeyAccess,
        "", e.AssetTag, e.SerialNum, e.PurchaseDate, "", "", "", "", e.Manufacturer,
        e.PurchaseDate, "", e.Vendor, e.WarrantyDate
      ].map(field => `"${(field || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    const csvString = [headers.join(','), ...csvContent].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Equipment Directory</h1>
          <p className="text-slate-500 text-sm mt-1.5">{filtered.length} assets found</p>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search equipment..." 
              className="w-full pl-10 pr-4 py-2 h-9 bg-white border-slate-200 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex space-x-2">
            <button onClick={handleExport} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap transition-colors">
              <Download size={16} className="mr-2" /> Export
            </button>
            {canEdit && (
              <button onClick={handleCreate} className="bg-brand-600 text-white px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-brand-700 whitespace-nowrap transition-colors shadow-sm">
                <Plus size={16} className="mr-2" /> Add
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Section with Dropdowns */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-medium text-slate-700">Filters:</span>
          
          {/* Location Filter Dropdown */}
          <div className="relative" ref={locationDropdownRef}>
            <button
              onClick={() => {
                setShowLocationFilter(!showLocationFilter);
                setShowRoomFilter(false);
                setShowDescriptionFilter(false);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                selectedLocations.length > 0
                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Building size={14} />
              Location
              {selectedLocations.length > 0 && (
                <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {selectedLocations.length}
                </span>
              )}
              <ChevronDown size={14} className={showLocationFilter ? 'transform rotate-180' : ''} />
            </button>
            
            {showLocationFilter && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-3">
                  <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                    Select Locations ({locationOptions.length})
                  </div>
                  <div className="space-y-1.5">
                    {locationOptions.length > 0 ? (
                      locationOptions.map(loc => (
                        <label
                          key={loc.code}
                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedLocations.includes(loc.code)}
                            onChange={() => toggleLocation(loc.code)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700 flex-1">
                            {loc.name} ({loc.code})
                          </span>
                          <span className="text-xs text-slate-400">
                            ({loc.count})
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No location data available</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Room Filter Dropdown - Only show when locations are selected */}
          {selectedLocations.length > 0 && (
            <div className="relative" ref={roomDropdownRef}>
              <button
                onClick={() => {
                  setShowRoomFilter(!showRoomFilter);
                  setShowLocationFilter(false);
                  setShowDescriptionFilter(false);
                }}
              className={`flex items-center gap-2 px-3 py-1.5 h-8 rounded-md border text-sm font-medium transition-colors ${
                selectedRooms.length > 0
                  ? 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
              >
                <MapPin size={14} />
                Room
                {selectedRooms.length > 0 && (
                  <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {selectedRooms.length}
                  </span>
                )}
                <ChevronDown size={14} className={showRoomFilter ? 'transform rotate-180' : ''} />
              </button>
              
              {showRoomFilter && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  <div className="p-3">
                    <div className="text-xs font-bold text-slate-600 uppercase mb-2">
                      Select Rooms ({roomOptions.length})
                    </div>
                    <div className="space-y-1.5">
                      {roomOptions.length > 0 ? (
                        roomOptions.map(room => {
                          const roomKey = selectedLocations.length > 1 
                            ? `${room.location}|${room.room}`
                            : room.room;
                          
                          return (
                            <label
                              key={`${room.location}-${room.room}`}
                              className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedRooms.includes(roomKey)}
                                onChange={() => toggleRoom(roomKey)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-slate-700 flex-1">
                                {selectedLocations.length > 1 
                                  ? `${room.location}-${room.room}`
                                  : room.room
                                }
                              </span>
                              <span className="text-xs text-slate-400">
                                ({room.count})
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic">No room data available for selected locations</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description Filter Dropdown */}
          <div className="relative" ref={descriptionDropdownRef}>
            <button
              onClick={() => {
                setShowDescriptionFilter(!showDescriptionFilter);
                setShowLocationFilter(false);
                setShowRoomFilter(false);
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
                          key={desc.value}
                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDescriptions.includes(desc.value)}
                            onChange={() => toggleDescription(desc.value)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700 flex-1 line-clamp-1" title={desc.value}>
                            {desc.value}
                          </span>
                          <span className="text-xs text-slate-400">
                            ({desc.count})
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
                setShowLocationFilter(false);
                setShowRoomFilter(false);
                setShowDescriptionFilter(false);
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
          {hasActiveFilters && (
            <>
              {selectedLocations.map(code => {
                const loc = locationOptions.find(l => l.code === code);
                return (
                  <div
                    key={code}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm"
                  >
                    <Building size={12} />
                    <span>{loc?.name || code}</span>
                    <button
                      onClick={() => removeLocation(code)}
                      className="hover:bg-brand-200 rounded p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              
              {selectedRooms.map(roomKey => {
                const room = roomOptions.find(r => {
                  const key = selectedLocations.length > 1 
                    ? `${r.location}|${r.room}`
                    : r.room;
                  return key === roomKey;
                });
                const displayName = room 
                  ? (selectedLocations.length > 1 ? `${room.location}-${room.room}` : room.room)
                  : roomKey;
                return (
                  <div
                    key={roomKey}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm"
                  >
                    <MapPin size={12} />
                    <span>{displayName}</span>
                    <button
                      onClick={() => removeRoom(roomKey)}
                      className="hover:bg-brand-200 rounded p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              
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
          Showing {filtered.length} of {allEquipment.length} equipment
        </div>
      </div>


      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-3.5 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">ID</th>
                <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Building</th>
                <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Room</th>
                {/*<th className="py-3.5 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>*/}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedItems.length > 0 ? (
                displayedItems.map((e) => (
                  <tr 
                    key={e.id} 
                    onClick={() => { onSelectEquipment(e); navigate(`/equipment/${e.id}`); }}
                    className="hover:bg-slate-50 group transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-6 font-mono text-sm font-medium text-brand-600">{e.Equipment}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-700 max-w-xs lg:max-w-md truncate">{e.EquipmentDesc || "N/A"}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-700">{e.Location}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-700">{e.Room || "-"}</td>
                    {/*<td className="py-3 pr-6">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        e.status === 'OPERATING' ? 'bg-green-100 text-green-700' :
                        e.status === 'REPAIR' ? 'bg-red-100 text-red-700' :
                        e.status === 'INACTIVE' ? 'bg-slate-100 text-slate-600' :
                        e.status === 'ONSHELF' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {e.status || 'UNKNOWN'}
                      </span>
                    </td>*/}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {hasActiveFilters || searchTerm 
                      ? "No equipment matches the selected filters"
                      : "No equipment found"
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {displayedItems.length > 0 ? (
            displayedItems.map((e) => (
              <div 
                key={e.id} 
                onClick={() => { onSelectEquipment(e); navigate(`/equipment/${e.id}`); }}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="font-mono text-sm font-medium text-brand-700">{e.Equipment}</div>
                  <div className="text-xs text-slate-400 font-medium">{e.Location}</div>
                </div>
                <div className="text-sm text-slate-600 mb-2 line-clamp-2">
                  {e.EquipmentDesc || "N/A"}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div>
                    {e.Room && <><span className="font-medium">Room:</span> {e.Room}</>}
                  </div>
                  {/*<span className={`font-medium px-2 py-0.5 rounded-full ${
                    e.status === 'OPERATING' ? 'bg-green-100 text-green-700' :
                    e.status === 'REPAIR' ? 'bg-red-100 text-red-700' :
                    e.status === 'INACTIVE' ? 'bg-slate-100 text-slate-600' :
                    e.status === 'ONSHELF' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {e.status || 'UNKNOWN'}
                  </span>*/}
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-slate-400">
              {hasActiveFilters || searchTerm 
                ? "No equipment matches the selected filters"
                : "No equipment found"
              }
            </div>
          )}
        </div>

        {/* Show More / Pagination */}
        {hasMoreItems && (
          <div className="p-4 border-t border-slate-100 text-center">
            <button
              onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              className="px-6 py-2 bg-brand-100 text-brand-700 rounded-lg font-medium hover:bg-brand-200 transition-colors"
            >
              Show more ({filtered.length - displayLimit} remaining)
            </button>
          </div>
        )}
        
        {/* Item count summary */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-sm text-slate-500">
          Showing {displayedItems.length} of {filtered.length} items
          {filtered.length !== allEquipment.length && ` (${allEquipment.length} total)`}
        </div>
      </div>

      {/* Add Equipment Modal */}
      {canEdit && isAddingEquipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 animate-fade-in my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">Add New Equipment</h2>
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
                    if (e.key === 'Enter' && newEquipmentLocation && newEquipmentName.trim()) {
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
                    if (e.key === 'Enter' && newEquipmentLocation && newEquipmentName.trim()) {
                      handleSaveNewEquipment();
                    }
                  }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">
                  Building <span className="text-red-500">*</span>
                </label>
                <select
                  value={newEquipmentLocation}
                  onChange={(e) => setNewEquipmentLocation(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  required
                >
                  <option value="">Select a building...</option>
                  {data.map(building => (
                    <option key={building.code} value={building.code}>
                      {building.name} ({building.code})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">
                  Room
                </label>
                <select
                  value={newEquipmentRoom}
                  onChange={(e) => setNewEquipmentRoom(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  disabled={!newEquipmentLocation}
                >
                  <option value="">Select a room (optional)</option>
                  {availableRooms.map(room => (
                    <option key={room} value={room}>{room}</option>
                  ))}
                </select>
                {!newEquipmentLocation && (
                  <p className="text-xs text-slate-400 mt-1">Please select a building first</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={newEquipmentStatus}
                  onChange={(e) => setNewEquipmentStatus(e.target.value as 'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN')}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
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
              
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">
                  Notes
                </label>
                <textarea
                  value={newEquipmentNotes}
                  onChange={(e) => setNewEquipmentNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-y min-h-[80px]"
                  placeholder="Additional notes about this equipment..."
                />
              </div>
              
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
                          onClick={() => handlePhotoDelete(img)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Uploading Placeholders */}
                {uploadingImageIds.size > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {Array.from(uploadingImageIds).map((tempId) => (
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
                  <label className={`flex-1 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingImages ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isUploadingImages ? (
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
                      ref={uploadInputRef}
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      multiple
                      onChange={handlePhotoUpload}
                      disabled={isUploadingImages}
                    />
                  </label>
                  <label className={`flex-1 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isUploadingImages ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isUploadingImages ? (
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
                      ref={cameraInputRef}
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      capture="environment"
                      multiple
                      onChange={handlePhotoUpload}
                      disabled={isUploadingImages}
                    />
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCancelAddEquipment}
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewEquipment}
                disabled={isSaving || !newEquipmentName.trim() || !newEquipmentLocation}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating...' : 'Create Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

