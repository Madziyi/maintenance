import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Building, Layers, FileText, X, Plus, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BuildingData, MaintenanceRoom } from '@/types';
import { useToast } from '../common/Toast';
import { fuzzyMatch } from '@/src/utils/fuzzySearch';

interface RoomListProps {
  data: BuildingData[];
  onSaveRoom: (room: MaintenanceRoom, buildingCode: string) => Promise<MaintenanceRoom | null>;
  canEdit: boolean;
}

export const RoomList: React.FC<RoomListProps> = ({
  data,
  onSaveRoom,
  canEdit,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const allRooms = data.flatMap(b => b.maintenanceRooms);
  
  // Load filter state from sessionStorage on mount
  const loadFilterState = () => {
    try {
      const saved = sessionStorage.getItem('roomListFilters');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          searchTerm: parsed.searchTerm || '',
          selectedLocations: parsed.selectedLocations || [],
          selectedFloors: parsed.selectedFloors || [],
          selectedDescriptions: parsed.selectedDescriptions || [],
        };
      }
    } catch (e) {
      console.error('Failed to load filter state:', e);
    }
    return {
      searchTerm: '',
      selectedLocations: [],
      selectedFloors: [],
      selectedDescriptions: [],
    };
  };

  const savedFilterState = loadFilterState();
  
  // Local search state (avoids re-rendering entire App on each keystroke)
  const [searchTerm, setSearchTerm] = useState(savedFilterState.searchTerm);
  
  // Add Room state
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [newRoomBuilding, setNewRoomBuilding] = useState('');
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Filter state
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [showFloorFilter, setShowFloorFilter] = useState(false);
  const [showDescriptionFilter, setShowDescriptionFilter] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(savedFilterState.selectedLocations);
  const [selectedFloors, setSelectedFloors] = useState<string[]>(savedFilterState.selectedFloors);
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>(savedFilterState.selectedDescriptions);
  
  // Save filter state to sessionStorage whenever filters change
  useEffect(() => {
    try {
      sessionStorage.setItem('roomListFilters', JSON.stringify({
        searchTerm,
        selectedLocations,
        selectedFloors,
        selectedDescriptions,
      }));
    } catch (e) {
      console.error('Failed to save filter state:', e);
    }
  }, [searchTerm, selectedLocations, selectedFloors, selectedDescriptions]);
  
  // Refs for dropdowns
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const floorDropdownRef = useRef<HTMLDivElement>(null);
  const descriptionDropdownRef = useRef<HTMLDivElement>(null);
  const SCROLL_KEY = 'roomListScroll';
  
  // Restore scroll position when component mounts
  useEffect(() => {
    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
    if (savedScroll) {
      setTimeout(() => {
        const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
        }
      }, 0);
    }
  }, []);

  // Save scroll position as user scrolls
  useEffect(() => {
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
    if (!scrollContainer) return;

    const handleScroll = () => {
      sessionStorage.setItem(SCROLL_KEY, scrollContainer.scrollTop.toString());
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setShowLocationFilter(false);
      }
      if (floorDropdownRef.current && !floorDropdownRef.current.contains(event.target as Node)) {
        setShowFloorFilter(false);
      }
      if (descriptionDropdownRef.current && !descriptionDropdownRef.current.contains(event.target as Node)) {
        setShowDescriptionFilter(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract unique locations with building names
  const locationOptions = useMemo(() => {
    const locations = data
      .filter(b => b.maintenanceRooms.length > 0)
      .map(b => ({
        code: b.code,
        name: b.name,
        count: b.maintenanceRooms.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return locations;
  }, [data]);

  // Extract floors (only from selected locations)
  const floorOptions = useMemo(() => {
    if (selectedLocations.length === 0) return [];
    
    const relevantRooms = allRooms.filter(r => 
      selectedLocations.includes(r.Building)
    );
    
    const floors = relevantRooms
      .map(r => ({
        floor: r.Floor?.trim() || '',
        location: r.Building
      }))
      .filter(f => f.floor && f.floor !== '') // Exclude empty
      .filter((f, i, arr) => {
        // Unique by location + floor combination
        return arr.findIndex(item => 
          item.location === f.location && item.floor === f.floor
        ) === i;
      })
      .map(f => ({
        floor: f.floor,
        location: f.location,
        count: relevantRooms.filter(r => 
          r.Building === f.location && r.Floor?.trim() === f.floor
        ).length
      }))
      .sort((a, b) => {
        // Sort by location first, then floor
        if (a.location !== b.location) {
          return a.location.localeCompare(b.location);
        }
        return a.floor.localeCompare(b.floor);
      });
    
    return floors;
  }, [allRooms, selectedLocations]);

  // Extract unique descriptions (exact match, preserve casing)
  const descriptionOptions = useMemo(() => {
    const descriptions = allRooms
      .map(r => r.Description?.trim())
      .filter(d => d && d !== '') // Exclude empty
      .filter((d, i, arr) => {
        // Case-insensitive uniqueness check, but preserve original casing
        const lower = d.toLowerCase();
        return arr.findIndex(item => item.toLowerCase() === lower) === i;
      })
      .map(desc => ({
        value: desc,
        count: allRooms.filter(r => 
          r.Description?.trim().toLowerCase() === desc.toLowerCase()
        ).length
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
    return descriptions;
  }, [allRooms]);

  // Filtered rooms
  const filtered = useMemo(() => {
    return allRooms.filter(room => {
      // Fuzzy search filter (handles typos and similar words)
      const searchMatch = fuzzyMatch(
        room,
        searchTerm,
        ['RoomNumber', 'Description', 'Building'],
        { threshold: 0.4 } // Balanced: allows ~60% similarity
      );
      
      // Location filter
      const locationMatch = selectedLocations.length === 0 || 
        selectedLocations.includes(room.Building);
      
      // Floor filter (must match both location and floor)
      const floorMatch = selectedFloors.length === 0 || 
        selectedFloors.some(selected => {
          // Format: "Location|Floor" if multiple locations (pipe separator), or just "Floor" if single location
          if (selected.includes('|') && selectedLocations.length > 1) {
            // Multiple locations: format is "Location|Floor"
            const [loc, floor] = selected.split('|', 2);
            return room.Building === loc && room.Floor?.trim() === floor;
          } else {
            // Single location selected, floor format is just floor name
            return selectedLocations.length === 1 && 
                   selectedLocations.includes(room.Building) && 
                   room.Floor?.trim() === selected;
          }
        });
      
      // Description filter (exact match, case-insensitive)
      const descMatch = selectedDescriptions.length === 0 ||
        selectedDescriptions.some(selected => 
          room.Description?.trim().toLowerCase() === selected.toLowerCase()
        );
      
      return searchMatch && locationMatch && floorMatch && descMatch;
    });
  }, [allRooms, searchTerm, selectedLocations, selectedFloors, selectedDescriptions]);

  // Pagination - limit displayed items for performance
  const ITEMS_PER_PAGE = 50;
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(ITEMS_PER_PAGE);
  }, [searchTerm, selectedLocations, selectedFloors, selectedDescriptions]);
  
  const displayedItems = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);
  const hasMoreItems = filtered.length > displayLimit;

  // Toggle functions
  const toggleLocation = (code: string) => {
    setSelectedLocations(prev => {
      if (prev.includes(code)) {
        const newLocations = prev.filter(l => l !== code);
        // Clear floor selections if location is removed
        if (newLocations.length === 0) {
          setSelectedFloors([]);
        } else {
          // Remove floors that are no longer valid
          setSelectedFloors(prevFloors => 
            prevFloors.filter(floor => {
              if (floor.includes('|')) {
                // Multiple locations format: "Location|Floor"
                const [loc] = floor.split('|', 2);
                return newLocations.includes(loc);
              }
              // Single location format: just floor name (only valid if exactly one location remains)
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

  const toggleFloor = (floorKey: string) => {
    setSelectedFloors(prev => 
      prev.includes(floorKey)
        ? prev.filter(f => f !== floorKey)
        : [...prev, floorKey]
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
    setSelectedLocations([]);
    setSelectedFloors([]);
    setSelectedDescriptions([]);
  };

  const removeLocation = (code: string) => {
    toggleLocation(code);
  };

  const removeFloor = (floorKey: string) => {
    toggleFloor(floorKey);
  };

  const removeDescription = (desc: string) => {
    toggleDescription(desc);
  };

  const hasActiveFilters = selectedLocations.length > 0 || 
    selectedFloors.length > 0 || 
    selectedDescriptions.length > 0;

  // Get building name for a room
  const getBuildingName = (code: string) => {
    const building = data.find(b => b.code === code);
    return building?.name || code;
  };

  // Export rooms to CSV
  const handleExport = () => {
    const headers = [
      "Building Code", "Building Name", "Room Number", "Floor", "Description", "Notes"
    ];
    const csvContent = allRooms.map(room => {
      return [
        room.Building,
        getBuildingName(room.Building),
        room.RoomNumber,
        room.Floor || "",
        room.Description || "",
        room.Notes || ""
      ].map(field => `"${(field || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    const csvString = [headers.join(','), ...csvContent].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rooms_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add Room handlers
  const handleCreateRoom = () => {
    if (!canEdit) return;
    setIsAddingRoom(true);
    // Pre-select first building if available
    if (data.length > 0 && !newRoomBuilding) {
      setNewRoomBuilding(data[0].code);
    }
  };

  const handleSaveNewRoom = async () => {
    if (!newRoomNumber.trim()) {
      showToast("Room number is required", 'warning');
      return;
    }
    if (!newRoomBuilding) {
      showToast("Please select a building", 'warning');
      return;
    }
    
    setIsSaving(true);
    try {
      const newRoom: MaintenanceRoom = {
        id: `${newRoomBuilding}-NEW-${Date.now()}`,
        Building: newRoomBuilding,
        RoomNumber: newRoomNumber.trim(),
        Description: newRoomDescription.trim() || 'Maintenance Room',
        Floor: newRoomFloor.trim(),
        floorPlanId: undefined,
        Notes: ''
      };
      
      const savedRoom = await onSaveRoom(newRoom, newRoomBuilding);
      
      if (savedRoom) {
        setIsAddingRoom(false);
        setNewRoomBuilding('');
        setNewRoomNumber('');
        setNewRoomFloor('');
        setNewRoomDescription('');
        navigate(`/building/${newRoomBuilding}/room/${savedRoom.id}`);
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
    setNewRoomBuilding('');
    setNewRoomNumber('');
    setNewRoomFloor('');
    setNewRoomDescription('');
  };

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-lg border border-slate-200">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">All Rooms</h1>
          <p className="text-slate-500 text-sm mt-1.5">{filtered.length} rooms found</p>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search rooms..." 
              className="w-full pl-10 pr-4 py-2 h-9 bg-white border-slate-200 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={handleExport} 
              className="bg-white border border-slate-200 text-slate-700 px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap transition-colors"
            >
              <Download size={16} className="mr-2" /> Export
            </button>
            {canEdit && (
              <button 
                onClick={handleCreateRoom} 
                className="bg-brand-600 text-white px-4 py-2 h-9 rounded-md text-sm font-medium flex items-center justify-center hover:bg-brand-700 whitespace-nowrap transition-colors shadow-sm"
              >
                <Plus size={16} className="mr-2" /> Add Room
              </button>
            )}
          </div>
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
                  Building <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRoomBuilding}
                  onChange={(e) => setNewRoomBuilding(e.target.value)}
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
                    if (e.key === 'Enter' && newRoomBuilding && newRoomNumber.trim()) {
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
                    if (e.key === 'Enter' && newRoomBuilding && newRoomNumber.trim()) {
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
                    if (e.key === 'Enter' && newRoomBuilding && newRoomNumber.trim()) {
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
                disabled={isSaving || !newRoomNumber.trim() || !newRoomBuilding}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Section with Dropdowns */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-medium text-slate-700">Filters:</span>
          
          {/* Location Filter Dropdown */}
          <div className="relative" ref={locationDropdownRef}>
            <button
              onClick={() => {
                setShowLocationFilter(!showLocationFilter);
                setShowFloorFilter(false);
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

          {/* Floor Filter Dropdown - Only show when locations are selected */}
          {selectedLocations.length > 0 && (
            <div className="relative" ref={floorDropdownRef}>
              <button
                onClick={() => {
                  setShowFloorFilter(!showFloorFilter);
                  setShowLocationFilter(false);
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
                        floorOptions.map(floor => {
                          const floorKey = selectedLocations.length > 1 
                            ? `${floor.location}|${floor.floor}`
                            : floor.floor;
                          
                          return (
                            <label
                              key={`${floor.location}-${floor.floor}`}
                              className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedFloors.includes(floorKey)}
                                onChange={() => toggleFloor(floorKey)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-slate-700 flex-1">
                                {selectedLocations.length > 1 
                                  ? `${floor.location}-${floor.floor}`
                                  : floor.floor
                                }
                              </span>
                              <span className="text-xs text-slate-400">
                                ({floor.count})
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic">No floor data available for selected locations</p>
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
              
              {selectedFloors.map(floorKey => {
                const floor = floorOptions.find(f => {
                  const key = selectedLocations.length > 1 
                    ? `${f.location}|${f.floor}`
                    : f.floor;
                  return key === floorKey;
                });
                const displayName = floor 
                  ? (selectedLocations.length > 1 ? `${floor.location}-${floor.floor}` : floor.floor)
                  : floorKey;
                return (
                  <div
                    key={floorKey}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm"
                  >
                    <Layers size={12} />
                    <span>{displayName}</span>
                    <button
                      onClick={() => removeFloor(floorKey)}
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
          Showing {filtered.length} of {allRooms.length} rooms
        </div>
      </div>

      {/* Rooms List Table - Part of page scroll */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                <th className="py-3 pl-6">Room #</th>
                <th className="py-3">Building</th>
                <th className="py-3">Floor</th>
                <th className="py-3 pr-6">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedItems.length > 0 ? (
                displayedItems.map((room) => (
                  <tr 
                    key={room.id} 
                    onClick={() => navigate(`/building/${room.Building}/room/${room.id}`)}
                    className="hover:bg-slate-50 group transition-colors cursor-pointer"
                  >
                    <td className="py-3 pl-6 font-bold text-sm text-slate-700">{room.RoomNumber}</td>
                    <td className="py-3 text-sm text-slate-600">{getBuildingName(room.Building)} ({room.Building})</td>
                    <td className="py-3 text-sm text-slate-600">{room.Floor || "—"}</td>
                    <td className="py-3 text-sm text-slate-600 pr-6 max-w-xs lg:max-w-md truncate">{room.Description || "N/A"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    {hasActiveFilters || searchTerm 
                      ? "No rooms match the selected filters"
                      : "No rooms found"
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
            displayedItems.map((room) => (
              <div 
                key={room.id} 
                onClick={() => navigate(`/building/${room.Building}/room/${room.id}`)}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="font-bold text-sm text-slate-700">{room.RoomNumber}</div>
                  <div className="text-xs text-slate-400 font-medium">{room.Building}</div>
                </div>
                <div className="text-sm text-slate-600 mb-2 line-clamp-2">
                  {room.Description || "N/A"}
                </div>
                {room.Floor && (
                  <div className="text-xs text-slate-500">
                    <span className="font-medium">Floor:</span> {room.Floor}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-slate-400">
              {hasActiveFilters || searchTerm 
                ? "No rooms match the selected filters"
                : "No rooms found"
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
          {filtered.length !== allRooms.length && ` (${allRooms.length} total)`}
        </div>
      </div>
    </div>
  );
};
