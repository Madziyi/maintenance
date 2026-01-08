import { BuildingData, Equipment, MaintenanceRoom, ViewState, FloorPlan } from '../types';

export interface EquipmentListProps {
  data: BuildingData[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectEquipment: (equipment: Equipment) => void;
  onNavigate: (view: ViewState) => void;
}

export interface EquipmentDetailProps {
  equipment: Equipment | null;
  data: BuildingData[];
  onBack: () => void;
  onSave: (equipment: Equipment) => Promise<void>;
  onFindRoom: (equipment: Equipment) => void;
  onSetFullScreenImage: (url: string) => void;
}

export interface RoomListProps {
  data: BuildingData[];
  selectedBuilding: BuildingData | null;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectBuilding: (building: BuildingData | null) => void;
  onSelectRoom: (room: MaintenanceRoom) => void;
  onNavigate: (view: ViewState) => void;
  onAddBuilding: (code: string, name: string) => Promise<void>;
  onUpdateBuilding: (code: string, updates: Partial<BuildingData>) => Promise<void>;
  onSetFullScreenImage: (url: string) => void;
}

export interface RoomDetailProps {
  room: MaintenanceRoom | null;
  building: BuildingData | null;
  onBack: () => void;
  onSave: (room: MaintenanceRoom, buildingCode: string) => Promise<void>;
  onNavigate: (view: ViewState) => void;
  onSetFullScreenImage: (url: string) => void;
}

export interface FloorPlanManagerProps {
  building: BuildingData | null;
  onBack: () => void;
  onUpdateFloorPlans: (buildingCode: string, plans: FloorPlan[], newPlan?: FloorPlan) => Promise<void>;
  onDeleteFloorPlan: (buildingCode: string, planId: string) => Promise<void>;
  onSetFullScreenImage: (url: string) => void;
}

