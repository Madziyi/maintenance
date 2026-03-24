import * as Sentry from "@sentry/react";
import { BuildingData, Equipment, MaintenanceRoom, FloorPlan, WorkOrder, WorkOrderAnnotation, ParsedWorkOrder, Staff } from './types';

const API_URL = import.meta.env.VITE_API_URL;
const WRITE_SECRET = import.meta.env.VITE_WRITE_SECRET;

// Merges Authorization bearer token into headers for all write (POST/PUT/DELETE) requests.
function writeHeaders(extra: HeadersInit = {}): HeadersInit {
  return WRITE_SECRET
    ? { ...extra, Authorization: `Bearer ${WRITE_SECRET}` }
    : extra;
}

// Helper function to track API errors
const trackApiError = (endpoint: string, status: number, errorText: string, error?: Error) => {
  Sentry.captureException(error || new Error(`API Error: ${errorText}`), {
    tags: {
      endpoint,
      status: status.toString(),
      api_error: true,
    },
    extra: {
      responseText: errorText,
      url: `${API_URL}${endpoint}`,
    },
  });
};

// Helper function to wrap API calls with Sentry tracking
const withSentryTracking = async <T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    const result = await operation();
    // Track successful operations (optional - can be removed if too verbose)
    Sentry.addBreadcrumb({
      category: 'api',
      message: operationName,
      level: 'info',
    });
    return result;
  } catch (error) {
    // Error tracking is handled by trackApiError
    throw error;
  }
}; 

export const api = {
  // Check if backend is alive
  healthCheck: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  // Get all data structured as BuildingData[]
  getAllData: async (): Promise<BuildingData[]> => {
    return withSentryTracking("API: getAllData", async () => {
      const res = await fetch(`${API_URL}/api/data`);
      if (!res.ok) {
        let errorText = await res.text();
        console.error("API Error /api/data:", res.status, errorText);
        try {
            // If error text is JSON, parse it for better DX
            const jsonErr = JSON.parse(errorText);
            if (jsonErr.error) errorText = jsonErr.error;
        } catch (e) { /* ignore */ }
        
        const error = new Error(`Failed to fetch data: ${res.status} - ${errorText}`);
        trackApiError('/api/data', res.status, errorText, error);
        throw error;
      }
      return await res.json();
    });
  },

  // Save specific entities
  saveEquipment: async (eq: Equipment): Promise<Equipment> => {
    return withSentryTracking("API: saveEquipment", async () => {
      const res = await fetch(`${API_URL}/api/equipment`, {
        method: 'POST',
        headers: writeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(eq)
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment:", text);
        const error = new Error(`Failed to save equipment: ${text}`);
        trackApiError('/api/equipment', res.status, text, error);
        throw error;
      }
      return await res.json();
    });
  },

  // Equipment Review APIs
  getEquipmentReviewLatest: async (params?: { sort?: 'updated' | 'created'; limit?: number }): Promise<Equipment[]> => {
    return withSentryTracking("API: getEquipmentReviewLatest", async () => {
      const sort = params?.sort || 'updated';
      const limit = params?.limit ?? 50;
      const qs = new URLSearchParams();
      qs.set('sort', sort);
      qs.set('limit', String(limit));
      const res = await fetch(`${API_URL}/api/equipment-review/latest?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment-review/latest:", text);
        const error = new Error(`Failed to fetch review latest: ${text}`);
        trackApiError('/api/equipment-review/latest', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  getEquipmentReviewBuilding: async (
    buildingCode: string,
    params?: { sort?: 'updated' | 'created'; mode?: 'needs' | 'all' }
  ): Promise<Equipment[]> => {
    return withSentryTracking("API: getEquipmentReviewBuilding", async () => {
      const sort = params?.sort || 'updated';
      const mode = params?.mode || 'needs';
      const qs = new URLSearchParams();
      qs.set('sort', sort);
      qs.set('mode', mode);
      const res = await fetch(`${API_URL}/api/equipment-review/building/${encodeURIComponent(buildingCode)}?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment-review/building:", text);
        const error = new Error(`Failed to fetch review building: ${text}`);
        trackApiError('/api/equipment-review/building', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  bulkUpdateEquipmentReview: async (
    updates: Array<
      Pick<Equipment, 'id'> &
        Partial<
          Pick<
            Equipment,
            'accountingName' | 'scadaName' | 'description' | 'room' | 'notes' | 'manufacturer' | 'serialNum' | 'vendor' | 'status'
          >
        >
    >
  ): Promise<Equipment[]> => {
    return withSentryTracking("API: bulkUpdateEquipmentReview", async () => {
      const res = await fetch(`${API_URL}/api/equipment-review/bulk-update`, {
        method: 'POST',
        headers: writeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment-review/bulk-update:", text);
        const error = new Error(`Failed to bulk update review: ${text}`);
        trackApiError('/api/equipment-review/bulk-update', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  approveEquipmentReview: async (params: { id?: string; ids?: string[]; reviewedBy?: string | null }): Promise<Equipment[]> => {
    return withSentryTracking("API: approveEquipmentReview", async () => {
      const res = await fetch(`${API_URL}/api/equipment-review/approve`, {
        method: 'POST',
        headers: writeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment-review/approve:", text);
        const error = new Error(`Failed to approve review: ${text}`);
        trackApiError('/api/equipment-review/approve', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  // Exports (Sheets A/B/C)
  getExportSheetA: async (): Promise<Equipment[]> => {
    return withSentryTracking("API: getExportSheetA", async () => {
      const res = await fetch(`${API_URL}/api/exports/sheet-a?format=json`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-a:", text);
        const error = new Error(`Failed to fetch Sheet A: ${text}`);
        trackApiError('/api/exports/sheet-a', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  downloadExportSheetA: async (): Promise<string> => {
    return withSentryTracking("API: downloadExportSheetA", async () => {
      const res = await fetch(`${API_URL}/api/exports/sheet-a?format=csv`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-a csv:", text);
        const error = new Error(`Failed to download Sheet A: ${text}`);
        trackApiError('/api/exports/sheet-a', res.status, text, error);
        throw error;
      }
      return await res.text();
    });
  },

  getExportSheetB: async (): Promise<Equipment[]> => {
    return withSentryTracking("API: getExportSheetB", async () => {
      const res = await fetch(`${API_URL}/api/exports/sheet-b?format=json`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-b:", text);
        const error = new Error(`Failed to fetch Sheet B: ${text}`);
        trackApiError('/api/exports/sheet-b', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  downloadExportSheetB: async (): Promise<string> => {
    return withSentryTracking("API: downloadExportSheetB", async () => {
      const res = await fetch(`${API_URL}/api/exports/sheet-b?format=csv`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-b csv:", text);
        const error = new Error(`Failed to download Sheet B: ${text}`);
        trackApiError('/api/exports/sheet-b', res.status, text, error);
        throw error;
      }
      return await res.text();
    });
  },

  getExportSheetC: async (sinceIso: string): Promise<Array<{ equipment: Equipment; lastChangedAt: string | null; changedFields: string[] }>> => {
    return withSentryTracking("API: getExportSheetC", async () => {
      const qs = new URLSearchParams();
      qs.set('format', 'json');
      qs.set('since', sinceIso);
      const res = await fetch(`${API_URL}/api/exports/sheet-c?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-c:", text);
        const error = new Error(`Failed to fetch Sheet C: ${text}`);
        trackApiError('/api/exports/sheet-c', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return Array.isArray(data?.items) ? data.items : [];
    });
  },

  downloadExportSheetC: async (sinceIso: string): Promise<string> => {
    return withSentryTracking("API: downloadExportSheetC", async () => {
      const qs = new URLSearchParams();
      qs.set('format', 'csv');
      qs.set('since', sinceIso);
      const res = await fetch(`${API_URL}/api/exports/sheet-c?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/exports/sheet-c csv:", text);
        const error = new Error(`Failed to download Sheet C: ${text}`);
        trackApiError('/api/exports/sheet-c', res.status, text, error);
        throw error;
      }
      return await res.text();
    });
  },

  saveRoom: async (room: MaintenanceRoom): Promise<MaintenanceRoom> => {
    return withSentryTracking("API: saveRoom", async () => {
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: 'POST',
        headers: writeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(room)
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/rooms:", text);
        const error = new Error(`Failed to save room: ${text}`);
        trackApiError('/api/rooms', res.status, text, error);
        throw error;
      }
      return await res.json();
    });
  },

  saveBuilding: async (building: Partial<BuildingData>): Promise<void> => {
     const res = await fetch(`${API_URL}/api/buildings`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(building)
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/buildings:", text);
        throw new Error(`Failed to save building: ${text}`);
    }
  },

  saveFloorPlan: async (buildingCode: string, plan: FloorPlan): Promise<void> => {
    const res = await fetch(`${API_URL}/api/floorplans`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ buildingCode, plan })
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/floorplans:", text);
        throw new Error(`Failed to save floor plan: ${text}`);
    }
  },

  deleteEquipment: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/equipment/${id}`, { method: 'DELETE', headers: writeHeaders() });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error delete /api/equipment:", text);
        throw new Error(`Failed to delete equipment: ${text}`);
    }
  },

  deleteRoom: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/rooms/${id}`, { method: 'DELETE', headers: writeHeaders() });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error delete /api/rooms:", text);
        throw new Error(`Failed to delete room: ${text}`);
    }
  },

  deleteFloorPlan: async (id: string): Promise<void> => {
     const res = await fetch(`${API_URL}/api/floorplans/${id}`, { method: 'DELETE', headers: writeHeaders() });
     if (!res.ok) {
         const text = await res.text();
         console.error("API Error delete /api/floorplans:", text);
         throw new Error(`Failed to delete floor plan: ${text}`);
     }
  },

  // Upload to R2 via Worker
  uploadFile: async (file: File, oldImageUrl?: string): Promise<string> => {
    return withSentryTracking("API: uploadFile", async () => {
      // Get file extension from filename
      const fileName = file.name || '';
      const fileExtension = fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() || 
                           (file.type.includes('jpeg') ? 'jpg' :
                            file.type.includes('png') ? 'png' :
                            file.type.includes('gif') ? 'gif' :
                            file.type.includes('webp') ? 'webp' :
                            file.type.includes('svg') ? 'svg' : 'jpg');
      
      const baseHeaders: Record<string, string> = {};
      if (oldImageUrl) {
        baseHeaders['X-Old-Image-Url'] = oldImageUrl;
      }
      // Send filename and extension as custom headers for the server to use
      baseHeaders['X-File-Name'] = fileName;
      baseHeaders['X-File-Extension'] = fileExtension;
      baseHeaders['Content-Type'] = file.type || 'application/octet-stream';

      // Send file as raw body (not FormData) so we can control headers better
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'PUT',
        headers: writeHeaders(baseHeaders),
        body: file
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/upload:", text);
        const error = new Error(`Upload failed: ${text}`);
        trackApiError('/api/upload', res.status, text, error);
        throw error;
      }
      const data = await res.json();
      return data.url; // Returns the public R2 URL
    });
  },

  // Delete image from R2 bucket
  deleteImage: async (imageUrl: string): Promise<void> => {
    if (!imageUrl) return;

    const res = await fetch(`${API_URL}/api/delete-image`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imageUrl })
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/delete-image:", text);
        // Don't throw - deletion failure shouldn't block the UI
    }
  },

  // ─────────────────────────────────────────────
  // Staff
  // ─────────────────────────────────────────────

  getStaff: async (): Promise<Staff[]> => {
    const res = await fetch(`${API_URL}/api/staff`);
    if (!res.ok) throw new Error('Failed to load staff');
    return res.json();
  },

  createStaff: async (staff: Pick<Staff, 'name' | 'employeeNumber' | 'craft'>): Promise<Staff> => {
    const res = await fetch(`${API_URL}/api/staff`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(staff),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to create staff: ${t}`); }
    return res.json();
  },

  updateStaff: async (id: string, updates: Partial<Staff>): Promise<Staff> => {
    const res = await fetch(`${API_URL}/api/staff/${id}`, {
      method: 'PUT',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to update staff: ${t}`); }
    return res.json();
  },

  deleteStaff: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/staff/${id}`, { method: 'DELETE', headers: writeHeaders() });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to delete staff: ${t}`); }
  },

  // ─────────────────────────────────────────────
  // Work Orders
  // ─────────────────────────────────────────────

  getWorkOrders: async (params?: {
    q?: string; woNumber?: string; description?: string; equipment?: string;
    building?: string; status?: string; from?: string; to?: string;
    assignedTo?: string;
    limit?: number; offset?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  }): Promise<{ items: WorkOrder[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.q)           qs.set('q', params.q);
    if (params?.woNumber)    qs.set('woNumber', params.woNumber);
    if (params?.description) qs.set('description', params.description);
    if (params?.equipment)   qs.set('equipment', params.equipment);
    if (params?.building)    qs.set('building', params.building);
    if (params?.status)      qs.set('status', params.status);
    if (params?.from)        qs.set('from', params.from);
    if (params?.to)          qs.set('to', params.to);
    if (params?.assignedTo)  qs.set('assignedTo', params.assignedTo);
    if (params?.limit)       qs.set('limit', String(params.limit));
    if (params?.offset)      qs.set('offset', String(params.offset));
    if (params?.sortBy)      qs.set('sortBy', params.sortBy);
    if (params?.sortDir)     qs.set('sortDir', params.sortDir);
    const res = await fetch(`${API_URL}/api/work-orders?${qs}`);
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to load work orders: ${t}`); }
    return res.json();
  },

  getWorkOrderInsights: async (year?: number, buildingYear?: number): Promise<{
    kpis: { totalAllTime: number; totalThisYear: number; totalWOs: number; openWOCount: number; avgCostPerWO: number };
    monthly: { month: string; totalCost: number; labourCost: number; otherCost: number; woCount: number }[];
    buildings: { buildingCode: string; buildingName: string; totalCost: number; labourCost: number; woCount: number; avgCost: number }[];
    equipment: { equipmentRaw: string; buildingCode: string; totalCost: number; labourCost: number; woCount: number; avgCost: number }[];
    crafts: { craft: string; totalCost: number; woCount: number }[];
  }> => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (buildingYear) params.set('buildingYear', String(buildingYear));
    const qs = params.size ? `?${params}` : '';
    const res = await fetch(`${API_URL}/api/work-orders/insights${qs}`);
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to load insights: ${t}`); }
    return res.json();
  },

  getWorkOrderSuggestions: async (): Promise<{
    woNumbers: string[]; descriptions: string[]; equipment: string[]; buildings: string[];
  }> => {
    const res = await fetch(`${API_URL}/api/work-orders/suggestions`);
    if (!res.ok) return { woNumbers: [], descriptions: [], equipment: [], buildings: [] };
    return res.json();
  },

  cleanTranscript: async (rawTranscript: string): Promise<{ cleaned: string; summary: string }> => {
    const res = await fetch(`${API_URL}/api/work-orders/clean-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawTranscript }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Transcript cleanup failed: ${t}`); }
    return res.json();
  },

  completionChat: async (payload: {
    messages: { role: 'user' | 'model'; parts: { text: string }[] }[];
    extracted: { completionDate: string | null; hours: number | null; collaborators: string[]; completionRemark: string | null };
    woContext: { woNumber: string; description: string | null; buildingCode: string | null; roomNumber: string | null; equipmentRaw: string | null };
    staffNames: string[];
    todayDate: string;
  }): Promise<{
    reply: string;
    extracted: { completionDate: string | null; hours: number | null; collaborators: string[]; completionRemark: string | null };
    nextStep: 'continue' | 'confirm' | 'done' | 'skip';
  }> => {
    const res = await fetch(`${API_URL}/api/work-orders/completion-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Completion chat failed: ${t}`); }
    return res.json();
  },

  submitWorkOrderCompletion: async (
    id: string,
    data: {
      staffIds: string[]; staffNames: string[]; completedAt: string;
      completionHours: number | null; rawTranscript: string;
      technicianNotes: string; completionRemark: string;
      completionImageUrl?: string | null;
    }
  ): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}/complete`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to submit completion: ${t}`); }
    return res.json();
  },

  extractCompletionImage: async (
    imageBase64: string,
    mimeType: string,
    staffNames: string[]
  ): Promise<{
    woNumber: string | null;
    completionDate: string | null;
    hours: number | null;
    completedBy: string[];
    completionRemark: string | null;
    confidence: 'high' | 'medium' | 'low';
  }> => {
    const res = await fetch(`${API_URL}/api/work-orders/extract-completion-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType, staffNames }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Extraction failed: ${t}`); }
    return res.json();
  },

  approveWorkOrder: async (id: string): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}/approve`, {
      method: 'POST',
      headers: writeHeaders(),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to approve work order: ${t}`); }
    return res.json();
  },

  checkDuplicateWorkOrders: async (
    workOrderNumbers: string[]
  ): Promise<Record<string, { id: string; workOrderNumber: string; status: string | null; openDate: string | null; buildingCode: string | null; buildingName: string | null }>> => {
    const res = await fetch(`${API_URL}/api/work-orders/check-duplicates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderNumbers }),
    });
    if (!res.ok) return {};
    return res.json();
  },

  updateWorkOrder: async (
    id: string,
    data: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'technicians' | 'annotations'> & { technicians: ParsedWorkOrder['technicians'] }
  ): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}`, {
      method: 'PUT',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to update work order: ${t}`); }
    return res.json();
  },

  // ── Handoff API ──────────────────────────────────────────────────────────────

  getHandoffs: async (): Promise<import('./types').WorkOrderHandoff[]> => {
    const res = await fetch(`${API_URL}/api/work-orders/handoffs`);
    if (!res.ok) return [];
    return res.json();
  },

  passOnWorkOrder: async (id: string, data: {
    fromStaffId?: string; fromStaffName?: string;
    reason: string; handoffNote?: string;
  }): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}/pass-on`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to pass on work order: ${t}`); }
    return res.json();
  },

  resolveHandoff: async (handoffId: string, data: {
    toStaffId: string; toStaffName: string;
  }): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/handoffs/${handoffId}/resolve`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to resolve handoff: ${t}`); }
    return res.json();
  },

  getWorkOrder: async (id: string): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}`);
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to load work order: ${t}`); }
    return res.json();
  },

  createWorkOrder: async (
    wo: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'technicians' | 'annotations'> & { technicians: ParsedWorkOrder['technicians'] }
  ): Promise<WorkOrder> => {
    const res = await fetch(`${API_URL}/api/work-orders`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(wo),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to create work order: ${t}`); }
    return res.json();
  },

  deleteWorkOrder: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/work-orders/${id}`, { method: 'DELETE', headers: writeHeaders() });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to delete work order: ${t}`); }
  },

  addWorkOrderAnnotation: async (
    workOrderId: string, authorName: string, text: string, staffId?: string
  ): Promise<WorkOrderAnnotation> => {
    const res = await fetch(`${API_URL}/api/work-orders/${workOrderId}/annotations`, {
      method: 'POST',
      headers: writeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ authorName, text, staffId }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Failed to add annotation: ${t}`); }
    return res.json();
  },

  getEquipmentWorkOrders: async (equipmentId: string): Promise<WorkOrder[]> => {
    const res = await fetch(`${API_URL}/api/work-orders/equipment/${encodeURIComponent(equipmentId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  },
};