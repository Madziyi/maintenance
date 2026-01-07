export interface Equipment {
  id: string; // Unique ID generated from CSV index
  Equipment: string;
  EquipmentDesc: string;
  Notes: string;
  Location: string; // Building Code (e.g., BIO)
  LocationDesc: string; // Building Name
  Room: string;
  KeyAccess: string;
  AssetTag: string;
  SerialNum: string;
  Manufacturer: string;
  Model?: string;
  Vendor: string;
  PurchaseDate: string;
  WarrantyDate: string;
  images: string[]; // URLs/Base64 strings
}

export interface MaintenanceRoom {
  id: string; // Unique ID (e.g., BIO-M01)
  Building: string; // Building Code
  RoomNumber: string;
  Description: string;
  Floor: string;
  floorPlanId?: string; // ID of the linked FloorPlan
  x?: number; // X coordinate % on floor plan
  y?: number; // Y coordinate % on floor plan
  doorImage?: string; // Base64 string of the door
  roomImage?: string; // Base64 string of the room interior
}

export interface FloorPlan {
  id: string;
  name: string; // e.g., "Basement", "1st Floor"
  imageUrl: string;
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

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  EQUIPMENT_LIST = 'EQUIPMENT_LIST',
  EQUIPMENT_DETAIL = 'EQUIPMENT_DETAIL',
  ROOM_LIST = 'ROOM_LIST',
  ROOM_DETAIL = 'ROOM_DETAIL',
  FLOOR_PLAN_MANAGER = 'FLOOR_PLAN_MANAGER',
}