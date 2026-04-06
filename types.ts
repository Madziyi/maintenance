export interface Equipment {
  id: string; // Unique ID generated from CSV index
  /** Accounting-facing name string (primary). */
  accountingName: string;
  /** Previous accounting name (single-step history). */
  previousAccountingName?: string | null;
  /** Maintenance/SCADA name/tag. */
  scadaName?: string | null;

  description: string;
  notes: string;
  Location: string; // Building Code (e.g., BIO)
  LocationDesc: string; // Building Name
  room: string;
  KeyAccess: string;
  AssetTag: string;
  serialNum: string;
  manufacturer: string;
  Model?: string;
  vendor: string;
  PurchaseDate: string;
  WarrantyDate: string;
  images: string[]; // URLs/Base64 strings
  status: 'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'REMOVED' | 'UNKNOWN';

  // Review metadata (ISO timestamps in UTC)
  createdAt?: string | null;
  updatedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface MaintenanceRoom {
  id: string; // Unique ID (e.g., BIO-M01)
  Building: string; // Building Code
  RoomNumber: string;
  Description: string;
  Floor: string;
  KeyAccess?: string | null;
  floorPlanId?: string; // ID of the linked FloorPlan
  x?: number; // X coordinate % on floor plan
  y?: number; // Y coordinate % on floor plan
  roomImages?: string[]; // Room interior image URLs
  Notes?: string; // Room notes
}

export interface FloorPlan {
  id: string;
  name: string; // e.g., "Basement", "1st Floor"
  imageUrl: string;
  slug?: string; // URL-friendly identifier for sharing (scoped per building)
}

export interface BuildingData {
  code: string;
  name: string;
  maintenanceRooms: MaintenanceRoom[];
  equipment: Equipment[];
  floorPlans: FloorPlan[];
  googleMapsLink?: string; // URL to Google Maps
  buildingImage?: string; // Base64 string of building exterior
}

export type StaffCategory = 'Operators' | 'Maintenance' | 'Assistants' | 'Refrigeration';

export interface Staff {
  id: string;
  name: string;
  employeeNumber: string | null;
  craft: string | null;
  category: StaffCategory | null;
  active: boolean;
  hasPin: boolean;
  createdAt: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  EQUIPMENT_LIST = 'EQUIPMENT_LIST',
  EQUIPMENT_DETAIL = 'EQUIPMENT_DETAIL',
  ROOM_LIST = 'ROOM_LIST',
  ROOM_DETAIL = 'ROOM_DETAIL',
  FLOOR_PLAN_MANAGER = 'FLOOR_PLAN_MANAGER',
}