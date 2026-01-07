import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building as BuildingIcon, 
  Search, 
  MapPin, 
  Wrench, 
  ChevronRight, 
  ArrowLeft,
  Camera,
  Upload,
  Image as ImageIcon,
  Plus,
  X,
  Target,
  Pencil,
  Save,
  Ban,
  DoorOpen,
  Map,
  Link as LinkIcon,
  Check,
  Menu,
  Download,
  Maximize2,
  ExternalLink,
  Trash2,
  Home,
  Database,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BuildingData, Equipment, MaintenanceRoom, ViewState, FloorPlan } from './types';
import { api } from './api';

const App = () => {
  const [data, setData] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Selection States
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingData | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<MaintenanceRoom | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');

  // Image Viewer State
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  
  // Load data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        const result = await api.getAllData();
        setData(result);
        setError(null);
    } catch (err: any) {
        setError("Failed to load data. Ensure Backend is running.");
    } finally {
        setLoading(false);
    }
  };

  const handleSeedDatabase = async () => {
      if(!window.confirm("This will overwrite database with CSV defaults. Continue?")) return;
      setLoading(true);
      try {
          await api.seedDatabase();
          await fetchData();
          alert("Database initialized from CSV!");
      } catch (e) {
          alert("Failed to seed. Check console.");
      } finally {
          setLoading(false);
      }
  };

  // -- Navigation Helpers --
  const resetSelection = () => {
    setSelectedBuilding(null);
    setSelectedEquipment(null);
    setSelectedRoom(null);
    setSearchTerm('');
    setIsMobileMenuOpen(false);
  };

  const navigate = (newView: ViewState) => {
    resetSelection();
    setView(newView);
  };

  // -- Feature: Find Maintenance Room from Equipment --
  const findMaintenanceRoom = (eq: Equipment) => {
    const building = data.find(b => b.code === eq.Location);
    if (!building) {
        alert("Building not found for this equipment.");
        return;
    }
    const room = building.maintenanceRooms.find(r => r.RoomNumber === eq.Room);
    if (!room) {
        // Fallback: Just go to the building list if exact room not found
        setSelectedBuilding(building);
        setView(ViewState.ROOM_LIST);
        return;
    }
    // Found it - Navigate
    setSelectedBuilding(building);
    setSelectedRoom(room);
    setView(ViewState.ROOM_DETAIL);
  };

  // -- Data Modification Helpers --

  const addBuilding = async (code: string, name: string) => {
      // For now, client side update until backend supports explicit CreateBuilding beyond Seed
      // Realistically, Seed handles this, or we adapt API to allow new building creation
      // Implementing local optimistic update + simple API push
      if (data.some(b => b.code === code)) {
          alert("Building code already exists!");
          return;
      }
      const newBuilding: BuildingData = {
          code,
          name,
          maintenanceRooms: [],
          equipment: [],
          floorPlans: [],
          googleMapsLink: '',
          buildingImage: ''
      };
      // Optimistic
      setData([...data, newBuilding].sort((a,b) => a.name.localeCompare(b.name)));
      // Note: We need a backend route for creating a building container if using SQL properly
      // For this demo, we assume the building is created when we add items to it.
  };

  const saveEquipment = async (eq: Equipment) => {
    try {
        const savedEq = await api.saveEquipment(eq);
        
        // Optimistic / Local Update
        const newData = [...data];
        newData.forEach(b => {
             b.equipment = b.equipment.filter(e => e.id !== eq.id);
        });
        
        let target = newData.find(b => b.code === eq.Location);
        if (!target && newData.length > 0) target = newData[0];

        if (target) {
            target.equipment.push(savedEq);
            setData(newData);
            setSelectedEquipment(savedEq);
        }
    } catch (e) {
        alert("Failed to save equipment to cloud.");
    }
  };

  const saveRoom = async (room: MaintenanceRoom, targetBuildingCode: string) => {
      try {
        const savedRoom = await api.saveRoom(room);
        const newData = [...data];
        const building = newData.find(b => b.code === targetBuildingCode);
        if (!building) return;

        const existingIdx = building.maintenanceRooms.findIndex(r => r.id === room.id);
        if (existingIdx >= 0) {
            building.maintenanceRooms[existingIdx] = savedRoom;
        } else {
            building.maintenanceRooms.push(savedRoom);
        }
        setData(newData);
        setSelectedRoom(savedRoom);
      } catch (e) {
        alert("Failed to save room.");
      }
  };

  const updateFloorPlans = async (buildingCode: string, plans: FloorPlan[], newPlan?: FloorPlan) => {
    try {
        if (newPlan) {
            await api.saveFloorPlan(buildingCode, newPlan);
        } else {
            // Handle deletions logic if necessary, or bulk update
            // For simplicity, we assume this function is primarily called for adding
        }
        
        // Local Update
        const newData = [...data];
        const bIndex = newData.findIndex(b => b.code === buildingCode);
        if (bIndex === -1) return;
        newData[bIndex].floorPlans = plans;
        setData(newData);
        if (selectedBuilding && selectedBuilding.code === buildingCode) {
            setSelectedBuilding({...selectedBuilding, floorPlans: plans});
        }
    } catch (e) {
        alert("Failed to update floor plans.");
    }
  };
  
  const deleteFloorPlan = async (buildingCode: string, planId: string) => {
      try {
          await api.deleteFloorPlan(planId);
          const newData = [...data];
          const bIndex = newData.findIndex(b => b.code === buildingCode);
          if (bIndex !== -1) {
              newData[bIndex].floorPlans = newData[bIndex].floorPlans.filter(p => p.id !== planId);
              setData(newData);
              if (selectedBuilding && selectedBuilding.code === buildingCode) {
                   setSelectedBuilding(newData[bIndex]);
              }
          }
      } catch (e) {
          alert("Failed to delete plan.");
      }
  };

  const updateBuilding = async (buildingCode: string, updates: Partial<BuildingData>) => {
    try {
        await api.saveBuilding({ code: buildingCode, ...updates });
        const newData = [...data];
        const bIndex = newData.findIndex(b => b.code === buildingCode);
        if (bIndex === -1) return;
        
        newData[bIndex] = { ...newData[bIndex], ...updates };
        setData(newData);
        
        if (selectedBuilding && selectedBuilding.code === buildingCode) {
            setSelectedBuilding({ ...selectedBuilding, ...updates });
        }
    } catch (e) {
        alert("Failed to update building.");
    }
  };

  // -- Components --

  const FullScreenViewer = () => {
    if (!fullScreenImage) return null;
    return (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
            onClick={() => setFullScreenImage(null)}
        >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full">
                <X size={32} />
            </button>
            <img 
                src={fullScreenImage} 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default" 
                onClick={(e) => e.stopPropagation()} 
                alt="Full screen view"
            />
        </div>
    );
  };

  const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-6 py-3 transition-colors ${active ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-300 hover:bg-brand-900 hover:text-white'}`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  const LoadingScreen = () => (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="animate-spin mb-4" size={48} />
          <p>Connecting to Cloudflare D1...</p>
      </div>
  );

  const Dashboard = () => {
    const totalEquipment = data.reduce((acc, b) => acc + b.equipment.length, 0);
    const totalRooms = data.reduce((acc, b) => acc + b.maintenanceRooms.length, 0);
    const totalPlans = data.reduce((acc, b) => acc + b.floorPlans.length, 0);
    
    const chartData = data.map(b => ({
      name: b.code,
      full: b.name,
      count: b.equipment.length
    })).sort((a,b) => b.count - a.count).slice(0, 10);

    return (
      <div className="space-y-6 animate-fade-in pb-16">
        <header className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Facility Overview</h1>
                <p className="text-slate-500">Welcome to EquipLocate Dashboard</p>
            </div>
            <button 
                onClick={handleSeedDatabase}
                className="text-xs flex items-center bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition-colors"
                title="Initialize Cloudflare D1 with CSV data"
            >
                <Database size={14} className="mr-2"/> Seed DB
            </button>
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
          <div className="h-64 md:h-80">
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

  const EquipmentList = () => {
    const allEquipment = data.flatMap(b => b.equipment);
    const filtered = allEquipment.filter(e => 
        e.Equipment.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.EquipmentDesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.AssetTag.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = () => {
        const newEq: Equipment = {
            id: `EQ-NEW-${Date.now()}`,
            Equipment: 'New Equipment',
            EquipmentDesc: '',
            Notes: '',
            Location: data[0]?.code || '',
            LocationDesc: data[0]?.name || '',
            Room: '',
            KeyAccess: '',
            AssetTag: '',
            SerialNum: '',
            Manufacturer: '',
            Model: '',
            Vendor: '',
            PurchaseDate: '',
            WarrantyDate: '',
            images: []
        };
        setSelectedEquipment(newEq);
        setView(ViewState.EQUIPMENT_DETAIL);
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
        <div className="space-y-6 animate-fade-in h-full flex flex-col pb-16">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Equipment Directory</h1>
                    <p className="text-slate-500 text-sm">{filtered.length} assets found</p>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-grow md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search equipment..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-slate-200 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex space-x-2">
                        <button onClick={handleExport} className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center hover:bg-slate-50 whitespace-nowrap shadow-sm">
                            <Download size={18} className="mr-2" /> Export
                        </button>
                        <button onClick={handleCreate} className="bg-brand-600 text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 whitespace-nowrap shadow-sm">
                            <Plus size={18} className="mr-2" /> Add
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex-grow overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="bg-white shadow-sm z-10 sticky top-0">
                        <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                          <th className="py-3 pl-6">ID</th>
                          <th className="py-3">Description</th>
                          <th className="py-3">Building</th>
                          <th className="py-3">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((e) => (
                          <tr 
                            key={e.id} 
                            onClick={() => { setSelectedEquipment(e); setView(ViewState.EQUIPMENT_DETAIL); }}
                            className="hover:bg-slate-50 group transition-colors cursor-pointer"
                          >
                            <td className="py-3 pl-6 font-mono text-sm font-medium text-brand-700">{e.Equipment}</td>
                            <td className="py-3 text-sm text-slate-600 max-w-xs md:max-w-md truncate pr-4">{e.EquipmentDesc || "N/A"}</td>
                            <td className="py-3 text-sm text-slate-600">{e.Location}</td>
                            <td className="py-3 text-sm text-slate-600">{e.Room || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  const EquipmentDetail = () => {
    if (!selectedEquipment) return null;
    const exists = data.some(b => b.equipment.some(e => e.id === selectedEquipment.id));
    const [isEditing, setIsEditing] = useState(!exists);
    const [form, setForm] = useState(selectedEquipment);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        const b = data.find(b => b.code === form.Location);
        if (b && b.name !== form.LocationDesc) {
            setForm(prev => ({ ...prev, LocationDesc: b.name }));
        }
    }, [form.Location, data]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsUploading(true);
            try {
                const url = await api.uploadFile(e.target.files[0]);
                const updated = { ...form, images: [...(form.images || []), url] };
                setForm(updated);
            } catch (err) {
                alert("Upload failed");
            } finally {
                setIsUploading(false);
            }
        }
    };

    const saveChanges = async () => {
        setIsUploading(true);
        await saveEquipment(form);
        setIsUploading(false);
        setIsEditing(false);
    };

    return (
        <div key={selectedEquipment.id} className="max-w-5xl mx-auto space-y-6 pb-20 animate-fade-in">
             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                <button onClick={() => setView(ViewState.EQUIPMENT_LIST)} className="flex items-center text-slate-500 hover:text-brand-600 transition-colors font-medium">
                    <ArrowLeft size={20} className="mr-1" /> Back to List
                </button>
                <div className="flex space-x-2 self-end sm:self-auto">
                    {isEditing ? (
                        <>
                            {exists && <button onClick={() => { setForm(selectedEquipment); setIsEditing(false); }} className="flex items-center px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium">Cancel</button>}
                            <button disabled={isUploading} onClick={saveChanges} className="flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium disabled:opacity-50">
                                {isUploading ? "Saving..." : "Save"}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="flex items-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium">
                            <Pencil size={16} className="mr-2" /> Edit
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-100">
                <div className="p-6 md:p-8 bg-gradient-to-r from-brand-900 to-brand-700 text-white">
                    {isEditing ? (
                         <div className="space-y-4">
                            <input value={form.Equipment} onChange={e => setForm({...form, Equipment: e.target.value})} className="text-2xl md:text-3xl font-bold bg-white/10 p-2 rounded w-full border border-white/20 text-white placeholder-white/50" placeholder="Equipment Name"/>
                            <input value={form.EquipmentDesc} onChange={e => setForm({...form, EquipmentDesc: e.target.value})} className="text-base md:text-lg bg-white/10 p-2 rounded w-full border border-white/20 text-white placeholder-white/50" placeholder="Description"/>
                         </div>
                    ) : (
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold break-all">{selectedEquipment.Equipment}</h1>
                            <p className="text-brand-100 mt-2 text-base md:text-lg">{selectedEquipment.EquipmentDesc}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
                     <div className="lg:col-span-2 space-y-8">
                        <section>
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                                <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider">
                                    <MapPin className="mr-2 text-brand-500" size={18} /> Location
                                </h3>
                                {!isEditing && (
                                    <button onClick={() => findMaintenanceRoom(selectedEquipment)} className="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded font-bold hover:bg-brand-100 flex items-center">
                                        <Target size={14} className="mr-1"/> Find Room
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                                <div>
                                    <dt className="text-slate-500 text-xs uppercase font-bold mb-1">Building</dt>
                                    {isEditing ? (
                                        <select value={form.Location} onChange={e => setForm({...form, Location: e.target.value})} className="border rounded p-2 w-full text-sm">
                                            {data.map(b => (
                                                <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <dd className="font-medium text-slate-800 text-lg">{form.LocationDesc} <span className="text-sm text-slate-400">({form.Location})</span></dd>
                                    )}
                                </div>
                                <div>
                                    <dt className="text-slate-500 text-xs uppercase font-bold mb-1">Room</dt>
                                    {isEditing ? (
                                        <input value={form.Room} onChange={e => setForm({...form, Room: e.target.value})} className="border rounded p-2 w-full" />
                                    ) : (
                                        <dd className="font-medium text-slate-800 text-lg">{form.Room || "N/A"}</dd>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                                <Wrench className="mr-2 text-brand-500" size={18} /> Details
                            </h3>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {[
                                    {label: "Manufacturer", key: "Manufacturer"},
                                    {label: "Serial Number", key: "SerialNum"},
                                ].map(({label, key}) => (
                                    <div key={key}>
                                        <dt className="text-slate-500 text-sm mb-1">{label}</dt>
                                        {isEditing ? (
                                            // @ts-ignore
                                            <input value={form[key] || ''} onChange={e => setForm({...form, [key]: e.target.value})} className="border rounded p-2 w-full text-sm" />
                                        ) : (
                                            // @ts-ignore
                                            <dd className="font-medium text-slate-800 break-words">{form[key] || "-"}</dd>
                                        )}
                                    </div>
                                ))}
                            </dl>
                        </section>
                     </div>

                     <div className="space-y-4">
                        <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                            <Camera className="mr-2 text-brand-500" size={18} /> Photos
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            {form.images?.map((img, idx) => (
                                <div key={idx} className="relative rounded-lg overflow-hidden aspect-video border border-slate-200 group cursor-zoom-in" onClick={() => setFullScreenImage(img)}>
                                    <img src={img} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                    {isEditing && (
                                        <button onClick={(e) => { e.stopPropagation(); setForm({...form, images: form.images.filter((_, i) => i !== idx)}); }} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10">
                                            <X size={12}/>
                                        </button>
                                    )}
                                </div>
                            ))}
                            {isEditing && (
                                <label className={`border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center aspect-video cursor-pointer hover:bg-slate-50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {isUploading ? <RefreshCw className="animate-spin text-slate-400"/> : <Plus size={24} className="text-slate-400" />}
                                    <span className="text-sm text-slate-500 mt-2">{isUploading ? 'Uploading...' : 'Add Photo'}</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                </label>
                            )}
                        </div>
                     </div>
                </div>
            </div>
        </div>
    );
  };

  const RoomList = () => {
    const [isAddingBuilding, setIsAddingBuilding] = useState(false);
    const [newBuildingCode, setNewBuildingCode] = useState('');
    const [newBuildingName, setNewBuildingName] = useState('');

    if (!selectedBuilding) {
        const filtered = data.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const handleAddBuilding = () => {
            if (!newBuildingCode || !newBuildingName) return;
            addBuilding(newBuildingCode, newBuildingName);
            setIsAddingBuilding(false);
            setNewBuildingCode('');
            setNewBuildingName('');
        };

        return (
            <div className="space-y-6 pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <h1 className="text-2xl font-bold text-slate-800">Maintenance Rooms</h1>
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-grow md:w-64">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                            <input type="text" placeholder="Filter buildings..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                        </div>
                        <button onClick={() => setIsAddingBuilding(!isAddingBuilding)} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 whitespace-nowrap">
                            {isAddingBuilding ? <X size={18} className="mr-2"/> : <Plus size={18} className="mr-2"/>}
                            {isAddingBuilding ? 'Cancel' : 'Add Building'}
                        </button>
                    </div>
                </div>

                {isAddingBuilding && (
                    <div className="bg-brand-50 border border-brand-100 p-6 rounded-xl animate-fade-in">
                        <h3 className="font-bold text-brand-800 mb-4">Add New Building</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="block text-xs font-bold text-brand-600 mb-1">Building Code</label>
                                <input placeholder="e.g. BIO" value={newBuildingCode} onChange={e => setNewBuildingCode(e.target.value.toUpperCase())} className="w-full border border-brand-200 rounded p-2 focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-brand-600 mb-1">Building Name</label>
                                <input placeholder="e.g. Biology Building" value={newBuildingName} onChange={e => setNewBuildingName(e.target.value)} className="w-full border border-brand-200 rounded p-2 focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <button onClick={handleAddBuilding} className="bg-brand-600 text-white py-2 px-4 rounded font-bold hover:bg-brand-700 w-full md:w-auto">Create Building</button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(b => (
                        <div key={b.code} onClick={() => setSelectedBuilding(b)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer group hover:border-brand-200 transition-all">
                             <div className="flex justify-between items-center mb-3">
                                <span className="bg-brand-50 text-brand-700 px-2 py-1 rounded text-xs font-bold group-hover:bg-brand-600 group-hover:text-white transition-colors">{b.code}</span>
                                <span className="text-slate-400 text-sm flex items-center"><MapPin size={14} className="mr-1"/> {b.maintenanceRooms.length} Rooms</span>
                             </div>
                             <h3 className="font-bold text-slate-800">{b.name}</h3>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const handleCreateRoom = () => {
        const newRoom: MaintenanceRoom = {
            id: `${selectedBuilding.code}-NEW-${Date.now()}`,
            Building: selectedBuilding.code,
            RoomNumber: 'New Room',
            Description: 'Maintenance Room',
            Floor: '',
            floorPlanId: undefined,
            doorImage: undefined
        };
        setSelectedRoom(newRoom);
        setView(ViewState.ROOM_DETAIL);
    };

    const handleBuildingImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const url = await api.uploadFile(e.target.files[0]);
                updateBuilding(selectedBuilding.code, { buildingImage: url });
            } catch(e) { alert("Upload failed"); }
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center space-x-4">
                    <button onClick={() => setSelectedBuilding(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ArrowLeft size={24}/></button>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-slate-800">{selectedBuilding.name}</h1>
                        <p className="text-slate-500 text-sm">Select a maintenance room to view details</p>
                    </div>
                </div>
                <button onClick={handleCreateRoom} className="w-full md:w-auto bg-brand-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center hover:bg-brand-700 shadow-sm">
                    <Plus size={18} className="mr-2" /> Add Room
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col md:flex-row gap-6">
                 <div 
                    className="w-full md:w-1/3 aspect-video bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative group"
                    onClick={() => selectedBuilding.buildingImage && setFullScreenImage(selectedBuilding.buildingImage)}
                 >
                     {selectedBuilding.buildingImage ? (
                         <>
                            <img src={selectedBuilding.buildingImage} className={`w-full h-full object-cover ${selectedBuilding.buildingImage ? 'cursor-zoom-in' : ''}`} alt="Building Exterior" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                         </>
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full text-slate-400">
                             <BuildingIcon size={48} className="mb-2 opacity-50"/>
                             <span className="text-sm">No Building Photo</span>
                         </div>
                     )}
                     <label className="absolute bottom-2 right-2 bg-white/90 hover:bg-white text-slate-700 p-2 rounded-full cursor-pointer shadow-sm transition-colors" onClick={e => e.stopPropagation()}>
                         <Camera size={16} />
                         <input type="file" className="hidden" accept="image/*" onChange={handleBuildingImageUpload}/>
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
                                        onChange={(e) => updateBuilding(selectedBuilding.code, { googleMapsLink: e.target.value })}
                                        className="flex-grow border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                        placeholder="https://maps.google.com/..."
                                    />
                                    {selectedBuilding.googleMapsLink && (
                                        <a href={selectedBuilding.googleMapsLink} target="_blank" rel="noreferrer" className="p-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 flex items-center justify-center">
                                            <ExternalLink size={18} />
                                        </a>
                                    )}
                                </div>
                             </div>
                             <div 
                                onClick={() => setView(ViewState.FLOOR_PLAN_MANAGER)}
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
                            {selectedBuilding.maintenanceRooms.map(room => (
                                <tr 
                                    key={room.id} 
                                    className="hover:bg-slate-50 group cursor-pointer" 
                                    onClick={() => { setSelectedRoom(room); setView(ViewState.ROOM_DETAIL); }}
                                >
                                    <td className="p-4 font-bold text-slate-700 flex items-center">
                                        <ChevronRight size={16} className="text-slate-300 mr-2 group-hover:text-brand-600 transition-colors" />
                                        {room.RoomNumber}
                                    </td>
                                    <td className="p-4 text-slate-600">{room.Floor}</td>
                                    <td className="p-4 text-slate-600">{room.Description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  const RoomDetail = () => {
      if (!selectedRoom || !selectedBuilding) return null;
      
      const [isEditing, setIsEditing] = useState(false);
      const [form, setForm] = useState(selectedRoom);
      const [isUploading, setIsUploading] = useState(false);
      
      const handleSave = async () => {
          setIsUploading(true);
          await saveRoom(form, selectedBuilding.code);
          setIsUploading(false);
          setIsEditing(false);
      };

      const handleImageUpload = async (field: 'doorImage' | 'roomImage', e: React.ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files[0]) {
              try {
                  const url = await api.uploadFile(e.target.files[0]);
                  setForm({...form, [field]: url});
              } catch (e) { alert("Upload failed"); }
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
                <button onClick={() => setView(ViewState.ROOM_LIST)} className="flex items-center text-slate-500 hover:text-brand-600 transition-colors font-medium">
                    <ArrowLeft size={20} className="mr-1" /> Back to {selectedBuilding.name}
                </button>
                <div className="flex space-x-2 self-end sm:self-auto">
                    {isEditing ? (
                        <>
                            <button onClick={() => { setForm(selectedRoom); setIsEditing(false); }} className="flex items-center px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium">Cancel</button>
                            <button disabled={isUploading} onClick={handleSave} className="flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium disabled:opacity-50">
                                {isUploading ? "Saving..." : "Save"}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="flex items-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium">
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
                           <div className="w-full h-full flex items-center justify-center text-slate-300"><BuildingIcon size={32}/></div>
                       )}
                  </div>
                  <div className="flex-1">
                      <h2 className="text-xl font-bold text-slate-800">{selectedBuilding.name} ({selectedBuilding.code})</h2>
                      <p className="text-slate-500">Facility Location</p>
                  </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Form & Floor Plan */}
                  <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                          <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Wrench size={18} className="mr-2 text-brand-500"/> Room Details</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Room Number</label>
                                  {isEditing ? (
                                      <input value={form.RoomNumber} onChange={e => setForm({...form, RoomNumber: e.target.value})} className="border rounded p-2 w-full"/>
                                  ) : (
                                      <div className="text-lg font-bold text-slate-800">{form.RoomNumber}</div>
                                  )}
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Floor</label>
                                  {isEditing ? (
                                      <input value={form.Floor} onChange={e => setForm({...form, Floor: e.target.value})} className="border rounded p-2 w-full"/>
                                  ) : (
                                      <div className="text-lg text-slate-700">{form.Floor}</div>
                                  )}
                              </div>
                              <div className="md:col-span-2">
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                                  {isEditing ? (
                                      <input value={form.Description} onChange={e => setForm({...form, Description: e.target.value})} className="border rounded p-2 w-full"/>
                                  ) : (
                                      <div className="text-slate-700">{form.Description}</div>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                           <div className="flex justify-between items-center mb-4">
                               <h3 className="font-bold text-slate-800 flex items-center"><MapPin size={18} className="mr-2 text-brand-500"/> Floor Plan Location</h3>
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
                                        onClick={() => !isEditing && setFullScreenImage(linkedFloorPlan.imageUrl)}
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
                          <h3 className="font-bold text-slate-800 mb-4 flex items-center"><DoorOpen size={18} className="mr-2 text-brand-500"/> Door Photo</h3>
                          <div className="relative aspect-[3/4] bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden group">
                               {form.doorImage ? (
                                   <>
                                    <img src={form.doorImage} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setFullScreenImage(form.doorImage)} alt="Door" />
                                    {isEditing && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setForm({...form, doorImage: undefined})}} 
                                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                                        >
                                            <X size={14}/>
                                        </button>
                                    )}
                                   </>
                               ) : (
                                   <div className="text-center p-4">
                                       <Camera className="text-slate-400 mx-auto mb-2" size={32} />
                                       <span className="text-xs text-slate-500 block">No door photo</span>
                                   </div>
                               )}
                               {isEditing && !form.doorImage && (
                                    <label className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors">
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('doorImage', e)}/>
                                        <div className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-slate-600 shadow-sm flex items-center">
                                            <Plus size={12} className="mr-1"/> Add
                                        </div>
                                    </label>
                               )}
                          </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                          <h3 className="font-bold text-slate-800 mb-4 flex items-center"><ImageIcon size={18} className="mr-2 text-brand-500"/> Room Interior</h3>
                          <div className="relative aspect-video bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden group">
                               {form.roomImage ? (
                                   <>
                                    <img src={form.roomImage} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setFullScreenImage(form.roomImage)} alt="Room Interior" />
                                    {isEditing && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setForm({...form, roomImage: undefined})}} 
                                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                                        >
                                            <X size={14}/>
                                        </button>
                                    )}
                                   </>
                               ) : (
                                   <div className="text-center p-4">
                                       <Camera className="text-slate-400 mx-auto mb-2" size={32} />
                                       <span className="text-xs text-slate-500 block">No interior photo</span>
                                   </div>
                               )}
                               {isEditing && !form.roomImage && (
                                    <label className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors">
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('roomImage', e)}/>
                                        <div className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-slate-600 shadow-sm flex items-center">
                                            <Plus size={12} className="mr-1"/> Add
                                        </div>
                                    </label>
                               )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const FloorPlanManager = () => {
    if (!selectedBuilding) return null;

    const [isUploading, setIsUploading] = useState(false);
    const [newPlanName, setNewPlanName] = useState('');
    const [uploadingPlan, setUploadingPlan] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && newPlanName) {
            setUploadingPlan(true);
            try {
                const url = await api.uploadFile(e.target.files[0]);
                const newPlan: FloorPlan = {
                    id: `FP-${Date.now()}`,
                    name: newPlanName,
                    imageUrl: url
                };
                await updateFloorPlans(selectedBuilding.code, [...selectedBuilding.floorPlans, newPlan], newPlan);
                setNewPlanName('');
                setIsUploading(false);
            } catch (e) { alert("Upload failed"); } 
            finally { setUploadingPlan(false); }
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this floor plan?")) {
            await deleteFloorPlan(selectedBuilding.code, id);
        }
    };

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
             <div className="flex items-center space-x-4 mb-6">
                <button onClick={() => setView(ViewState.ROOM_LIST)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ArrowLeft size={24}/></button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Floor Plans</h1>
                    <p className="text-slate-500 text-sm">Manage blueprints for {selectedBuilding.name}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                    {isUploading ? (
                        <div className="w-full space-y-4">
                            <h3 className="font-bold text-brand-700">New Floor Plan</h3>
                            <input 
                                className="w-full border rounded p-2 text-sm" 
                                placeholder="Floor Name (e.g. 2nd Floor)"
                                value={newPlanName}
                                onChange={e => setNewPlanName(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <label className={`flex-1 py-2 rounded text-white font-medium text-sm cursor-pointer flex items-center justify-center ${newPlanName && !uploadingPlan ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 cursor-not-allowed'}`}>
                                    {uploadingPlan ? <RefreshCw className="animate-spin mr-2"/> : <Upload size={16} className="mr-2"/>}
                                    {uploadingPlan ? 'Uploading...' : 'Upload Image'}
                                    <input type="file" className="hidden" accept="image/*" disabled={!newPlanName || uploadingPlan} onChange={handleUpload}/>
                                </label>
                                <button onClick={() => setIsUploading(false)} className="px-3 bg-slate-200 rounded text-slate-600 hover:bg-slate-300"><X size={20}/></button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setIsUploading(true)} className="w-full h-full flex flex-col items-center justify-center py-8">
                            <div className="p-4 bg-brand-50 text-brand-500 rounded-full mb-3">
                                <Plus size={32} />
                            </div>
                            <span className="font-bold text-slate-700">Add Floor Plan</span>
                            <span className="text-xs text-slate-400 mt-1">Supports PNG, JPG</span>
                        </button>
                    )}
                </div>

                {selectedBuilding.floorPlans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden group relative">
                        <div className="aspect-video bg-slate-100 border-b border-slate-100 relative">
                             <img src={plan.imageUrl} className="w-full h-full object-contain p-2" alt={plan.name} />
                             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-zoom-in" onClick={() => setFullScreenImage(plan.imageUrl)} />
                        </div>
                        <div className="p-4 flex justify-between items-center bg-white relative z-10">
                            <span className="font-bold text-slate-700">{plan.name}</span>
                            <button onClick={() => handleDelete(plan.id)} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
  };

  if (loading && data.length === 0) return <LoadingScreen />;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-brand-900 text-white flex-col shadow-xl z-20">
        <div className="p-6 flex items-center space-x-3 border-b border-brand-800">
           <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/30">
             <MapPin className="text-white" size={20} />
           </div>
           <span className="text-xl font-bold tracking-tight">EquipLocate</span>
        </div>
        
        <nav className="flex-1 py-6 space-y-1">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={view === ViewState.DASHBOARD} onClick={() => navigate(ViewState.DASHBOARD)} />
          <SidebarItem icon={Wrench} label="Equipment" active={view === ViewState.EQUIPMENT_LIST || view === ViewState.EQUIPMENT_DETAIL} onClick={() => navigate(ViewState.EQUIPMENT_LIST)} />
          <SidebarItem icon={BuildingIcon} label="Maintenance Rooms" active={view === ViewState.ROOM_LIST || view === ViewState.ROOM_DETAIL || view === ViewState.FLOOR_PLAN_MANAGER} onClick={() => navigate(ViewState.ROOM_LIST)} />
        </nav>

        <div className="p-6 border-t border-brand-800 text-brand-200 text-xs text-center">
            {error && <div className="mb-2 text-red-300 flex items-center justify-center"><WifiOff size={12} className="mr-1"/> Offline / Preview Mode</div>}
            <p>&copy; 2024 EquipLocate v2.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="md:hidden bg-brand-900 text-white p-4 flex justify-between items-center shadow-md z-30">
           <div className="flex items-center space-x-2">
               <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                 <MapPin className="text-white" size={18} />
               </div>
               <span className="font-bold text-lg">EquipLocate</span>
           </div>
           <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
             {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
           </button>
        </header>

        {isMobileMenuOpen && (
            <div className="md:hidden absolute inset-0 bg-brand-900 z-40 flex flex-col p-6 animate-fade-in">
                <div className="flex justify-end mb-8">
                    <button onClick={() => setIsMobileMenuOpen(false)} className="text-white"><X size={32}/></button>
                </div>
                <nav className="space-y-4">
                     <button onClick={() => navigate(ViewState.DASHBOARD)} className="w-full text-left text-white text-xl font-bold py-3 border-b border-brand-800">Dashboard</button>
                     <button onClick={() => navigate(ViewState.EQUIPMENT_LIST)} className="w-full text-left text-white text-xl font-bold py-3 border-b border-brand-800">Equipment</button>
                     <button onClick={() => navigate(ViewState.ROOM_LIST)} className="w-full text-left text-white text-xl font-bold py-3 border-b border-brand-800">Maintenance Rooms</button>
                </nav>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          {view === ViewState.DASHBOARD && <Dashboard />}
          {view === ViewState.EQUIPMENT_LIST && <EquipmentList />}
          {view === ViewState.EQUIPMENT_DETAIL && <EquipmentDetail />}
          {view === ViewState.ROOM_LIST && <RoomList />}
          {view === ViewState.ROOM_DETAIL && <RoomDetail />}
          {view === ViewState.FLOOR_PLAN_MANAGER && <FloorPlanManager />}
        </div>
      </main>

      <FullScreenViewer />
    </div>
  );
};

export default App;