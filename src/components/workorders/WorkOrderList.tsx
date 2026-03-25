import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ClipboardList, Users, ChevronLeft, ChevronRight, Filter, SlidersHorizontal, X, CheckCircle2, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, Mic, ScanLine, ArrowRight } from 'lucide-react';
import Fuse from 'fuse.js';
import { api } from '../../../api';
import type { WorkOrder, Staff, WorkOrderHandoff } from '../../../types';
import { EndOfDay } from './EndOfDay';

type Tab = 'all' | 'pending' | 'handoffs';
type SortDir = 'asc' | 'desc';

interface Props {
  canEdit: boolean;
}

const PAGE_SIZE = 50;
const WO_STATE_KEY = 'wo_list_state';

function readSavedState(): Record<string, string | number> {
  try { return JSON.parse(sessionStorage.getItem(WO_STATE_KEY) || '{}'); } catch { return {}; }
}

// ─── AutocompleteInput ────────────────────────────────────────────────────────

interface AutocompleteInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions: string[];
  className?: string;
  type?: string;
}

function AutocompleteInput({ value, onChange, placeholder, suggestions, className, type = 'text' }: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fuse instance — only rebuilt when the suggestion list changes
  const fuse = useMemo(
    () => new Fuse(suggestions, { threshold: 0.45, distance: 120, minMatchCharLength: 1 }),
    [suggestions],
  );

  // Exact substring matches come first; fuzzy matches fill "did you mean"
  const exactMatches = useMemo(() => {
    if (!value.trim()) return [];
    const lower = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(lower)).slice(0, 7);
  }, [value, suggestions]);

  const didYouMean = useMemo(() => {
    if (!value.trim() || exactMatches.length > 0) return [];
    return fuse.search(value).map(r => r.item).slice(0, 4);
  }, [value, exactMatches, fuse]);

  const showDropdown = open && value.trim().length > 0 && (exactMatches.length > 0 || didYouMean.length > 0);

  // Close when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function pick(s: string) {
    onChange(s);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && (
        <div className="absolute left-0 top-full mt-0.5 z-50 w-full min-w-[180px] bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
          {exactMatches.length > 0 && (
            <ul className="max-h-44 overflow-y-auto">
              {exactMatches.map(s => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={() => pick(s)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 truncate"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {didYouMean.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-medium text-slate-400 uppercase tracking-wide border-t border-slate-100 bg-slate-50">
                Did you mean?
              </div>
              <ul>
                {didYouMean.map(s => (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={() => pick(s)}
                      className="block w-full text-left px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 truncate"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const isClose = status.toUpperCase() === 'CLOSE';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isClose ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

// ─── WorkOrderList ────────────────────────────────────────────────────────────

export const WorkOrderList: React.FC<Props> = ({ canEdit }) => {
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>(() => (readSavedState().tab as Tab) ?? 'all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [handoffs, setHandoffs] = useState<WorkOrderHandoff[]>([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [resolvingHandoff, setResolvingHandoff] = useState<string | null>(null);
  const [handoffAssignee, setHandoffAssignee] = useState<Record<string, string>>({}); // handoffId → staffId

  // Sorting
  const [sortBy, setSortBy] = useState<string>(() => (readSavedState().sortBy as string) ?? 'openDate');
  const [sortDir, setSortDir] = useState<SortDir>(() => (readSavedState().sortDir as SortDir) ?? 'desc');

  // Table data
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(() => (readSavedState().page as number) ?? 0);

  // Autocomplete suggestion pools (loaded once)
  const [suggestions, setSuggestions] = useState<{
    woNumbers: string[]; descriptions: string[]; equipment: string[]; buildings: string[];
  }>({ woNumbers: [], descriptions: [], equipment: [], buildings: [] });

  // Per-column filter states (each maps to its own backend param)
  const [filterWO, setFilterWO]          = useState<string>(() => (readSavedState().filterWO as string) ?? '');
  const [filterDesc, setFilterDesc]      = useState<string>(() => (readSavedState().filterDesc as string) ?? '');
  const [filterEquip, setFilterEquip]    = useState<string>(() => (readSavedState().filterEquip as string) ?? '');
  const [filterBuilding, setFilterBuilding] = useState<string>(() => (readSavedState().filterBuilding as string) ?? '');
  const [filterStatus, setFilterStatus]  = useState<string>(() => (readSavedState().filterStatus as string) ?? '');
  const [filterFrom, setFilterFrom]      = useState<string>(() => (readSavedState().filterFrom as string) ?? '');
  const [filterTo, setFilterTo]          = useState<string>(() => (readSavedState().filterTo as string) ?? '');

  // Debounce the text filters
  const [debounced, setDebounced] = useState({
    filterWO: '', filterDesc: '', filterEquip: '', filterBuilding: '',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced({ filterWO, filterDesc, filterEquip, filterBuilding });
      setPage(0);
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterWO, filterDesc, filterEquip, filterBuilding]);

  useEffect(() => { setPage(0); }, [filterStatus, filterFrom, filterTo]);

  // Persist state to sessionStorage so back-navigation restores position
  useEffect(() => {
    sessionStorage.setItem(WO_STATE_KEY, JSON.stringify({
      tab, page, sortBy, sortDir,
      filterWO, filterDesc, filterEquip, filterBuilding, filterStatus, filterFrom, filterTo,
    }));
  }, [tab, page, sortBy, sortDir, filterWO, filterDesc, filterEquip, filterBuilding, filterStatus, filterFrom, filterTo]);

  // Sort toggle
  const handleSort = useCallback((col: string) => {
    setSortBy(prev => {
      if (prev === col) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        return col;
      }
      setSortDir('desc');
      return col;
    });
    setPage(0);
  }, []);

  // Load suggestion data + staff once on mount
  useEffect(() => {
    api.getWorkOrderSuggestions().then(setSuggestions).catch(() => {});
    api.getStaff().then(setStaffList).catch(() => {});
  }, []);

  // Fetch handoffs whenever that tab is active
  useEffect(() => {
    if (tab !== 'handoffs') return;
    setHandoffsLoading(true);
    api.getHandoffs().then(setHandoffs).catch(() => setHandoffs([])).finally(() => setHandoffsLoading(false));
  }, [tab]);

  const handleResolveHandoff = async (handoff: WorkOrderHandoff) => {
    const staffId = handoffAssignee[handoff.id];
    if (!staffId) return;
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return;
    setResolvingHandoff(handoff.id);
    try {
      await api.resolveHandoff(handoff.id, { toStaffId: staffId, toStaffName: staff.name });
      setHandoffs(prev => prev.filter(h => h.id !== handoff.id));
    } catch (err) { console.error(err); }
    finally { setResolvingHandoff(null); }
  };

  const handleApprove = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setApprovingId(id);
    try {
      await api.approveWorkOrder(id);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      console.error(err);
    } finally {
      setApprovingId(null);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWorkOrders({
        woNumber:    debounced.filterWO       || undefined,
        description: debounced.filterDesc     || undefined,
        equipment:   debounced.filterEquip    || undefined,
        building:    debounced.filterBuilding || undefined,
        // pending tab forces status filter; column filter used in 'all' tab
        status:      tab === 'pending' ? 'PENDING_REVIEW' : (filterStatus || undefined),
        from:        filterFrom               || undefined,
        to:          filterTo                 || undefined,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sortBy,
        sortDir,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, [debounced, filterStatus, filterFrom, filterTo, page, tab, sortBy, sortDir]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const from = page * PAGE_SIZE + 1;
  const to   = Math.min(page * PAGE_SIZE + items.length, total);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const hasActiveFilters = !!(filterWO || filterDesc || filterEquip || filterBuilding || filterStatus || filterFrom || filterTo);

  const clearFilters = () => {
    setFilterWO(''); setFilterDesc(''); setFilterEquip('');
    setFilterBuilding(''); setFilterStatus(''); setFilterFrom(''); setFilterTo('');
  };

  const activeCount = [filterWO, filterDesc, filterEquip, filterBuilding, filterStatus, filterFrom, filterTo].filter(Boolean).length;

  // Shared class for inline filter inputs
  const filterInput = 'w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Work Orders</h1>
          {/* Tabs */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 text-sm">
            {(['all', 'pending', 'handoffs'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setPage(0); }}
                className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  tab === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'all' ? 'All' : t === 'pending' ? 'Pending Review' : (
                  <span className="flex items-center gap-1">
                    <ArrowRight size={12} />
                    Handoffs
                    {handoffs.length > 0 && (
                      <span className="ml-0.5 bg-amber-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                        {handoffs.length}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowMobileFilters(v => !v)}
            className={`md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
              hasActiveFilters
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowEndOfDay(true)}
            className="inline-flex items-center gap-2 px-3 py-2 min-h-11 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Mic size={15} />
            <span className="hidden sm:inline">End of Day</span>
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => navigate('/settings/staff')}
                className="inline-flex items-center gap-2 px-3 py-2 min-h-11 rounded-md border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <Users size={15} />
                <span className="hidden sm:inline">Manage Staff</span>
              </button>
              <button
                onClick={() => navigate('/work-orders/photo-complete')}
                className="inline-flex items-center gap-2 px-3 py-2 min-h-11 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                title="Complete work orders from paper forms"
              >
                <ScanLine size={15} />
                <span className="hidden sm:inline">Photo Complete</span>
              </button>
              <button
                onClick={() => navigate('/work-orders/upload')}
                className="inline-flex items-center gap-2 px-3 py-2 min-h-11 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Upload size={15} />
                Upload
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile filter panel */}
      {showMobileFilters && (
        <div className="md:hidden bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">Filters</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">WO #</label>
              <AutocompleteInput type="text" value={filterWO} onChange={setFilterWO} placeholder="e.g. 12345" suggestions={suggestions.woNumbers} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <AutocompleteInput type="text" value={filterDesc} onChange={setFilterDesc} placeholder="keyword…" suggestions={suggestions.descriptions} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Equipment</label>
              <AutocompleteInput type="text" value={filterEquip} onChange={setFilterEquip} placeholder="e.g. AHU01" suggestions={suggestions.equipment} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Building</label>
              <AutocompleteInput type="text" value={filterBuilding} onChange={setFilterBuilding} placeholder="e.g. CART" suggestions={suggestions.buildings} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSE">CLOSE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Open Date from</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Open Date to</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Handoffs tab ── */}
      {tab === 'handoffs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex items-center gap-2">
            <ArrowRight size={14} className="text-amber-500" />
            <span className="text-sm font-medium text-amber-800">Pending Handoffs — assign to next person</span>
          </div>
          {handoffsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-slate-300" />
            </div>
          ) : handoffs.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-14">No pending handoffs</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {handoffs.map(h => (
                <div key={h.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        WO #{h.workOrderNumber}
                      </span>
                      {h.buildingCode && (
                        <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">{h.buildingCode}{h.roomNumber ? ` · ${h.roomNumber}` : ''}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mt-1 truncate">{h.requestDescription || '—'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Passed on by <strong>{h.fromStaffName || 'Unknown'}</strong>
                      {h.reason === 'urgent_incomplete' && <span className="ml-2 text-amber-600 font-medium">· Urgent, couldn't complete</span>}
                    </p>
                    {h.handoffNote && (
                      <p className="text-xs text-slate-500 mt-1 italic bg-slate-50 rounded px-2 py-1">"{h.handoffNote}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={handoffAssignee[h.id] || ''}
                      onChange={e => setHandoffAssignee(prev => ({ ...prev, [h.id]: e.target.value }))}
                      className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="">Assign to…</option>
                      {staffList.filter(s => s.active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.category ? ` (${s.category})` : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleResolveHandoff(h)}
                      disabled={!handoffAssignee[h.id] || resolvingHandoff === h.id}
                      className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                    >
                      {resolvingHandoff === h.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      Assign
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile cards */}
      {tab !== 'handoffs' && (
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/2 mb-3" />
                <div className="h-3 bg-slate-100 rounded w-full mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg py-14 text-center">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <ClipboardList size={36} strokeWidth={1.2} />
                <p className="font-medium text-slate-500">No work orders found</p>
              </div>
            </div>
          ) : (
            items.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(`/work-orders/${item.id}`)}
                className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-800">#{item.workOrderNumber}</p>
                    <p className="text-sm text-slate-700 mt-1 line-clamp-2">
                      {item.requestDescription || item.equipmentRaw || '—'}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>
                    <span className="text-slate-400">Equipment: </span>
                    <span className="text-slate-700">{item.equipmentRaw || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Building: </span>
                    <span className="text-slate-700">{item.buildingCode || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Open Date: </span>
                    <span className="text-slate-700">{item.openDate || '—'}</span>
                  </div>
                  {tab === 'pending' && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Completed by: </span>
                      <span className="text-slate-700">{item.completedByNames || '—'}</span>
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Table */}
      {tab !== 'handoffs' && <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden">
        {hasActiveFilters && (
          <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <span className="text-xs text-indigo-700 font-medium">
              {activeCount} filter{activeCount !== 1 ? 's' : ''} active
            </span>
            <button onClick={clearFilters} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              <X size={11} /> Clear all
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Column labels */}
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {([ ['workOrderNumber','WO #'], ['requestDescription','Description'], ['equipmentRaw','Equipment'], ['buildingCode','Building'], ['openDate','Open Date'], ['status','Status'] ] as [string,string][]).map(([col, label]) => {
                  const active = sortBy === col;
                  return (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-4 pt-3 pb-1 font-medium text-slate-600 whitespace-nowrap cursor-pointer select-none group"
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <span className={`transition-colors ${active ? 'text-indigo-500' : 'text-slate-300 group-hover:text-slate-400'}`}>
                          {active
                            ? sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />
                            : <ChevronsUpDown size={13} />}
                        </span>
                      </span>
                    </th>
                  );
                })}
                {tab === 'pending' && <th className="px-4 pt-3 pb-1 font-medium text-slate-600 whitespace-nowrap">Completed by</th>}
                {tab === 'pending' && <th className="px-4 pt-3 pb-1" />}
              </tr>
              {/* Inline filter row — desktop only, hidden on pending tab */}
              <tr className={`border-b border-slate-200 bg-slate-50 ${tab === 'pending' ? 'hidden' : 'hidden md:table-row'}`}>
                {/* WO # */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <AutocompleteInput
                      value={filterWO}
                      onChange={setFilterWO}
                      placeholder="Search…"
                      suggestions={suggestions.woNumbers}
                      className={filterInput}
                    />
                    <Filter size={11} className={filterWO ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
                {/* Description */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <AutocompleteInput
                      value={filterDesc}
                      onChange={setFilterDesc}
                      placeholder="Search…"
                      suggestions={suggestions.descriptions}
                      className={filterInput}
                    />
                    <Filter size={11} className={filterDesc ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
                {/* Equipment */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <AutocompleteInput
                      value={filterEquip}
                      onChange={setFilterEquip}
                      placeholder="Search…"
                      suggestions={suggestions.equipment}
                      className={filterInput}
                    />
                    <Filter size={11} className={filterEquip ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
                {/* Building */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <AutocompleteInput
                      value={filterBuilding}
                      onChange={setFilterBuilding}
                      placeholder="e.g. CART"
                      suggestions={suggestions.buildings}
                      className={filterInput}
                    />
                    <Filter size={11} className={filterBuilding ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
                {/* Open Date */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={filterInput} />
                    <Filter size={11} className={filterFrom ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
                {/* Status */}
                <td className="px-2 pb-2 pt-0">
                  <div className="flex items-center gap-1">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      <option value="OPEN">OPEN</option>
                      <option value="CLOSE">CLOSE</option>
                    </select>
                    <Filter size={11} className={filterStatus ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />
                  </div>
                </td>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <ClipboardList size={40} strokeWidth={1.2} />
                      <p className="font-medium text-slate-500">No work orders found</p>
                      <p className="text-sm">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/work-orders/${item.id}`)}
                    className={`cursor-pointer transition-colors hover:bg-indigo-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                  >
                    <td className="px-4 py-3 font-mono text-slate-800 font-medium whitespace-nowrap">
                      {item.workOrderNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                      {item.requestDescription
                        ? <span title={item.requestDescription}>{item.requestDescription}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">
                      {item.equipmentRaw ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {item.buildingCode ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {item.openDate ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    {tab === 'pending' && (
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-sm">
                        {item.completedByNames ?? '—'}
                      </td>
                    )}
                    {tab === 'pending' && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleApprove(e, item.id)}
                          disabled={approvingId === item.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {approvingId === item.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <CheckCircle2 size={12} />}
                          Approve
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-600">
          <span>Showing {from}–{to} of {total}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={!hasPrev || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
              Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasNext || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* End of Day modal */}
      {showEndOfDay && (
        <EndOfDay
          staffList={staffList}
          onClose={() => setShowEndOfDay(false)}
          onWorkOrderCompleted={() => {
            // Refresh the list after a WO is completed
            setItems(prev => prev.map(wo => wo.id === wo.id ? wo : wo));
          }}
        />
      )}
    </div>
  );
};
