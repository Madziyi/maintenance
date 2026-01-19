import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Routes, 
  Route, 
  Navigate, 
  useNavigate, 
  useParams,
  useLocation
} from 'react-router-dom';
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
  WifiOff,
  LogIn,
  LogOut,
  Lock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BuildingData, Equipment, MaintenanceRoom, FloorPlan } from './types';
import { api } from './api';
import { LoginScreen } from './src/components/auth/LoginScreen';
import { FullScreenViewer } from './src/components/common/FullScreenViewer';
import { LoadingScreen } from './src/components/common/LoadingScreen';
import { SidebarItem } from './src/components/common/SidebarItem';
import { ScrollToTop } from './src/components/common/ScrollToTop';
import { useToast } from './src/components/common/Toast';
import * as Sentry from "@sentry/react";
import { Dashboard } from './src/components/dashboard/Dashboard';
import { EquipmentList } from './src/components/equipment/EquipmentList';
import { EquipmentDetailRoute } from './src/components/equipment/EquipmentDetailRoute';
import { BuildingList } from './src/components/rooms/BuildingList';
import { BuildingDetail } from './src/components/rooms/BuildingDetail';
import { RoomDetail } from './src/components/rooms/RoomDetail';
import { FloorPlanManager } from './src/components/rooms/FloorPlanManager';
import { RoomList } from '@/src/components/rooms/RoomList';

// Static login credentials from environment variables
const STATIC_USERNAME = import.meta.env.VITE_AUTH_USERNAME;
const STATIC_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD;

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if user is already logged in (from localStorage)
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  
  const [data, setData] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  

  // Image Viewer State with marker coordinates support
  interface FullScreenImageData {
    imageUrl: string;
    markerX?: number; // Percentage (0-100)
    markerY?: number; // Percentage (0-100)
  }

  const [fullScreenImage, setFullScreenImage] = useState<FullScreenImageData | null>(null);
  
  // Handler for setting fullscreen image (backward compatible with string or object)
  const handleSetFullScreenImage = useCallback((imageUrlOrData: string | FullScreenImageData | null) => {
    if (!imageUrlOrData) {
      setFullScreenImage(null);
      return;
    }
    if (typeof imageUrlOrData === 'string') {
      setFullScreenImage({ imageUrl: imageUrlOrData });
    } else {
      setFullScreenImage(imageUrlOrData);
    }
  }, []);
  
  // Set user context for Sentry when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      Sentry.setUser({
        // Don't include PII - just track that a user is authenticated
        authenticated: true,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [isAuthenticated]);

  // Load data on mount (regardless of authentication - read-only access allowed)
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

  // -- Navigation Helpers --
  const handleLogout = useCallback(() => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
    // Reset app state
    setData([]);
    navigate('/');
    setIsMobileMenuOpen(false);
  }, [navigate]);

  // -- Feature: Find Maintenance Room from Equipment --
  const findMaintenanceRoom = useCallback((eq: Equipment) => {
    const building = data.find(b => b.code === eq.Location);
    if (!building) {
        showToast("Building not found for this equipment.", 'error');
        return;
    }
    const room = building.maintenanceRooms.find(r => r.RoomNumber === eq.Room);
    if (!room) {
        // Fallback: Just go to the building list if exact room not found
        navigate(`/building/${building.code}`);
        return;
    }
    // Found it - Navigate
    navigate(`/building/${building.code}/room/${room.id}`);
  }, [data, navigate, showToast]);

  // -- Data Modification Helpers --

  const addBuilding = useCallback(async (code: string, name: string) => {
      if (!isAuthenticated) {
        showToast("Please log in to make changes.", "warning");
        return;
      }
      // For now, client side update until backend supports explicit CreateBuilding beyond Seed
      // Realistically, Seed handles this, or we adapt API to allow new building creation
      // Implementing local optimistic update + simple API push
      if (data.some(b => b.code === code)) {
          showToast("Building code already exists!", 'warning');
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
      
      try {
        await api.saveBuilding(newBuilding);
        // Optimistic
          setData([...data, newBuilding].sort((a,b) => a.name.localeCompare(b.name)));
          showToast("Building created successfully", 'success');
      } catch (e) {
        showToast("Failed to create building", 'error');
      }
  }, [data, isAuthenticated, showToast]);

  const saveEquipment = useCallback(async (eq: Equipment) => {
    if (!isAuthenticated) {
      showToast("Please log in to make changes.", "warning");
      return;
    }
    try {
        const savedEq = await api.saveEquipment(eq);
        
        // Optimistic / Local Update
        setData(prevData => {
          const newData = [...prevData];
        newData.forEach(b => {
             b.equipment = b.equipment.filter(e => e.id !== eq.id);
        });
        
        let target = newData.find(b => b.code === eq.Location);
        if (!target && newData.length > 0) target = newData[0];

        if (target) {
            target.equipment.push(savedEq);
        }
          return newData;
        });
        showToast("Equipment saved successfully", 'success');
    } catch (e) {
        showToast("Failed to save equipment", 'error');
    }
  }, [isAuthenticated, showToast]);

  const saveRoom = useCallback(async (room: MaintenanceRoom, targetBuildingCode: string): Promise<MaintenanceRoom | null> => {
      if (!isAuthenticated) {
        showToast("Please log in to make changes.", "warning");
        return null;
      }
      try {
        const savedRoom = await api.saveRoom(room);
        setData(prevData => {
          const newData = [...prevData];
        const building = newData.find(b => b.code === targetBuildingCode);
          if (!building) return prevData;

        const existingIdx = building.maintenanceRooms.findIndex(r => r.id === room.id);
        if (existingIdx >= 0) {
            building.maintenanceRooms[existingIdx] = savedRoom;
        } else {
            building.maintenanceRooms.push(savedRoom);
        }
          return newData;
        });
            showToast("Room saved successfully", 'success');
            return savedRoom;
          } catch (e) {
            showToast("Failed to save room", 'error');
            return null;
          }
  }, [isAuthenticated, showToast]);

  const deleteEquipment = useCallback(async (equipmentId: string) => {
      if (!isAuthenticated) {
          showToast("Please log in to make changes.", "warning");
          return;
      }
      if (!window.confirm("Are you sure you want to delete this equipment? This action cannot be undone.")) {
          return;
      }
      try {
          await api.deleteEquipment(equipmentId);
          setData(prevData => {
            const newData = [...prevData];
            newData.forEach(building => {
                building.equipment = building.equipment.filter(eq => eq.id !== equipmentId);
            });
            return newData;
          });
          showToast("Equipment deleted successfully", 'success');
          navigate('/equipment');
      } catch (e) {
          showToast("Failed to delete equipment", 'error');
      }
  }, [isAuthenticated, navigate, showToast]);

  const deleteRoom = useCallback(async (roomId: string, buildingCode: string) => {
      if (!isAuthenticated) {
          showToast("Please log in to make changes.", "warning");
          return;
      }
      if (!window.confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
          return;
      }
      try {
          await api.deleteRoom(roomId);
          setData(prevData => {
            const newData = [...prevData];
            const building = newData.find(b => b.code === buildingCode);
            if (building) {
                building.maintenanceRooms = building.maintenanceRooms.filter(r => r.id !== roomId);
            }
            return newData;
          });
              showToast("Room deleted successfully", 'success');
              navigate(`/building/${buildingCode}`);
          } catch (e) {
              showToast("Failed to delete room", 'error');
          }
  }, [isAuthenticated, navigate, showToast]);

  const updateFloorPlans = useCallback(async (buildingCode: string, plans: FloorPlan[], newPlan?: FloorPlan) => {
    if (!isAuthenticated) {
      showToast("Please log in to make changes.", "warning");
      return;
    }
    try {
        if (newPlan) {
            await api.saveFloorPlan(buildingCode, newPlan);
        }
        // Note: Deletions are handled separately via deleteFloorPlan
        
        // Local Update
        setData(prevData => {
          const newData = [...prevData];
        const bIndex = newData.findIndex(b => b.code === buildingCode);
          if (bIndex === -1) return prevData;
        newData[bIndex].floorPlans = plans;
            return newData;
          });
          showToast("Floor plan updated successfully", 'success');
        } catch (e) {
            showToast("Failed to update floor plans", 'error');
        }
  }, [isAuthenticated, showToast]);
  
  const deleteFloorPlan = useCallback(async (buildingCode: string, planId: string) => {
      if (!isAuthenticated) {
          showToast("Please log in to make changes.", "warning");
          return;
      }
      try {
          await api.deleteFloorPlan(planId);
          setData(prevData => {
            const newData = [...prevData];
          const bIndex = newData.findIndex(b => b.code === buildingCode);
          if (bIndex !== -1) {
              newData[bIndex].floorPlans = newData[bIndex].floorPlans.filter(p => p.id !== planId);
              }
            return newData;
              });
              showToast("Floor plan deleted successfully", 'success');
          } catch (e) {
              showToast("Failed to delete floor plan", 'error');
          }
  }, [isAuthenticated, showToast]);

  const updateBuilding = useCallback(async (buildingCode: string, updates: Partial<BuildingData>) => {
    if (!isAuthenticated) {
      showToast("Please log in to make changes.", "warning");
      return;
    }
    try {
        // Filter out undefined values before sending to API
        const sanitizedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, value]) => value !== undefined)
        ) as Partial<BuildingData>;
        
        await api.saveBuilding({ code: buildingCode, ...sanitizedUpdates });
        setData(prevData => {
          const newData = [...prevData];
          const bIndex = newData.findIndex(b => b.code === buildingCode);
          if (bIndex === -1) return prevData;
          
          newData[bIndex] = { ...newData[bIndex], ...sanitizedUpdates };
          return newData;
            });
            showToast("Building updated successfully", 'success');
        } catch (e) {
            showToast("Failed to update building", 'error');
        }
  }, [isAuthenticated, showToast]);
  
  if (loading && data.length === 0) return <LoadingScreen />;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col border-r border-slate-800 z-20 desktop-sidebar">
        <div className="p-6 flex items-center space-x-3 border-b border-slate-800">
           <div className="w-8 h-8 bg-brand-600 rounded-md flex items-center justify-center">
             <MapPin className="text-white" size={18} />
           </div>
           <span className="text-lg font-semibold tracking-tight">WayFinder</span>
        </div>
        
        <nav className="flex-1 py-4 space-y-0.5">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/'} onClick={() => navigate('/')} />
          <SidebarItem icon={Wrench} label="Equipment" active={location.pathname.startsWith('/equipment')} onClick={() => navigate('/equipment')} />
          <SidebarItem icon={BuildingIcon} label="Buildings" active={location.pathname.startsWith('/building') && !location.pathname.startsWith('/rooms')} onClick={() => navigate('/building')} />
          <SidebarItem icon={MapPin} label="All Rooms" active={location.pathname.startsWith('/rooms')} onClick={() => navigate('/rooms')} />
        </nav>

        <div className="p-6 border-t border-slate-800 space-y-3">
            {error && <div className="text-amber-400 flex items-center justify-center text-xs mb-2"><WifiOff size={12} className="mr-1"/> Offline / Preview Mode</div>}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 h-9 bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors text-sm font-medium"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
            <p className="text-slate-400 text-xs text-center">&copy; 2026 WayFinder v1.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden bg-brand-900 text-white p-4 flex items-center justify-between shadow-lg z-30 desktop-header">
          <div className="flex items-center space-x-3">
               <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                 <MapPin className="text-white" size={18} />
               </div>
            <span className="text-lg font-bold">WayFinder</span>
           </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-brand-800 rounded-lg transition-colors"
          >
            <Menu size={24} />
           </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute inset-0 z-40 bg-brand-900 text-white p-6 desktop-header-menu">
            <div className="flex flex-col space-y-4">
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/'); }} className="text-left p-3 hover:bg-brand-800 rounded-lg">Dashboard</button>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/equipment'); }} className="text-left p-3 hover:bg-brand-800 rounded-lg">Equipment</button>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/building'); }} className="text-left p-3 hover:bg-brand-800 rounded-lg">Buildings</button>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/rooms'); }} className="text-left p-3 hover:bg-brand-800 rounded-lg">All Rooms</button>
              <button onClick={handleLogout} className="mt-4 p-3 bg-brand-800 hover:bg-brand-700 rounded-lg">Logout</button>
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <ScrollToTop />
          <Routes>
            <Route
              path="/login"
              element={
                <LoginScreen
                  onLogin={() => {
                    setIsAuthenticated(true);
                    navigate("/");
                  }}
                  staticUsername={STATIC_USERNAME}
                  staticPassword={STATIC_PASSWORD}
                />
              }
            />
            <Route
              path="/"
              element={
                <Dashboard
                  data={data}
                  isAuthenticated={isAuthenticated}
                  onLoginClick={() => navigate("/login")}
                  onViewEquipment={() => navigate("/equipment")}
                  onViewBuildings={() => navigate("/building")}
                />
              }
            />
            <Route path="/equipment" element={
              <EquipmentList 
                data={data}
                onSelectEquipment={(eq) => navigate(`/equipment/${eq.id}`)}
                onNavigate={(view) => {
                  if (view === 'EQUIPMENT_DETAIL') return;
                  navigate('/equipment');
                }}
                onSaveEquipment={saveEquipment}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/equipment/:id" element={
              <EquipmentDetailRoute 
                data={data}
                onSave={saveEquipment}
                onFindRoom={findMaintenanceRoom}
                onSetFullScreenImage={handleSetFullScreenImage}
                onDelete={deleteEquipment}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/building" element={
              <BuildingList 
                data={data}
                onAddBuilding={addBuilding}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/building/:code" element={
              <BuildingDetail 
                data={data}
                onUpdateBuilding={updateBuilding}
                onSetFullScreenImage={handleSetFullScreenImage}
                onSaveRoom={saveRoom}
                onSaveEquipment={saveEquipment}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/building/:code/room/:id" element={
              <RoomDetail 
                data={data}
                onSaveRoom={saveRoom}
                onSetFullScreenImage={handleSetFullScreenImage}
                onDeleteRoom={deleteRoom}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/building/:code/floor-plans/:planSlug?" element={
              <FloorPlanManager 
                data={data}
                onUpdateFloorPlans={updateFloorPlans}
                onDeleteFloorPlan={deleteFloorPlan}
                onSetFullScreenImage={handleSetFullScreenImage}
                canEdit={isAuthenticated}
              />
            } />
            <Route path="/rooms" element={
              <RoomList 
                data={data}
                onSaveRoom={saveRoom}
                canEdit={isAuthenticated}
              />
            } />
          </Routes>
        </div>
      </main>

      <FullScreenViewer 
        imageUrl={fullScreenImage?.imageUrl || null} 
        markerX={fullScreenImage?.markerX}
        markerY={fullScreenImage?.markerY}
        onClose={() => setFullScreenImage(null)} 
      />
    </div>
  );
};

export default App;
