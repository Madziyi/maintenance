import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Lock,
  ClipboardList,
  TrendingUp,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BuildingData, Equipment, MaintenanceRoom, FloorPlan } from './types';
import { api } from './api';
import { LoginScreen } from './src/components/auth/LoginScreen';
import { FullScreenViewer } from './src/components/common/FullScreenViewer';
import { LoadingScreen } from './src/components/common/LoadingScreen';
import { SidebarItem } from './src/components/common/SidebarItem';
import { ScrollPositionManager } from './src/components/common/ScrollPositionManager';
import { useToast } from './src/components/common/Toast';
import * as Sentry from "@sentry/react";
import { Dashboard } from './src/components/dashboard/Dashboard';
import { EquipmentList } from './src/components/equipment/EquipmentList';
import { EquipmentDetailRoute } from './src/components/equipment/EquipmentDetailRoute';
import { EquipmentReviewHome } from './src/components/equipment/EquipmentReviewHome';
import { EquipmentReviewPage } from './src/components/equipment/EquipmentReviewPage';
import { ExportsPage } from './src/components/exports/ExportsPage';
import { BuildingList } from './src/components/rooms/BuildingList';
import { BuildingDetail } from './src/components/rooms/BuildingDetail';
import { RoomDetail } from './src/components/rooms/RoomDetail';
import { FloorPlanManager } from './src/components/rooms/FloorPlanManager';
import { RoomList } from '@/src/components/rooms/RoomList';
import { DataSpreadsheetPage } from '@/src/components/spreadsheet/DataSpreadsheetPage';
import { WorkOrderList } from './src/components/workorders/WorkOrderList';
import { WorkOrderUpload } from './src/components/workorders/WorkOrderUpload';
import { WorkOrderDetail } from './src/components/workorders/WorkOrderDetail';
import { WorkOrderInsights } from './src/components/workorders/WorkOrderInsights';
import { PhotoComplete } from './src/components/workorders/PhotoComplete';
import { StaffManager } from './src/components/settings/StaffManager';

// Static login credentials from environment variables
const STATIC_USERNAME = import.meta.env.VITE_AUTH_USERNAME;
const STATIC_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD;

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isReviewFullScreen =
    location.pathname.startsWith('/equipment-review') &&
    new URLSearchParams(location.search).get('fs') === '1';

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if user is already logged in (from localStorage)
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  
  const [data, setData] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Sidebar collapsed — starts collapsed everywhere except the dashboard
  const [sidebarCollapsed, setSidebarCollapsed] = useState(location.pathname !== '/');
  // Auto-collapse when leaving dashboard, auto-expand when arriving at it
  useEffect(() => {
    if (location.pathname === '/') {
      setSidebarCollapsed(false);
    } else {
      setSidebarCollapsed(true);
    }
  }, [location.pathname]);
  

  // Image Viewer State with marker coordinates support
  interface FullScreenImageData {
    imageUrl: string;
    markerX?: number; // Percentage (0-100)
    markerY?: number; // Percentage (0-100)
    isEditing?: boolean; // Allow editing in full screen
    onMapClick?: (x: number, y: number) => void; // Callback when clicking to set location
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
    const room = building.maintenanceRooms.find(r => r.RoomNumber === eq.room);
    if (!room) {
        // Fallback: Just go to the building list if exact room not found
        navigate(`/building/${building.code}`);
        return;
    }
    // Found it - Navigate with referrer state (include current history key for scroll restoration)
    navigate(`/building/${building.code}/room/${room.id}`, { 
      state: { 
        from: `${location.pathname}${location.search}`,
        fromKey: location.key
      } 
    });
  }, [data, navigate, showToast, location.key, location.pathname, location.search]);

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
    <div className="flex h-screen bg-surface-canvas font-sans text-slate-900 overflow-hidden">
      {/* Sidebar - Desktop */}
      {!isReviewFullScreen && (
      <aside
        className={`hidden md:flex flex-col bg-slate-900 text-white border-r border-slate-800 z-20 desktop-sidebar transition-[width] duration-200 ease-in-out overflow-hidden ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo / header */}
        <div className={`flex items-center border-b border-slate-800 shrink-0 ${sidebarCollapsed ? 'justify-center p-4' : 'justify-between px-6 py-5'}`}>
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => sidebarCollapsed && setSidebarCollapsed(false)}
            title={sidebarCollapsed ? 'Expand sidebar' : undefined}
          >
            <div className="w-8 h-8 bg-brand-600 rounded-md flex items-center justify-center shrink-0">
              <MapPin className="text-white" size={18} />
            </div>
            {!sidebarCollapsed && <span className="text-lg font-semibold tracking-tight whitespace-nowrap">WayFinder</span>}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {/* Collapse/expand toggle when collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="mx-auto mt-2 p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Expand sidebar"
          >
            <ChevronRightIcon size={15} />
          </button>
        )}

        <nav className="flex-1 py-4 space-y-0.5">
          <SidebarItem collapsed={sidebarCollapsed} icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/'} onClick={() => navigate('/')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={BuildingIcon} label="Buildings" active={location.pathname.startsWith('/building') && !location.pathname.startsWith('/rooms')} onClick={() => navigate('/building')} />
          <SidebarItem
            collapsed={sidebarCollapsed}
            icon={Wrench}
            label="Equipment"
            active={location.pathname.startsWith('/equipment') && !location.pathname.startsWith('/equipment-review')}
            onClick={() => navigate('/equipment')}
          />
          <SidebarItem collapsed={sidebarCollapsed} icon={Check} label="Equipment Review" active={location.pathname.startsWith('/equipment-review')} onClick={() => navigate('/equipment-review')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={Database} label="Spreadsheet" active={location.pathname.startsWith('/spreadsheet')} onClick={() => navigate('/spreadsheet')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={Download} label="Exports" active={location.pathname.startsWith('/exports')} onClick={() => navigate('/exports')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={MapPin} label="Equipment Rooms" active={location.pathname.startsWith('/rooms')} onClick={() => navigate('/rooms')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={ClipboardList} label="Work Orders" active={location.pathname.startsWith('/work-orders') && !location.pathname.startsWith('/work-orders/insights')} onClick={() => navigate('/work-orders')} />
          <SidebarItem collapsed={sidebarCollapsed} icon={TrendingUp} label="Cost Insights" active={location.pathname.startsWith('/work-orders/insights')} onClick={() => navigate('/work-orders/insights')} />
        </nav>

        <div className={`border-t border-slate-800 shrink-0 ${sidebarCollapsed ? 'p-3' : 'p-6 space-y-3'}`}>
          {!sidebarCollapsed && error && (
            <div className="text-amber-400 flex items-center justify-center text-xs mb-2">
              <WifiOff size={12} className="mr-1"/> Offline / Preview Mode
            </div>
          )}
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              title={sidebarCollapsed ? 'Logout' : undefined}
              className={`w-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors text-sm font-medium ${
                sidebarCollapsed ? 'p-2' : 'space-x-2 px-4 py-2 h-9'
              }`}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              title={sidebarCollapsed ? 'Log In' : undefined}
              className={`w-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors text-sm font-medium ${
                sidebarCollapsed ? 'p-2' : 'space-x-2 px-4 py-2 h-9'
              }`}
            >
              <LogIn size={16} />
              {!sidebarCollapsed && <span>Log In</span>}
            </button>
          )}
          {!sidebarCollapsed && (
            <p className="text-slate-500 text-xs text-center">
              Created by ECC UWindsor Team. For any questions or concerns, contact{' '}
              <a href="mailto:mstanley@uwindsor.ca" className="text-brand-400 hover:text-brand-300 underline">mstanley@uwindsor.ca</a>.
            </p>
          )}
        </div>
      </aside>
      )}

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
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                  <MapPin className="text-white" size={18} />
                </div>
                <span className="text-lg font-bold">WayFinder</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 hover:bg-brand-800 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex flex-col space-y-4">
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/building'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <BuildingIcon size={18} />
                <span>Buildings</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/equipment'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <Wrench size={18} />
                <span>Equipment</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/equipment-review'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <Check size={18} />
                <span>Equipment Review</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/spreadsheet'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <Database size={18} />
                <span>Spreadsheet</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/exports'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <Download size={18} />
                <span>Exports</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/rooms'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <MapPin size={18} />
                <span>Equipment Rooms</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/work-orders'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <ClipboardList size={18} />
                <span>Work Orders</span>
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate('/work-orders/insights'); }}
                className="text-left p-3 hover:bg-brand-800 rounded-lg flex items-center gap-3"
              >
                <TrendingUp size={18} />
                <span>Cost Insights</span>
              </button>
              {isAuthenticated ? (
                <button onClick={handleLogout} className="mt-4 p-3 bg-brand-800 hover:bg-brand-700 rounded-lg flex items-center gap-3">
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              ) : (
                <button onClick={() => { setIsMobileMenuOpen(false); navigate('/login'); }} className="mt-4 p-3 bg-brand-800 hover:bg-brand-700 rounded-lg flex items-center gap-3">
                  <LogIn size={18} />
                  <span>Log In</span>
                </button>
              )}
                </div>
            </div>
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:px-8 md:py-10 scroll-smooth min-h-0">
          <ScrollPositionManager scrollContainerRef={scrollContainerRef} />
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
                onSelectEquipment={(eq) => navigate(`/equipment/${eq.id}`, { 
                  state: { 
                    from: `${location.pathname}${location.search}`, 
                    fromKey: location.key 
                  } 
                })}
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
            <Route path="/equipment-review" element={<EquipmentReviewHome data={data} />} />
            <Route path="/equipment-review/latest" element={
              <EquipmentReviewPage
                data={data}
                canEdit={isAuthenticated}
                onSetFullScreenImage={(url) => handleSetFullScreenImage(url)}
              />
            } />
            <Route path="/equipment-review/building/:code" element={
              <EquipmentReviewPage
                data={data}
                canEdit={isAuthenticated}
                onSetFullScreenImage={(url) => handleSetFullScreenImage(url)}
              />
            } />
            <Route
              path="/spreadsheet"
              element={
                <DataSpreadsheetPage
                  data={data}
                  canEdit={isAuthenticated}
                  onRefreshData={fetchData}
                />
              }
            />
            <Route path="/exports" element={<ExportsPage canEdit={isAuthenticated} />} />
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
                onSaveEquipment={saveEquipment}
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
            <Route path="/work-orders" element={<WorkOrderList canEdit={isAuthenticated} />} />
            <Route path="/work-orders/insights" element={<WorkOrderInsights />} />
            <Route path="/work-orders/upload" element={<WorkOrderUpload canEdit={isAuthenticated} data={data} />} />
            <Route path="/work-orders/photo-complete" element={<PhotoComplete />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetail canEdit={isAuthenticated} />} />
            <Route path="/settings/staff" element={<StaffManager canEdit={isAuthenticated} />} />
          </Routes>
          <footer className="mt-auto pt-8 pb-4 text-center text-slate-500 text-sm">
            Created by Stanley Madziyire under the supervision of Curtis Mahoney & Danielle Lenarduzzi. For any questions or concerns, contact{' '}
            <a href="mailto:mstanley@uwindsor.ca" className="text-brand-600 hover:text-brand-700 underline">mstanley@uwindsor.ca</a>.
          </footer>
        </div>
      </main>

      <FullScreenViewer 
        imageUrl={fullScreenImage?.imageUrl || null} 
        markerX={fullScreenImage?.markerX}
        markerY={fullScreenImage?.markerY}
        isEditing={fullScreenImage?.isEditing}
        onMapClick={fullScreenImage?.onMapClick}
        onClose={() => setFullScreenImage(null)} 
      />
    </div>
  );
};

export default App;
