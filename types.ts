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

// ─────────────────────────────────────────────
// Work Order types
// ─────────────────────────────────────────────

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

export interface WorkOrderHandoff {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  requestDescription: string | null;
  buildingCode: string | null;
  roomNumber: string | null;
  currentAssigneeName: string | null;
  currentAssigneeId: string | null;
  fromStaffId: string | null;
  fromStaffName: string | null;
  reason: string | null;
  handoffNote: string | null;
  createdAt: string;
}

export interface WorkOrderTechnician {
  id: string;
  workOrderId: string;
  employeeNumber: string | null;
  staffId: string | null;
  craft: string | null;
  hours: number | null;
  rate: number | null;
  totalCost: number | null;
}

export interface WorkOrderAnnotation {
  id: string;
  workOrderId: string;
  staffId: string | null;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  buildingCode: string | null;
  buildingName: string | null;
  roomNumber: string | null;
  equipmentId: string | null;
  equipmentRaw: string | null;
  requester: string | null;
  requestDescription: string | null;
  status: string | null;
  priority: string | null;
  craft: string | null;
  openDate: string | null;
  completeDate: string | null;
  actualHours: number;
  actualLabourCost: number;
  actualTotalCost: number;
  technicianNotes: string | null;
  completionRemark: string | null;
  pdfUrl: string | null;
  pageNumber: number;
  pageCount: number;
  source: 'pdf' | 'manual';
  // Mechanic completion fields (set when mechanic marks WO complete)
  completedAt: string | null;
  completionHours: number | null;
  completedByStaffIds: string[] | null; // parsed from JSON
  completedByNames: string | null;      // "Nick, Griff" for display
  rawTranscript: string | null;         // raw Web Speech API output
  assignedToStaffId: string | null;
  assignedToName: string | null;
  completionImageUrl: string | null;
  handoffPending: boolean;
  createdAt: string;
  updatedAt: string;
  // Populated by detail endpoint only
  technicians?: WorkOrderTechnician[];
  annotations?: WorkOrderAnnotation[];
}

/** Intermediate type used in the upload wizard before a WO is saved */
export interface ParsedWorkOrder {
  workOrderNumber: string;
  buildingCode: string | null;
  buildingName: string | null;
  roomNumber: string | null;
  equipmentId: string | null;
  equipmentRaw: string | null;
  requester: string | null;
  requestDescription: string | null;
  status: string | null;
  priority: string | null;
  craft: string | null;
  openDate: string | null;
  completeDate: string | null;
  actualHours: number;
  actualLabourCost: number;
  actualTotalCost: number;
  technicianNotes: string | null;
  completionRemark: string | null;
  technicians: Array<{
    employeeNumber: string;
    craft: string | null;
    hours: number | null;
    rate: number | null;
    totalCost: number | null;
  }>;
  pageNumber: number;
  pageCount: number;
  sourceFile: string;      // original filename for display in review table
  parseWarnings: string[]; // field names that failed to parse
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  EQUIPMENT_LIST = 'EQUIPMENT_LIST',
  EQUIPMENT_DETAIL = 'EQUIPMENT_DETAIL',
  ROOM_LIST = 'ROOM_LIST',
  ROOM_DETAIL = 'ROOM_DETAIL',
  FLOOR_PLAN_MANAGER = 'FLOOR_PLAN_MANAGER',
}