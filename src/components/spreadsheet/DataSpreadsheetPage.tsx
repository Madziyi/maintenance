import React, { useEffect, useMemo, useState } from 'react';
import { BuildingData, Equipment, MaintenanceRoom } from '../../../types';
import { api } from '../../../api';
import { useToast } from '@/src/components/common/Toast';
import { Database, Filter, RefreshCw, Search, Type, X } from 'lucide-react';

type Props = {
  data: BuildingData[];
  canEdit: boolean;
  onRefreshData: () => Promise<void> | void;
};

type TabId = 'equipment' | 'rooms';

type EquipmentDraft = Partial<
  Pick<
    Equipment,
    'accountingName' | 'scadaName' | 'description' | 'room' | 'notes' | 'manufacturer' | 'serialNum' | 'vendor' | 'status'
  >
>;

type RoomDraft = Partial<Pick<MaintenanceRoom, 'RoomNumber' | 'Description' | 'Floor' | 'KeyAccess' | 'Notes'>>;

type SortDirection = 'asc' | 'desc';

interface EquipmentRow {
  equipment: Equipment;
  buildingCode: string;
  buildingName: string;
}

interface RoomRow {
  room: MaintenanceRoom;
  buildingCode: string;
  buildingName: string;
}

export const DataSpreadsheetPage: React.FC<Props> = ({ data, canEdit, onRefreshData }) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>('equipment');

  const [equipmentRows, setEquipmentRows] = useState<EquipmentRow[]>([]);
  const [roomRows, setRoomRows] = useState<RoomRow[]>([]);

  // Drafts
  const [equipmentDrafts, setEquipmentDrafts] = useState<Record<string, EquipmentDraft>>({});
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomDraft>>({});

  // Autosave
  const [autosave, setAutosave] = useState(true);

  // Filter / search
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');

  // Find & replace
  const [equipFind, setEquipFind] = useState('');
  const [equipReplace, setEquipReplace] = useState('');
  const [equipFindColumn, setEquipFindColumn] = useState<'all' | keyof EquipmentDraft>('all');

  const [roomFind, setRoomFind] = useState('');
  const [roomReplace, setRoomReplace] = useState('');
  const [roomFindColumn, setRoomFindColumn] = useState<'all' | keyof RoomDraft>('all');

  // Sorting
  const [equipSortKey, setEquipSortKey] = useState<keyof EquipmentDraft | 'Location' | 'buildingName' | null>(null);
  const [equipSortDir, setEquipSortDir] = useState<SortDirection>('asc');

  const [roomSortKey, setRoomSortKey] = useState<keyof RoomDraft | 'Building' | 'buildingName' | null>(null);
  const [roomSortDir, setRoomSortDir] = useState<SortDirection>('asc');

  const [savingEquip, setSavingEquip] = useState(false);
  const [savingRooms, setSavingRooms] = useState(false);

  // Build base rows from data
  useEffect(() => {
    const nextEquip: EquipmentRow[] = [];
    const nextRooms: RoomRow[] = [];

    for (const b of data) {
      for (const eq of b.equipment) {
        nextEquip.push({ equipment: eq, buildingCode: b.code, buildingName: b.name });
      }
      for (const room of b.maintenanceRooms) {
        nextRooms.push({ room, buildingCode: b.code, buildingName: b.name });
      }
    }

    setEquipmentRows(nextEquip);
    setRoomRows(nextRooms);
    // When backing data changes, clear drafts (they no longer match server state)
    setEquipmentDrafts({});
    setRoomDrafts({});
  }, [data]);

  const equipmentDirtyCount = useMemo(() => Object.keys(equipmentDrafts).length, [equipmentDrafts]);
  const roomDirtyCount = useMemo(() => Object.keys(roomDrafts).length, [roomDrafts]);

  const equipmentFiltered = useMemo(() => {
    const term = equipmentFilter.trim().toLowerCase();
    const rowsWithDraftApplied = equipmentRows.map(row => {
      const draft = equipmentDrafts[row.equipment.id] || {};
      return { ...row, draft };
    });

    let out = rowsWithDraftApplied;
    if (term) {
      out = out.filter(r => {
        const e = r.equipment;
        const d = r.draft;
        const values: string[] = [
          (d.accountingName ?? e.accountingName) || '',
          (d.scadaName ?? e.scadaName) || '',
          (d.description ?? e.description) || '',
          (d.room ?? e.room) || '',
          (d.notes ?? e.notes) || '',
          (d.manufacturer ?? e.manufacturer) || '',
          (d.serialNum ?? e.serialNum) || '',
          (d.vendor ?? e.vendor) || '',
          r.buildingCode || '',
          r.buildingName || '',
          e.Location || '',
        ];
        return values.some(v => v.toLowerCase().includes(term));
      });
    }

    if (equipSortKey || equipSortKey === 'Location' || equipSortKey === 'buildingName') {
      const key = equipSortKey;
      const dir = equipSortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const getVal = (row: typeof a) => {
          if (key === 'Location') return row.equipment.Location || '';
          if (key === 'buildingName') return row.buildingName || '';
          const draft = row.draft;
          const eq = row.equipment;
          const v = (draft as any)?.[key] ?? (eq as any)?.[key] ?? '';
          return typeof v === 'string' ? v : String(v ?? '');
        };
        const va = getVal(a).toLowerCase();
        const vb = getVal(b).toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }

    return out;
  }, [equipmentRows, equipmentDrafts, equipmentFilter, equipSortKey, equipSortDir]);

  const roomFiltered = useMemo(() => {
    const term = roomFilter.trim().toLowerCase();
    const rowsWithDraftApplied = roomRows.map(row => {
      const draft = roomDrafts[row.room.id] || {};
      return { ...row, draft };
    });

    let out = rowsWithDraftApplied;
    if (term) {
      out = out.filter(r => {
        const room = r.room;
        const d = r.draft;
        const values: string[] = [
          (d.RoomNumber ?? room.RoomNumber) || '',
          (d.Description ?? room.Description) || '',
          (d.Floor ?? room.Floor) || '',
          (d.KeyAccess ?? room.KeyAccess) || '',
          (d.Notes ?? room.Notes) || '',
          r.buildingCode || '',
          r.buildingName || '',
        ];
        return values.some(v => v.toLowerCase().includes(term));
      });
    }

    if (roomSortKey || roomSortKey === 'Building' || roomSortKey === 'buildingName') {
      const key = roomSortKey;
      const dir = roomSortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const getVal = (row: typeof a) => {
          if (key === 'Building') return row.buildingCode || '';
          if (key === 'buildingName') return row.buildingName || '';
          const draft = row.draft;
          const rm = row.room;
          const v = (draft as any)?.[key] ?? (rm as any)?.[key] ?? '';
          return typeof v === 'string' ? v : String(v ?? '');
        };
        const va = getVal(a).toLowerCase();
        const vb = getVal(b).toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }

    return out;
  }, [roomRows, roomDrafts, roomFilter, roomSortKey, roomSortDir]);

  // Autosave effects (simple debounce)
  useEffect(() => {
    if (!autosave) return;
    if (!equipmentDirtyCount) return;
    const handle = setTimeout(() => {
      void saveAllEquipment(true);
    }, 2000);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentDrafts, autosave]);

  useEffect(() => {
    if (!autosave) return;
    if (!roomDirtyCount) return;
    const handle = setTimeout(() => {
      void saveAllRooms(true);
    }, 2000);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomDrafts, autosave]);

  const setEquipSort = (key: keyof EquipmentDraft | 'Location' | 'buildingName') => {
    setEquipSortKey(prevKey => {
      if (prevKey === key) {
        setEquipSortDir(prevDir => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setEquipSortDir('asc');
      return key;
    });
  };

  const setRoomSort = (key: keyof RoomDraft | 'Building' | 'buildingName') => {
    setRoomSortKey(prevKey => {
      if (prevKey === key) {
        setRoomSortDir(prevDir => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setRoomSortDir('asc');
      return key;
    });
  };

  const applyEquipmentDraft = (id: string, patch: Partial<EquipmentDraft>) => {
    setEquipmentDrafts(prev => {
      const next = { ...(prev[id] || {}), ...patch };
      // Trim empty drafts (no keys or only unchanged empty strings)
      const hasValues = Object.keys(next).some(k => (next as any)[k] !== undefined);
      if (!hasValues) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const applyRoomDraft = (id: string, patch: Partial<RoomDraft>) => {
    setRoomDrafts(prev => {
      const next = { ...(prev[id] || {}), ...patch };
      const hasValues = Object.keys(next).some(k => (next as any)[k] !== undefined);
      if (!hasValues) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const revertEquipmentRow = (id: string) => {
    setEquipmentDrafts(prev => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const revertRoomRow = (id: string) => {
    setRoomDrafts(prev => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const saveAllEquipment = async (silent = false) => {
    if (!canEdit) return;
    const entries = Object.entries(equipmentDrafts);
    if (!entries.length) return;

    setSavingEquip(true);
    try {
      // Save via review bulk-update endpoint for fields it supports
      const updates = entries.map(([id, draft]) => ({
        id,
        accountingName: draft.accountingName,
        scadaName: draft.scadaName,
        description: draft.description,
        room: draft.room,
        notes: draft.notes,
        manufacturer: draft.manufacturer,
        serialNum: draft.serialNum,
        vendor: draft.vendor,
        status: draft.status,
      }));

      await api.bulkUpdateEquipmentReview(updates);

      // After server save, clear equipment drafts and refresh backing data
      setEquipmentDrafts({});
      await onRefreshData();
      if (!silent) showToast('Equipment changes saved', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save equipment changes', 'error');
    } finally {
      setSavingEquip(false);
    }
  };

  const saveAllRooms = async (silent = false) => {
    if (!canEdit) return;
    const entries = Object.entries(roomDrafts);
    if (!entries.length) return;

    setSavingRooms(true);
    try {
      for (const [id, draft] of entries) {
        const baseRow = roomRows.find(r => r.room.id === id);
        if (!baseRow) continue;
        const room = baseRow.room;
        const updated: MaintenanceRoom = {
          ...room,
          RoomNumber: draft.RoomNumber ?? room.RoomNumber,
          Description: draft.Description ?? room.Description,
          Floor: draft.Floor ?? room.Floor,
          KeyAccess: draft.KeyAccess ?? room.KeyAccess,
          Notes: draft.Notes ?? room.Notes,
        };
        await api.saveRoom(updated);
      }
      setRoomDrafts({});
      await onRefreshData();
      if (!silent) showToast('Room changes saved', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save room changes', 'error');
    } finally {
      setSavingRooms(false);
    }
  };

  const handleEquipmentReplaceAll = () => {
    if (!equipFind) return;
    const needle = equipFind;

    const targetFields: (keyof EquipmentDraft)[] =
      equipFindColumn === 'all'
        ? ['accountingName', 'scadaName', 'description', 'room', 'notes', 'manufacturer', 'serialNum', 'vendor', 'status']
        : [equipFindColumn];

    setEquipmentDrafts(prev => {
      const next: Record<string, EquipmentDraft> = { ...prev };

      for (const row of equipmentRows) {
        const id = row.equipment.id;
        const baseDraft = next[id] || {};
        let changed = false;
        const patch: EquipmentDraft = { ...baseDraft };
        for (const field of targetFields) {
          const original = (baseDraft as any)[field] ?? (row.equipment as any)[field];
          if (typeof original !== 'string') continue;
          if (!original.includes(needle)) continue;
          const replaced = original.split(needle).join(equipReplace);
          if (replaced !== original) {
            (patch as any)[field] = replaced;
            changed = true;
          }
        }
        if (changed) {
          next[id] = patch;
        }
      }

      return next;
    });
  };

  const handleRoomReplaceAll = () => {
    if (!roomFind) return;
    const needle = roomFind;

    const targetFields: (keyof RoomDraft)[] =
      roomFindColumn === 'all' ? ['RoomNumber', 'Description', 'Floor', 'KeyAccess', 'Notes'] : [roomFindColumn];

    setRoomDrafts(prev => {
      const next: Record<string, RoomDraft> = { ...prev };

      for (const row of roomRows) {
        const id = row.room.id;
        const baseDraft = next[id] || {};
        let changed = false;
        const patch: RoomDraft = { ...baseDraft };
        for (const field of targetFields) {
          const original = (baseDraft as any)[field] ?? (row.room as any)[field];
          if (typeof original !== 'string') continue;
          if (!original.includes(needle)) continue;
          const replaced = original.split(needle).join(roomReplace);
          if (replaced !== original) {
            (patch as any)[field] = replaced;
            changed = true;
          }
        }
        if (changed) {
          next[id] = patch;
        }
      }

      return next;
    });
  };

  const equipmentHeader = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
      <div className="flex items-center gap-2">
        <Database className="text-brand-600" size={20} />
        <div>
          <div className="text-sm font-semibold text-slate-900">Equipment table</div>
          <div className="text-xs text-slate-500">
            {equipmentRows.length} rows • {equipmentDirtyCount} edited
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={autosave}
            onChange={e => setAutosave(e.target.checked)}
          />
          Autosave
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Filter rows…"
            className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[200px]"
            value={equipmentFilter}
            onChange={e => setEquipmentFilter(e.target.value)}
          />
        </div>
        <button
          onClick={() => {
            setEquipmentDrafts({});
          }}
          disabled={!equipmentDirtyCount || savingEquip}
          className="px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Discard edits
        </button>
        <button
          onClick={() => saveAllEquipment(false)}
          disabled={!equipmentDirtyCount || savingEquip || !canEdit}
          className="px-3 py-1.5 text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {savingEquip && <RefreshCw size={14} className="animate-spin" />}
          Save all
        </button>
      </div>
    </div>
  );

  const roomsHeader = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
      <div className="flex items-center gap-2">
        <Database className="text-brand-600" size={20} />
        <div>
          <div className="text-sm font-semibold text-slate-900">Room table</div>
          <div className="text-xs text-slate-500">
            {roomRows.length} rows • {roomDirtyCount} edited
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={autosave}
            onChange={e => setAutosave(e.target.checked)}
          />
          Autosave
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Filter rows…"
            className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[200px]"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
          />
        </div>
        <button
          onClick={() => {
            setRoomDrafts({});
          }}
          disabled={!roomDirtyCount || savingRooms}
          className="px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Discard edits
        </button>
        <button
          onClick={() => saveAllRooms(false)}
          disabled={!roomDirtyCount || savingRooms || !canEdit}
          className="px-3 py-1.5 text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {savingRooms && <RefreshCw size={14} className="animate-spin" />}
          Save all
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Mobile guard */}
      <div className="md:hidden fixed inset-0 z-40 flex items-center justify-center p-6 bg-white/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl p-6 text-center">
          <div className="flex justify-center mb-3">
            <Database className="text-brand-600" size={28} />
          </div>
          <div className="text-lg font-semibold text-slate-900">Spreadsheet view</div>
          <div className="text-sm text-slate-600 mt-2">
            Please use a desktop or tablet to use the spreadsheet editor.
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Data spreadsheet</h1>
          <p className="text-slate-500 text-sm mt-1">
            Edit equipment and maintenance room records with spreadsheet-style tools.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200 flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1">
            <button
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                activeTab === 'equipment'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setActiveTab('equipment')}
            >
              Equipment
            </button>
            <button
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                activeTab === 'rooms'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setActiveTab('rooms')}
            >
              Rooms
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Filter size={14} />
            Sort columns A–Z / Z–A by clicking headers. Use find &amp; replace for bulk edits.
          </div>
        </div>

        <div className="p-4">
          {activeTab === 'equipment' ? equipmentHeader : roomsHeader}

          {/* Find & Replace bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
            <Type size={14} className="text-slate-400" />
            <span className="font-medium text-slate-700">Find &amp; replace</span>
            {activeTab === 'equipment' ? (
              <>
                <input
                  type="text"
                  placeholder="Find…"
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={equipFind}
                  onChange={e => setEquipFind(e.target.value)}
                />
                <span className="text-slate-400">→</span>
                <input
                  type="text"
                  placeholder="Replace with…"
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={equipReplace}
                  onChange={e => setEquipReplace(e.target.value)}
                />
                <select
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={equipFindColumn}
                  onChange={e => setEquipFindColumn(e.target.value as any)}
                >
                  <option value="all">All columns</option>
                  <option value="accountingName">Accounting name</option>
                  <option value="scadaName">SCADA</option>
                  <option value="description">Description</option>
                  <option value="room">Room</option>
                  <option value="notes">Notes</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="serialNum">Serial</option>
                  <option value="vendor">Vendor</option>
                  <option value="status">Status</option>
                </select>
                <button
                  onClick={handleEquipmentReplaceAll}
                  disabled={!equipFind}
                  className="px-3 py-1.5 rounded-md bg-slate-900 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Replace all
                </button>
                {(equipFind || equipReplace) && (
                  <button
                    onClick={() => {
                      setEquipFind('');
                      setEquipReplace('');
                    }}
                    className="ml-1 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Find…"
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={roomFind}
                  onChange={e => setRoomFind(e.target.value)}
                />
                <span className="text-slate-400">→</span>
                <input
                  type="text"
                  placeholder="Replace with…"
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={roomReplace}
                  onChange={e => setRoomReplace(e.target.value)}
                />
                <select
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={roomFindColumn}
                  onChange={e => setRoomFindColumn(e.target.value as any)}
                >
                  <option value="all">All columns</option>
                  <option value="RoomNumber">Room</option>
                  <option value="Description">Description</option>
                  <option value="Floor">Floor</option>
                  <option value="KeyAccess">Key access</option>
                  <option value="Notes">Notes</option>
                </select>
                <button
                  onClick={handleRoomReplaceAll}
                  disabled={!roomFind}
                  className="px-3 py-1.5 rounded-md bg-slate-900 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Replace all
                </button>
                {(roomFind || roomReplace) && (
                  <button
                    onClick={() => {
                      setRoomFind('');
                      setRoomReplace('');
                    }}
                    className="ml-1 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            {activeTab === 'equipment' ? (
              <table className="min-w-[1600px] w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    <SortableHeader label="Accounting name" onClick={() => setEquipSort('accountingName')} />
                    <SortableHeader label="SCADA" onClick={() => setEquipSort('scadaName')} />
                    <SortableHeader label="Description" onClick={() => setEquipSort('description')} />
                    <SortableHeader label="Building" onClick={() => setEquipSort('Location')} />
                    <SortableHeader label="Room" onClick={() => setEquipSort('room')} />
                    <SortableHeader label="Status" onClick={() => setEquipSort('status')} />
                    <SortableHeader label="Manufacturer" onClick={() => setEquipSort('manufacturer')} />
                    <SortableHeader label="Serial" onClick={() => setEquipSort('serialNum')} />
                    <SortableHeader label="Vendor" onClick={() => setEquipSort('vendor')} />
                    <th className="px-3 py-2 w-64">Notes</th>
                    <th className="px-3 py-2 w-24">Revert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {equipmentFiltered.map(row => {
                    const eq = row.equipment;
                    const draft = equipmentDrafts[eq.id] || {};
                    const isDirty = !!equipmentDrafts[eq.id];
                    return (
                      <tr key={eq.id} className={isDirty ? 'bg-brand-50/40' : ''}>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.accountingName ?? eq.accountingName ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { accountingName: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.scadaName ?? eq.scadaName ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { scadaName: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.description ?? eq.description ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { description: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap" title={row.buildingName}>
                          {eq.Location}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.room ?? eq.room ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { room: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={draft.status ?? eq.status ?? 'UNKNOWN'}
                            onChange={e => applyEquipmentDraft(eq.id, { status: e.target.value as Equipment['status'] })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          >
                            <option value="OPERATING">OPERATING</option>
                            <option value="REPAIR">REPAIR</option>
                            <option value="ONSHELF">ONSHELF</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="REMOVED">REMOVED</option>
                            <option value="UNKNOWN">UNKNOWN</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.manufacturer ?? eq.manufacturer ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { manufacturer: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.serialNum ?? eq.serialNum ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { serialNum: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.vendor ?? eq.vendor ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { vendor: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.notes ?? eq.notes ?? ''}
                            onChange={e => applyEquipmentDraft(eq.id, { notes: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => revertEquipmentRow(eq.id)}
                            disabled={!isDirty}
                            className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Revert
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {equipmentFiltered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-xs text-slate-500">
                        No equipment rows match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-[1100px] w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    <SortableHeader label="Building" onClick={() => setRoomSort('Building')} />
                    <SortableHeader label="Room" onClick={() => setRoomSort('RoomNumber')} />
                    <SortableHeader label="Description" onClick={() => setRoomSort('Description')} />
                    <SortableHeader label="Floor" onClick={() => setRoomSort('Floor')} />
                    <SortableHeader label="Key access" onClick={() => setRoomSort('KeyAccess')} />
                    <th className="px-3 py-2 w-64">Notes</th>
                    <th className="px-3 py-2 w-24">Revert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roomFiltered.map(row => {
                    const room = row.room;
                    const draft = roomDrafts[room.id] || {};
                    const isDirty = !!roomDrafts[room.id];
                    return (
                      <tr key={room.id} className={isDirty ? 'bg-brand-50/40' : ''}>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap" title={row.buildingName}>
                          {row.buildingCode}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.RoomNumber ?? room.RoomNumber ?? ''}
                            onChange={e => applyRoomDraft(room.id, { RoomNumber: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.Description ?? room.Description ?? ''}
                            onChange={e => applyRoomDraft(room.id, { Description: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.Floor ?? room.Floor ?? ''}
                            onChange={e => applyRoomDraft(room.id, { Floor: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.KeyAccess ?? room.KeyAccess ?? ''}
                            onChange={e => applyRoomDraft(room.id, { KeyAccess: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={draft.Notes ?? room.Notes ?? ''}
                            onChange={e => applyRoomDraft(room.id, { Notes: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => revertRoomRow(room.id)}
                            disabled={!isDirty}
                            className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Revert
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {roomFiltered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-500">
                        No room rows match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SortableHeader: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => {
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none hover:bg-slate-100"
      onClick={onClick}
    >
      <div className="inline-flex items-center gap-1">
        <span>{label}</span>
      </div>
    </th>
  );
};

