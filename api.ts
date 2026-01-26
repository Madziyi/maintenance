import * as Sentry from "@sentry/react";
import { BuildingData, Equipment, MaintenanceRoom, FloorPlan } from './types';

const API_URL = import.meta.env.VITE_API_URL;

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
        headers: { 'Content-Type': 'application/json' },
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
          Pick<Equipment, 'Equipment' | 'EquipmentDesc' | 'Room' | 'Notes' | 'Manufacturer' | 'SerialNum' | 'Vendor' | 'status'>
        >
    >
  ): Promise<Equipment[]> => {
    return withSentryTracking("API: bulkUpdateEquipmentReview", async () => {
      const res = await fetch(`${API_URL}/api/equipment-review/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  saveRoom: async (room: MaintenanceRoom): Promise<MaintenanceRoom> => {
    return withSentryTracking("API: saveRoom", async () => {
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildingCode, plan })
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/floorplans:", text);
        throw new Error(`Failed to save floor plan: ${text}`);
    }
  },

  deleteEquipment: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/equipment/${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error delete /api/equipment:", text);
        throw new Error(`Failed to delete equipment: ${text}`);
    }
  },

  deleteRoom: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/rooms/${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error delete /api/rooms:", text);
        throw new Error(`Failed to delete room: ${text}`);
    }
  },

  deleteFloorPlan: async (id: string): Promise<void> => {
     const res = await fetch(`${API_URL}/api/floorplans/${id}`, { method: 'DELETE' });
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
      
      const headers: HeadersInit = {};
      if (oldImageUrl) {
        headers['X-Old-Image-Url'] = oldImageUrl;
      }
      // Send filename and extension as custom headers for the server to use
      headers['X-File-Name'] = fileName;
      headers['X-File-Extension'] = fileExtension;
      headers['Content-Type'] = file.type || 'application/octet-stream';
      
      // Send file as raw body (not FormData) so we can control headers better
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'PUT',
        headers: headers,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl })
    });
    
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/delete-image:", text);
        // Don't throw - deletion failure shouldn't block the UI
    }
  }
};