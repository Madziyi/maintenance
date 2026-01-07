import { BuildingData, Equipment, MaintenanceRoom, FloorPlan } from './types';
import { loadData as loadCsvData } from './constants';

// This would come from process.env in a real build
// For local dev/preview, we might default to a placeholder or localhost
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

  // Initialize DB with CSV data (One time setup)
  seedDatabase: async (): Promise<void> => {
    const data = loadCsvData();
    const res = await fetch(`${API_URL}/api/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to seed database');
  },

  // Get all data structured as BuildingData[]
  getAllData: async (): Promise<BuildingData[]> => {
    try {
      const res = await fetch(`${API_URL}/api/data`);
      if (!res.ok) throw new Error('Failed to fetch data');
      return await res.json();
    } catch (e) {
      console.warn("API unavailable, falling back to local CSV for preview.");
      // Fallback for preview mode so app doesn't crash before backend deployment
      return loadCsvData(); 
    }
  },

  // Save specific entities
  saveEquipment: async (eq: Equipment): Promise<Equipment> => {
    const res = await fetch(`${API_URL}/api/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eq)
    });
    if (!res.ok) throw new Error('Failed to save equipment');
    return await res.json();
  },

  saveRoom: async (room: MaintenanceRoom): Promise<MaintenanceRoom> => {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    });
    if (!res.ok) throw new Error('Failed to save room');
    return await res.json();
  },

  saveBuilding: async (building: Partial<BuildingData>): Promise<void> => {
     const res = await fetch(`${API_URL}/api/buildings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(building)
    });
    if (!res.ok) throw new Error('Failed to save building');
  },

  saveFloorPlan: async (buildingCode: string, plan: FloorPlan): Promise<void> => {
    const res = await fetch(`${API_URL}/api/floorplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildingCode, plan })
    });
    if (!res.ok) throw new Error('Failed to save floor plan');
  },

  deleteFloorPlan: async (id: string): Promise<void> => {
     await fetch(`${API_URL}/api/floorplans/${id}`, { method: 'DELETE' });
  },

  // Upload to R2 via Worker
  uploadFile: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_URL}/api/upload`, {
      method: 'PUT',
      body: formData
    });
    
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url; // Returns the public R2 URL
  }
};