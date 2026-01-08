import { BuildingData, Equipment, MaintenanceRoom, FloorPlan } from './types';

const API_URL = 'https://equiplocate.uwindsorfacility.workers.dev'; 

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
    const res = await fetch(`${API_URL}/api/data`);
    if (!res.ok) {
        let errorText = await res.text();
        console.error("API Error /api/data:", res.status, errorText);
        try {
            // If error text is JSON, parse it for better DX
            const jsonErr = JSON.parse(errorText);
            if (jsonErr.error) errorText = jsonErr.error;
        } catch (e) { /* ignore */ }
        
        throw new Error(`Failed to fetch data: ${res.status} - ${errorText}`);
    }
    return await res.json();
  },

  // Save specific entities
  saveEquipment: async (eq: Equipment): Promise<Equipment> => {
    const res = await fetch(`${API_URL}/api/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eq)
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/equipment:", text);
        throw new Error(`Failed to save equipment: ${text}`);
    }
    return await res.json();
  },

  saveRoom: async (room: MaintenanceRoom): Promise<MaintenanceRoom> => {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("API Error /api/rooms:", text);
        throw new Error(`Failed to save room: ${text}`);
    }
    return await res.json();
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
        throw new Error(`Upload failed: ${text}`);
    }
    const data = await res.json();
    return data.url; // Returns the public R2 URL
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