import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Equipment, MaintenanceRoom, BuildingData, FloorPlan } from '../../types';

// Mock fetch globally
global.fetch = vi.fn();

// Mock the API module to control VITE_API_URL
const mockApiUrl = 'https://test-api.com';

// We need to dynamically import the API after setting the env
// For now, let's create a test helper that uses the actual API but mocks fetch
describe('API Functions', () => {
  let api: any;
  
  beforeEach(async () => {
    vi.resetAllMocks();
    // Mock the environment variable
    vi.stubEnv('VITE_API_URL', mockApiUrl);
    // Dynamically import API after env is set
    const apiModule = await import('../../api');
    api = apiModule.api;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const result = await api.healthCheck();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(`${mockApiUrl}/api/health`);
    });

    it('should return false when API is unhealthy', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      const result = await api.healthCheck();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await api.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('getAllData', () => {
    it('should return building data on success', async () => {
      const mockData: BuildingData[] = [
        {
          code: 'BIO',
          name: 'Biology Building',
          maintenanceRooms: [],
          equipment: [],
          floorPlans: [],
        },
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await api.getAllData();
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(`${mockApiUrl}/api/data`);
    });

    it('should throw error on API failure', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(api.getAllData()).rejects.toThrow('Failed to fetch data');
    });

    it('should parse JSON error messages', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Invalid request' }),
      });

      await expect(api.getAllData()).rejects.toThrow('Invalid request');
    });

    it('should handle network errors', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(api.getAllData()).rejects.toThrow();
    });
  });

  describe('saveEquipment', () => {
    const mockEquipment: Equipment = {
      id: 'EQ-1',
      accountingName: 'Test Equipment',
      previousAccountingName: null,
      scadaName: 'SCADA-1',
      description: 'Description',
      notes: '',
      Location: 'BIO',
      LocationDesc: 'Biology Building',
      room: '101',
      KeyAccess: '',
      AssetTag: '',
      serialNum: 'SN123',
      manufacturer: 'Test Mfg',
      Model: '',
      vendor: 'Test Vendor',
      PurchaseDate: '',
      WarrantyDate: '',
      images: [],
      status: 'OPERATING',
    };

    it('should save equipment successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEquipment,
      });

      const result = await api.saveEquipment(mockEquipment);
      expect(result).toEqual(mockEquipment);
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/equipment`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockEquipment),
        })
      );
    });

    it('should handle save failures', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Validation error',
      });

      await expect(api.saveEquipment(mockEquipment)).rejects.toThrow('Failed to save equipment');
    });

    it('should handle network errors', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(api.saveEquipment(mockEquipment)).rejects.toThrow();
    });
  });

  describe('saveRoom', () => {
    const mockRoom: MaintenanceRoom = {
      id: 'BIO-101',
      Building: 'BIO',
      RoomNumber: '101',
      Description: 'Test Room',
      Floor: '1',
      Notes: '',
    };

    it('should save room successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRoom,
      });

      const result = await api.saveRoom(mockRoom);
      expect(result).toEqual(mockRoom);
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/rooms`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRoom),
        })
      );
    });

    it('should handle save failures', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Validation error',
      });

      await expect(api.saveRoom(mockRoom)).rejects.toThrow('Failed to save room');
    });
  });

  describe('saveBuilding', () => {
    const mockBuilding: Partial<BuildingData> = {
      code: 'BIO',
      name: 'Biology Building',
    };

    it('should save building successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await api.saveBuilding(mockBuilding);
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/buildings`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockBuilding),
        })
      );
    });

    it('should handle save failures', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Validation error',
      });

      await expect(api.saveBuilding(mockBuilding)).rejects.toThrow('Failed to save building');
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return URL', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/test.jpg' }),
      });

      const url = await api.uploadFile(file);
      expect(url).toBe('https://cdn.example.com/test.jpg');
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/upload`,
        expect.objectContaining({
          method: 'PUT',
          body: file,
        })
      );
    });

    it('should include old image URL header when replacing', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const oldUrl = 'https://cdn.example.com/old.jpg';

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/new.jpg' }),
      });

      await api.uploadFile(file, oldUrl);
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/upload`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Old-Image-Url': oldUrl,
          }),
        })
      );
    });

    it('should detect file extension from filename', async () => {
      const file = new File(['test'], 'image.png', { type: 'image/png' });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/image.png' }),
      });

      await api.uploadFile(file);
      const callArgs = (fetch as any).mock.calls[0];
      expect(callArgs[1].headers['X-File-Extension']).toBe('png');
    });

    it('should fallback to MIME type when extension not in filename', async () => {
      const file = new File(['test'], 'image', { type: 'image/jpeg' });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/image.jpg' }),
      });

      await api.uploadFile(file);
      const callArgs = (fetch as any).mock.calls[0];
      expect(callArgs[1].headers['X-File-Extension']).toBe('jpg');
    });

    it('should handle upload failures', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 413,
        text: async () => 'File too large',
      });

      await expect(api.uploadFile(file)).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteEquipment', () => {
    it('should delete equipment successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await api.deleteEquipment('EQ-1');
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/equipment/EQ-1`,
        { method: 'DELETE' }
      );
    });

    it('should handle delete failures', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      await expect(api.deleteEquipment('EQ-1')).rejects.toThrow('Failed to delete equipment');
    });
  });

  describe('deleteRoom', () => {
    it('should delete room successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await api.deleteRoom('BIO-101');
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/rooms/BIO-101`,
        { method: 'DELETE' }
      );
    });

    it('should handle delete failures', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      await expect(api.deleteRoom('BIO-101')).rejects.toThrow('Failed to delete room');
    });
  });

  describe('deleteImage', () => {
    it('should delete image successfully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await api.deleteImage('https://cdn.example.com/image.jpg');
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/delete-image`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: 'https://cdn.example.com/image.jpg' }),
        })
      );
    });

    it('should not throw on delete failure (non-blocking)', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      // Should not throw
      await expect(api.deleteImage('https://cdn.example.com/image.jpg')).resolves.not.toThrow();
    });

    it('should return early if imageUrl is empty', async () => {
      await api.deleteImage('');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
