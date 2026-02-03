import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../api';
import { BuildingData, Equipment } from '../../../types';
import { useToast } from '@/src/components/common/Toast';
import { ArrowLeft, Check, Image as ImageIcon, List, Maximize2, Minimize2, Pencil, RefreshCw } from 'lucide-react';

type SortMode = 'updated' | 'created';
type ViewMode = 'sheet' | 'photos';

type Props = {
  data: BuildingData[];
  canEdit: boolean;
  onSetFullScreenImage: (url: string) => void;
};

const STATUSES: Equipment['status'][] = ['OPERATING', 'REPAIR', 'ONSHELF', 'INACTIVE', 'REMOVED', 'UNKNOWN'];

function statusLabel(status?: string | null) {
  return status === 'REMOVED' ? 'Deleted' : (status || 'UNKNOWN');
}

function formatIsoShort(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export const EquipmentReviewPage: React.FC<Props> = ({ data, canEdit, onSetFullScreenImage }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = (searchParams.get('sort') === 'created' ? 'created' : 'updated') as SortMode;
  const view = (searchParams.get('view') === 'photos' ? 'photos' : 'sheet') as ViewMode;
  const isFullScreen = searchParams.get('fs') === '1';

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);

  const title = code ? `Review: ${code}` : 'Review: Latest 50';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const next = code
        ? await api.getEquipmentReviewBuilding(code, { sort, mode: view === 'sheet' ? 'all' : 'needs' })
        : await api.getEquipmentReviewLatest({ sort, limit: 50 });
      setItems(next);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load review queue', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, showToast, sort, view]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const setSort = (next: SortMode) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('sort', next);
    setSearchParams(sp, { replace: true });
  };

  const setView = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('view', next);
    setSearchParams(sp, { replace: true });
  };

  const setFullScreen = (next: boolean) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set('fs', '1');
    else sp.delete('fs');
    setSearchParams(sp, { replace: true });
  };

  const buildingName = useMemo(() => {
    if (!code) return null;
    const b = data.find(x => x.code === code);
    return b ? b.name : null;
  }, [code, data]);

  const approveAndRemove = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      try {
        const updated = await api.approveEquipmentReview({ id });
        const updatedMap = new Map(updated.map(u => [u.id, u]));
        setItems(prev => prev.map(p => updatedMap.get(p.id) || p).filter(p => p.id !== id));
      } catch (e: any) {
        showToast(e?.message || 'Failed to approve', 'error');
      }
    },
    [canEdit, showToast]
  );

  const approveAndKeep = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      try {
        const updated = await api.approveEquipmentReview({ id });
        const updatedMap = new Map(updated.map(u => [u.id, u]));
        setItems(prev => prev.map(p => updatedMap.get(p.id) || p));
      } catch (e: any) {
        showToast(e?.message || 'Failed to approve', 'error');
      }
    },
    [canEdit, showToast]
  );

  const handleBulkUpdate = useCallback(
    async (
      updates: Array<
        Pick<Equipment, 'id'> &
          Partial<
            Pick<
              Equipment,
              'accountingName' | 'scadaName' | 'description' | 'room' | 'notes' | 'manufacturer' | 'serialNum' | 'vendor' | 'status'
            >
          >
      >
    ) => {
      if (!canEdit) return [];
      const updated = await api.bulkUpdateEquipmentReview(updates);
      const updatedMap = new Map(updated.map(u => [u.id, u]));
      setItems(prev => prev.map(p => updatedMap.get(p.id) || p));
      return updated;
    },
    [canEdit]
  );

  return (
    <div className={`relative space-y-4 ${view === 'photos' ? 'pb-4' : 'pb-20'} animate-fade-in`}>
      {/* Mobile: block this feature */}
      <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center p-6 bg-white/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl p-6 text-center">
          <div className="text-lg font-semibold text-slate-900">Equipment Review</div>
          <div className="text-sm text-slate-600 mt-2">
            Please use a desktop or tablet to use this feature.
          </div>
          <button
            onClick={() => navigate('/')}
            className="mt-5 w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/equipment-review')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">{title}</h1>
            {buildingName && <p className="text-sm text-slate-500 truncate">{buildingName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white flex-shrink-0">
              <button
                onClick={() => setSort('updated')}
                className={`px-3 py-2 text-sm ${sort === 'updated' ? 'bg-brand-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                Latest updated
              </button>
              <button
                onClick={() => setSort('created')}
                className={`px-3 py-2 text-sm ${sort === 'created' ? 'bg-brand-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                Latest created
              </button>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white flex-shrink-0">
              <button
                onClick={() => setView('sheet')}
                className={`px-3 py-2 text-sm flex items-center gap-2 ${view === 'sheet' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <List size={16} />
                Spreadsheet
              </button>
              <button
                onClick={() => setView('photos')}
                className={`px-3 py-2 text-sm flex items-center gap-2 ${view === 'photos' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <ImageIcon size={16} />
                Photos
              </button>
            </div>

            <button
              onClick={() => setFullScreen(!isFullScreen)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium flex items-center gap-2 flex-shrink-0"
              title={isFullScreen ? 'Exit full screen' : 'Enter full screen'}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {isFullScreen ? 'Exit full screen' : 'Full screen'}
            </button>

            <button
              onClick={fetchItems}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium flex items-center gap-2 flex-shrink-0"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div
        className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${
          view === 'photos' ? 'h-[calc(100vh-190px)]' : ''
        }`}
      >
        {view === 'sheet' ? (
          <SpreadsheetView
            items={items}
            canEdit={canEdit}
            loading={loading}
            onSave={handleBulkUpdate}
            onApprove={code ? approveAndKeep : approveAndRemove}
          />
        ) : (
          <PhotoReviewView
            items={items}
            canEdit={canEdit}
            loading={loading}
            onApprove={approveAndRemove}
            onSave={handleBulkUpdate}
            onSetFullScreenImage={onSetFullScreenImage}
            onJumpToList={() => setView('sheet')}
          />
        )}
      </div>
    </div>
  );
};

const SpreadsheetView: React.FC<{
  items: Equipment[];
  canEdit: boolean;
  loading: boolean;
  onSave: (
    updates: Array<
      Pick<Equipment, 'id'> &
        Partial<
          Pick<Equipment, 'accountingName' | 'scadaName' | 'description' | 'room' | 'notes' | 'manufacturer' | 'serialNum' | 'vendor' | 'status'>
        >
    >
  ) => Promise<Equipment[]>;
  onApprove: (id: string) => Promise<void> | void;
}> = ({ items, canEdit, loading, onSave, onApprove }) => {
  const { showToast } = useToast();
  const [draftById, setDraftById] = useState<Record<string, Partial<Equipment>>>({});
  const [saving, setSaving] = useState(false);

  const dirtyCount = useMemo(() => Object.keys(draftById).length, [draftById]);

  const getValue = <K extends keyof Equipment>(id: string, original: Equipment, key: K) => {
    const draft = draftById[id];
    if (draft && Object.prototype.hasOwnProperty.call(draft, key)) return (draft as any)[key];
    return original[key];
  };

  const setDraftValue = (id: string, key: keyof Equipment, value: any) => {
    setDraftById(prev => {
      const next = { ...(prev[id] || {}), [key]: value };
      return { ...prev, [id]: next };
    });
  };

  const revertRow = (id: string) => {
    setDraftById(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const saveAll = async () => {
    if (!canEdit) return;
    const updates = Object.entries(draftById).map(([id, patch]) => ({
      id,
      accountingName: patch.accountingName,
      scadaName: patch.scadaName,
      description: patch.description,
      room: patch.room,
      notes: patch.notes,
      manufacturer: patch.manufacturer,
      serialNum: patch.serialNum,
      vendor: patch.vendor,
      status: patch.status,
    }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const updated = await onSave(updates);
      const updatedIds = new Set(updated.map(u => u.id));
      setDraftById(prev => {
        const next: Record<string, Partial<Equipment>> = {};
        for (const [id, patch] of Object.entries(prev)) {
          if (!updatedIds.has(id)) next[id] = patch;
        }
        return next;
      });
      showToast('Saved', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{items.length}</span> needs review
          {dirtyCount > 0 && (
            <span className="ml-2 text-slate-500">
              (<span className="font-medium text-slate-900">{dirtyCount}</span> edited)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDraftById({})}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium"
            disabled={!canEdit || dirtyCount === 0 || saving}
          >
            Discard edits
          </button>
          <button
            onClick={saveAll}
            className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
            disabled={!canEdit || dirtyCount === 0 || saving}
          >
            Save all
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1700px] w-full table-fixed">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="p-3 w-56">Accounting name</th>
              <th className="p-3 w-44">SCADA name</th>
              <th className="p-3 w-64">Description</th>
              <th className="p-3 w-16">Bldg</th>
              <th className="p-3 w-24">Room</th>
              <th className="p-3 w-28">Status</th>
              <th className="p-3 w-44">Manufacturer</th>
              <th className="p-3 w-40">Serial</th>
              <th className="p-3 w-40">Vendor</th>
              <th className="p-3 w-64">Notes</th>
              <th className="p-3 w-40">Last update</th>
              <th className="p-3 w-44">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(eq => {
              const isDirty = !!draftById[eq.id];
              const reviewedAt = eq.reviewedAt || null;
              const updatedAt = eq.updatedAt || null;
              const needsApproval =
                !reviewedAt || (!!updatedAt && !!reviewedAt && updatedAt > reviewedAt);
              const approveLabel = !reviewedAt ? 'Approve' : 'Apr. Upd.';
              return (
                <tr key={eq.id} className={isDirty ? 'bg-brand-50/40' : ''}>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'accountingName') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'accountingName', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'scadaName') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'scadaName', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'description') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3 text-sm text-slate-700 truncate" title={eq.LocationDesc || eq.Location}>
                    {eq.Location}
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'room') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'room', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <select
                      value={(getValue(eq.id, eq, 'status') as any) || 'UNKNOWN'}
                      onChange={e => setDraftValue(eq.id, 'status', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'manufacturer') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'manufacturer', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'serialNum') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'serialNum', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'vendor') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'vendor', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      value={(getValue(eq.id, eq, 'notes') as any) || ''}
                      onChange={e => setDraftValue(eq.id, 'notes', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      disabled={!canEdit || loading}
                    />
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    <div className="truncate" title={eq.updatedAt || ''}>
                      {formatIsoShort(eq.updatedAt)}
                    </div>
                    <div className="truncate text-slate-400" title={eq.reviewedAt || ''}>
                      Reviewed: {formatIsoShort(eq.reviewedAt) || '—'}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {needsApproval ? (
                        <button
                          onClick={() => onApprove(eq.id)}
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2"
                          disabled={!canEdit || loading}
                        >
                          <Check size={16} />
                          {approveLabel}
                        </button>
                      ) : (
                        <button
                          className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium flex items-center gap-2 cursor-default"
                          disabled
                        >
                          <Check size={16} />
                          Reviewed
                        </button>
                      )}
                      <button
                        onClick={() => revertRow(eq.id)}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium"
                        disabled={!canEdit || !isDirty || loading}
                      >
                        Revert
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="p-10 text-center text-sm text-slate-500">
                  {loading ? 'Loading…' : 'Nothing needs review.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PhotoReviewView: React.FC<{
  items: Equipment[];
  canEdit: boolean;
  loading: boolean;
  onApprove: (id: string) => Promise<void> | void;
  onSave: (
    updates: Array<
      Pick<Equipment, 'id'> &
        Partial<
          Pick<Equipment, 'accountingName' | 'scadaName' | 'description' | 'room' | 'notes' | 'manufacturer' | 'serialNum' | 'vendor' | 'status'>
        >
    >
  ) => Promise<Equipment[]>;
  onSetFullScreenImage: (url: string) => void;
  onJumpToList: () => void;
}> = ({ items, canEdit, loading, onApprove, onSave, onSetFullScreenImage, onJumpToList }) => {
  const { showToast } = useToast();
  const [idx, setIdx] = useState(0);
  const current = items[idx] || null;
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setActiveImage(current.images?.[0] || null);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (idx >= items.length) setIdx(Math.max(0, items.length - 1));
  }, [idx, items.length]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState<Partial<Equipment>>({});
  const savingRef = useRef(false);

  const openEdit = () => {
    if (!current) return;
    setModalDraft({
      accountingName: current.accountingName,
      scadaName: current.scadaName,
      description: current.description,
      room: current.room,
      notes: current.notes,
      manufacturer: current.manufacturer,
      serialNum: current.serialNum,
      vendor: current.vendor,
      status: current.status,
    });
    setIsModalOpen(true);
  };

  const closeEdit = () => setIsModalOpen(false);
  const closeNotes = () => setIsNotesOpen(false);

  useEffect(() => {
    if (!isModalOpen && !isNotesOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isNotesOpen) closeNotes();
        else closeEdit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, isNotesOpen]);

  const saveModal = async () => {
    if (!current || !canEdit || savingRef.current) return;
    savingRef.current = true;
    try {
      await onSave([{ id: current.id, ...modalDraft }]);
      showToast('Saved', 'success');
      closeEdit();
    } catch (e: any) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      savingRef.current = false;
    }
  };

  if (!current) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        {loading ? 'Loading…' : 'Nothing needs review.'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 h-full min-h-0 overflow-hidden">
      <div className="md:col-span-4 lg:col-span-3 border-b md:border-b-0 md:border-r border-slate-200 min-h-0">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Queue: <span className="font-medium text-slate-900">{items.length}</span>
          </div>
          <button
            onClick={onJumpToList}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium"
          >
            Review list
          </button>
        </div>
        <div className="h-full overflow-y-auto divide-y divide-slate-100">
          {items.map((eq, i) => (
            <button
              key={eq.id}
              onClick={() => setIdx(i)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                i === idx ? 'bg-brand-50' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-900 truncate">{eq.accountingName}</div>
              {eq.description ? (
                <div className="text-xs text-slate-500 mt-0.5 truncate">{eq.description}</div>
              ) : null}
              <div className="text-xs text-slate-400 mt-0.5 truncate">
                {(eq.LocationDesc || eq.Location) || '—'} • Room {eq.room || '—'} • {statusLabel(eq.status)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="md:col-span-8 lg:col-span-9 p-3 lg:p-4 h-full min-h-0 flex flex-col gap-2 overflow-hidden">
        {/* Combined header: equipment + location */}
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900 truncate">
              {current.accountingName}
              {current.previousAccountingName &&
              current.previousAccountingName.trim() !== '' &&
              current.previousAccountingName !== current.accountingName ? (
                <span className="text-slate-500 font-medium">
                  {' '}
                  (prev: {current.previousAccountingName})
                </span>
              ) : null}
              {current.description ? (
                <span className="text-slate-500 font-medium"> — {current.description}</span>
              ) : null}
            </div>
            <div className="text-sm text-slate-500 truncate">
              {current.LocationDesc || current.Location || '—'}
              {current.scadaName ? (
                <>
                  <span className="mx-2">•</span>
                  SCADA: {current.scadaName}
                </>
              ) : null}
              <span className="mx-2">•</span>
              Room {current.room || '—'}
              <span className="mx-2">•</span>
              {statusLabel(current.status)}
              {(current.manufacturer || current.serialNum) ? <span className="mx-2">•</span> : null}
              {current.manufacturer ? <span> Mfr: {current.manufacturer}</span> : null}
              {current.serialNum ? <span> {current.manufacturer ? '•' : ''} S/N: {current.serialNum}</span> : null}
            </div>
          </div>
          {current.notes && current.notes.trim() !== '' ? (
            <button
              onClick={() => setIsNotesOpen(true)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium flex-shrink-0"
            >
              View notes
            </button>
          ) : null}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative flex-1 min-h-0 flex flex-col">
          {/* Floating actions */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <button
              onClick={() => onApprove(current.id)}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2 shadow-sm"
              disabled={!canEdit || loading}
            >
              <Check size={16} />
              Approve
            </button>
            <button
              onClick={openEdit}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium flex items-center gap-2 shadow-sm"
              disabled={!canEdit || loading}
            >
              <Pencil size={16} />
              Edit
            </button>
          </div>

          <button
            onClick={() => {
              if (activeImage) onSetFullScreenImage(activeImage);
            }}
            className="w-full flex-1 min-h-0 flex items-center justify-center"
          >
            {activeImage ? (
              <img src={activeImage} alt="Equipment" className="w-full h-full object-contain" />
            ) : (
              <div className="text-slate-400 text-sm flex items-center gap-2">
                <ImageIcon size={16} />
                No photo
              </div>
            )}
          </button>
          {current.images?.length > 1 && (
            <div className="p-2 flex gap-2 overflow-x-auto bg-white border-t border-slate-200">
              {current.images.map((url, i) => (
                <button
                  key={`${current.id}-img-${i}`}
                  onClick={() => {
                    setActiveImage(url);
                  }}
                  className={`h-12 w-20 rounded-md overflow-hidden border ${
                    url === activeImage ? 'border-brand-500' : 'border-slate-200'
                  }`}
                >
                  <img src={url} alt={`thumb ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isNotesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900 truncate">Notes</div>
              <button onClick={closeNotes} className="px-3 py-2 rounded-lg hover:bg-slate-100 text-sm font-medium">
                Close
              </button>
            </div>
            <div className="p-4">
              <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                {current.notes}
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900 truncate">Edit equipment</div>
              <button onClick={closeEdit} className="px-3 py-2 rounded-lg hover:bg-slate-100 text-sm font-medium">
                Close
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Accounting name">
                <input
                  value={(modalDraft.accountingName as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, accountingName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="SCADA name">
                <input
                  value={(modalDraft.scadaName as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, scadaName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Description">
                <input
                  value={(modalDraft.description as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Room">
                <input
                  value={(modalDraft.room as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, room: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Status">
                <select
                  value={(modalDraft.status as any) || 'UNKNOWN'}
                  onChange={e => setModalDraft(d => ({ ...d, status: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>
                      {s === 'REMOVED' ? 'DELETED' : s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Manufacturer">
                <input
                  value={(modalDraft.manufacturer as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, manufacturer: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Serial">
                <input
                  value={(modalDraft.serialNum as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, serialNum: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Vendor">
                <input
                  value={(modalDraft.vendor as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, vendor: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Notes">
                <input
                  value={(modalDraft.notes as any) || ''}
                  onChange={e => setModalDraft(d => ({ ...d, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={closeEdit}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveModal}
                className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
                disabled={!canEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3">
    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
    <div className="text-sm text-slate-900 mt-1 break-words">{value || '—'}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
    {children}
  </div>
);

