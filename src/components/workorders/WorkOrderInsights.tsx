import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
  PieChart, Pie,
} from 'recharts';
import {
  DollarSign, TrendingUp, ClipboardList, Wrench,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2, AlertCircle, X, ExternalLink,
} from 'lucide-react';
import { api } from '../../../api';
import type { WorkOrder } from '../../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InsightsData {
  kpis: {
    totalAllTime: number;
    totalThisYear: number;
    totalWOs: number;
    openWOCount: number;
    avgCostPerWO: number;
  };
  monthly: { month: string; totalCost: number; labourCost: number; otherCost: number; woCount: number }[];
  buildings: { buildingCode: string; buildingName: string; totalCost: number; labourCost: number; woCount: number; avgCost: number }[];
  equipment: { equipmentRaw: string; buildingCode: string; totalCost: number; labourCost: number; woCount: number; avgCost: number }[];
  crafts: { craft: string; totalCost: number; woCount: number }[];
}

type Tab = 'overview' | 'buildings' | 'equipment' | 'trades';
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCAD(n: number): string {
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });
}

function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i);

const INDIGO = '#6366f1';
const INDIGO_LIGHT = '#c7d2fe';
const SLATE = '#94a3b8';

const PIE_PALETTE = [
  '#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#f97316','#84cc16','#ec4899','#14b8a6',
];

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon, title, value, subtitle, colour = 'indigo',
}: {
  icon: React.ElementType; title: string; value: string; subtitle: string; colour?: 'indigo' | 'emerald' | 'amber' | 'slate';
}) {
  const colours = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg shrink-0 ${colours[colour]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function SortBtn({ col, active, dir, onSort }: { col: string; active: boolean; dir: SortDir; onSort: (c: string) => void }) {
  return (
    <button onClick={() => onSort(col)} className="inline-flex items-center gap-0.5 group">
      {active
        ? dir === 'desc' ? <ChevronDown size={12} className="text-indigo-500" /> : <ChevronUp size={12} className="text-indigo-500" />
        : <ChevronsUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />}
    </button>
  );
}

function useSort<T>(data: T[], defaultCol: keyof T, defaultDir: SortDir = 'desc') {
  const [sortCol, setSortCol] = useState<keyof T>(defaultCol);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortCol] as number | string;
      const bv = b[sortCol] as number | string;
      const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data, sortCol, sortDir]);

  function toggle(col: keyof T) {
    if (col === sortCol) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  return { sorted, sortCol, sortDir, toggle };
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function MonthlyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const labour = payload.find((p: any) => p.dataKey === 'labourCost')?.value ?? 0;
  const other = payload.find((p: any) => p.dataKey === 'otherCost')?.value ?? 0;
  const total = labour + other;
  const wos = payload[0]?.payload?.woCount ?? 0;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-slate-800">{label}</p>
      <p className="text-indigo-600">Labour: {fmtFull(labour)}</p>
      <p className="text-slate-500">Other: {fmtFull(other)}</p>
      <p className="font-medium text-slate-800 border-t border-slate-100 pt-1">Total: {fmtFull(total)}</p>
      <p className="text-slate-400">{wos} work order{wos !== 1 ? 's' : ''}</p>
    </div>
  );
}

function HBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.find((p: any) => p.dataKey === 'totalCost')?.value ?? 0;
  const wos = payload[0]?.payload?.woCount ?? 0;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-slate-800 max-w-[200px] break-words">{label}</p>
      <p className="font-medium text-indigo-600">{fmtFull(total)}</p>
      <p className="text-slate-400">{wos} WO{wos !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-indigo-500 text-indigo-600'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Month range helper ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthRange(year: number, monthName: string): { from: string; to: string } {
  const m = MONTH_NAMES.indexOf(monthName) + 1;
  const lastDay = new Date(year, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

// ─── Drill-down panel ─────────────────────────────────────────────────────────

function DrillDownPanel({
  month, year, onClose, navigate,
}: {
  month: string; year: number; onClose: () => void; navigate: ReturnType<typeof useNavigate>;
}) {
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { from, to } = monthRange(year, month);
    api.getWorkOrders({ from, to, limit: 200, sortBy: 'actualTotalCost', sortDir: 'desc' })
      .then(r => setWos(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [month, year]);

  // Scroll panel into view when it opens
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const total = wos.reduce((s, w) => s + (w.actualTotalCost ?? 0), 0);
  const labour = wos.reduce((s, w) => s + (w.actualLabourCost ?? 0), 0);

  return (
    <div ref={panelRef} className="bg-white border border-indigo-200 rounded-xl shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 bg-indigo-50 border-b border-indigo-100">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-indigo-900">{month} {year} — Work Orders</span>
          {!loading && (
            <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full font-medium">
              {wos.length} WO{wos.length !== 1 ? 's' : ''} · {fmtFull(total)} total
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-indigo-100 text-indigo-400 hover:text-indigo-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Summary strip */}
      {!loading && !error && wos.length > 0 && (
        <div className="flex gap-6 px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <span>Labour: <strong className="text-slate-700">{fmtFull(labour)}</strong></span>
          <span>Other: <strong className="text-slate-700">{fmtFull(Math.max(0, total - labour))}</strong></span>
          <span>Avg/WO: <strong className="text-slate-700">{fmtFull(wos.length ? total / wos.length : 0)}</strong></span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 m-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={15} /> {error}
        </div>
      ) : wos.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-12">No work orders with cost data for {month} {year}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2">WO #</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 whitespace-nowrap">Trade</th>
                <th className="px-4 py-2 whitespace-nowrap">Date</th>
                <th className="px-4 py-2 whitespace-nowrap">Building</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Labour</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Total Cost</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wos.map((wo, idx) => (
                <tr
                  key={wo.id}
                  className={`transition-colors hover:bg-indigo-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  <td className="px-4 py-2.5 font-mono text-slate-700 font-medium whitespace-nowrap">{wo.workOrderNumber}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[220px] truncate" title={wo.requestDescription ?? ''}>
                    {wo.requestDescription || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{wo.craft || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap tabular-nums">{wo.openDate || '—'}</td>
                  <td className="px-4 py-2.5">
                    {wo.buildingCode ? (
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{wo.buildingCode}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums whitespace-nowrap">
                    {wo.actualLabourCost > 0 ? fmtCAD(wo.actualLabourCost) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                    {wo.actualTotalCost > 0
                      ? <span className="text-indigo-700">{fmtCAD(wo.actualTotalCost)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => navigate(`/work-orders/${wo.id}`)}
                      className="p-1 rounded hover:bg-indigo-100 text-slate-300 hover:text-indigo-500 transition-colors"
                      title="Open work order"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={5} className="px-4 py-2.5 text-xs font-medium text-slate-500">
                  {wos.length} work order{wos.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                  {fmtFull(labour)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                  {fmtFull(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const WorkOrderInsights: React.FC = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // ── Per-year buildings filter ──
  const [buildingYearFilter, setBuildingYearFilter] = useState<'all' | number>('all');
  const [bldFiltered, setBldFiltered] = useState<InsightsData['buildings'] | null>(null);
  const [bldFilterLoading, setBldFilterLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getWorkOrderInsights(year)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  // Fetch year-filtered buildings when toggle changes
  useEffect(() => {
    if (buildingYearFilter === 'all') { setBldFiltered(null); return; }
    setBldFilterLoading(true);
    api.getWorkOrderInsights(undefined, buildingYearFilter)
      .then(d => setBldFiltered(d.buildings))
      .catch(() => setBldFiltered([]))
      .finally(() => setBldFilterLoading(false));
  }, [buildingYearFilter]);

  const activeBuildings = bldFiltered ?? data?.buildings ?? [];

  // ── Building sort ──
  const bSort = useSort(activeBuildings, 'totalCost');
  // ── Equipment sort ──
  const eSort = useSort(data?.equipment ?? [], 'woCount');

  // Reset selected month when year changes
  useEffect(() => { setSelectedMonth(null); }, [year]);

  const overviewTotal = data?.monthly.reduce((s, m) => s + m.totalCost, 0) ?? 0;
  const overviewWOs   = data?.monthly.reduce((s, m) => s + m.woCount, 0) ?? 0;

  // Top 10 buildings for horizontal bar
  const topBuildings = useMemo(() =>
    [...activeBuildings].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10),
    [activeBuildings],
  );

  // Pie chart data — top 9 named, rest as "Other"
  const pieData = useMemo(() => {
    const sorted = [...activeBuildings].sort((a, b) => b.totalCost - a.totalCost);
    const total = sorted.reduce((s, b) => s + b.totalCost, 0);
    if (!total) return [];
    const TOP_N = 9;
    const top = sorted.slice(0, TOP_N);
    const otherCost = sorted.slice(TOP_N).reduce((s, b) => s + b.totalCost, 0);
    const result = top.map(b => ({ name: b.buildingCode || b.buildingName, fullName: b.buildingName, value: b.totalCost }));
    if (otherCost > 0) result.push({ name: 'Other', fullName: 'All other buildings', value: otherCost });
    return result;
  }, [activeBuildings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Cost Insights</h1>
          <p className="text-sm text-slate-500 mt-0.5">Work order spending across buildings, equipment and trades</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 h-24 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-1/2 mb-3" />
              <div className="h-7 bg-slate-100 rounded w-3/4" />
            </div>
          ))
        ) : data ? (
          <>
            <KPICard icon={DollarSign}    title="Total Spent (All Time)" value={fmtCAD(data.kpis.totalAllTime)}  subtitle="across all work orders"    colour="indigo" />
            <KPICard icon={TrendingUp}    title={`Spent in ${year}`}      value={fmtCAD(data.kpis.totalThisYear)} subtitle={`open date in ${year}`}    colour="emerald" />
            <KPICard icon={ClipboardList} title="Open Work Orders"         value={String(data.kpis.openWOCount)}   subtitle={`of ${data.kpis.totalWOs.toLocaleString()} total`} colour="amber" />
            <KPICard icon={Wrench}        title="Avg Cost / WO"            value={fmtCAD(data.kpis.avgCostPerWO)}  subtitle="where cost > 0"             colour="slate" />
          </>
        ) : null}
      </div>

      {/* Tab bar */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 px-2 overflow-x-auto">
          <TabBtn active={tab === 'overview'}  onClick={() => setTab('overview')}>Monthly Spend</TabBtn>
          <TabBtn active={tab === 'buildings'} onClick={() => setTab('buildings')}>Buildings</TabBtn>
          <TabBtn active={tab === 'equipment'} onClick={() => setTab('equipment')}>Equipment</TabBtn>
          <TabBtn active={tab === 'trades'}    onClick={() => setTab('trades')}>Trades</TabBtn>
        </div>

        <div className="p-5">
          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm text-slate-500">
                    {loading ? '…' : `${overviewWOs.toLocaleString()} work orders · ${fmtFull(overviewTotal)} total`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 font-medium">Year</label>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="h-72 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-slate-300" />
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data?.monthly} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => fmtCAD(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                      <Tooltip content={<MonthlyTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Legend
                        formatter={(value) => value === 'labourCost' ? 'Labour' : 'Other'}
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      <Bar dataKey="labourCost" stackId="a" fill={INDIGO}       name="labourCost" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="otherCost"  stackId="a" fill={INDIGO_LIGHT} name="otherCost"  radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Months that had WOs — clickable */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                    {data?.monthly.filter(m => m.totalCost > 0).map(m => {
                      const isSelected = selectedMonth === m.month;
                      return (
                        <button
                          key={m.month}
                          onClick={() => setSelectedMonth(isSelected ? null : m.month)}
                          className={`text-left rounded-lg px-3 py-2 border transition-all ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-100'
                              : 'bg-slate-50 border-transparent hover:border-indigo-200 hover:bg-indigo-50'
                          }`}
                        >
                          <p className={`text-xs font-semibold ${isSelected ? 'text-indigo-100' : 'text-slate-700'}`}>{m.month}</p>
                          <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-indigo-600'}`}>{fmtCAD(m.totalCost)}</p>
                          <p className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {m.woCount} WO{m.woCount !== 1 ? 's' : ''} · click to view
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Drill-down panel */}
                  {selectedMonth && (
                    <DrillDownPanel
                      month={selectedMonth}
                      year={year}
                      onClose={() => setSelectedMonth(null)}
                      navigate={navigate}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Buildings ── */}
          {tab === 'buildings' && (
            <div className="space-y-6">
              {/* Year dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">View:</label>
                <div className="relative">
                  <select
                    value={buildingYearFilter}
                    onChange={e => setBuildingYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="appearance-none pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 cursor-pointer transition-colors"
                  >
                    <option value="all">All Time</option>
                    {YEAR_OPTIONS.slice(0, 8).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                {bldFilterLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
              </div>

              {loading ? (
                <div className="h-80 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-slate-300" />
                </div>
              ) : (
                <>
                  {/* Horizontal bar — top 10 */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                      Top {topBuildings.length} by Total Cost
                      {buildingYearFilter !== 'all' && <span className="text-indigo-500 ml-1">· {buildingYearFilter}</span>}
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(240, topBuildings.length * 36)}>
                      <BarChart
                        data={topBuildings}
                        layout="vertical"
                        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                        barSize={18}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" tickFormatter={v => fmtCAD(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="buildingCode" width={60} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<HBarTooltip />} cursor={{ fill: '#f8fafc' }} />
                        <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                          {topBuildings.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? INDIGO : i < 3 ? '#818cf8' : INDIGO_LIGHT} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Full table */}
                  <div className="overflow-x-auto rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-left">
                          {([
                            ['buildingCode', 'Code'],
                            ['buildingName', 'Building'],
                            ['woCount', 'WOs'],
                            ['labourCost', 'Labour'],
                            ['totalCost', 'Total Cost'],
                            ['avgCost', 'Avg / WO'],
                          ] as [keyof typeof bSort.sorted[0], string][]).map(([col, label]) => (
                            <th key={col} className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                {label}
                                <SortBtn
                                  col={col}
                                  active={bSort.sortCol === col}
                                  dir={bSort.sortDir}
                                  onSort={() => bSort.toggle(col as any)}
                                />
                              </span>
                            </th>
                          ))}
                          <th className="px-3 py-2 font-medium text-slate-600">Labour %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bSort.sorted.map((b, idx) => (
                          <tr
                            key={b.buildingCode}
                            onClick={() => navigate(`/building/${b.buildingCode}`)}
                            className={`cursor-pointer transition-colors hover:bg-indigo-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                          >
                            <td className="px-3 py-2 font-mono text-slate-700 font-medium whitespace-nowrap">{b.buildingCode}</td>
                            <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate">{b.buildingName}</td>
                            <td className="px-3 py-2 text-slate-500 tabular-nums">{b.woCount.toLocaleString()}</td>
                            <td className="px-3 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmtCAD(b.labourCost)}</td>
                            <td className="px-3 py-2 font-medium text-indigo-700 tabular-nums whitespace-nowrap">{fmtCAD(b.totalCost)}</td>
                            <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmtCAD(b.avgCost)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full"
                                    style={{ width: `${Math.min(100, b.totalCost ? (b.labourCost / b.totalCost) * 100 : 0)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-400 tabular-nums">{pct(b.labourCost, b.totalCost)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cost share pie chart */}
                  {pieData.length > 0 && (
                    <div className="bg-white border border-slate-100 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-4">
                        Cost Share by Building
                        {buildingYearFilter !== 'all' && <span className="text-indigo-500 ml-1">· {buildingYearFilter}</span>}
                      </p>
                      <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="shrink-0">
                          <PieChart width={220} height={220}>
                            <Pie
                              data={pieData}
                              cx={105}
                              cy={105}
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {pieData.map((_, i) => (
                                <Cell
                                  key={i}
                                  fill={i === pieData.length - 1 && pieData[i].name === 'Other' ? '#cbd5e1' : PIE_PALETTE[i % PIE_PALETTE.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number, _: string, entry: any) => [
                                `${fmtFull(value)} (${pct(value, pieData.reduce((s, d) => s + d.value, 0))})`,
                                entry.payload.fullName,
                              ]}
                            />
                          </PieChart>
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                          {pieData.map((d, i) => {
                            const total = pieData.reduce((s, x) => s + x.value, 0);
                            const isOther = d.name === 'Other';
                            return (
                              <div key={d.name} className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: isOther ? '#cbd5e1' : PIE_PALETTE[i % PIE_PALETTE.length] }}
                                />
                                <span className="text-xs text-slate-600 truncate font-medium">{d.name}</span>
                                <span className="text-xs text-slate-400 ml-auto tabular-nums whitespace-nowrap">
                                  {pct(d.value, total)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Equipment ── */}
          {tab === 'equipment' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">All equipment ordered by work order count (descending)</p>
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-slate-300" />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left">
                        <th className="px-3 py-2 font-medium text-slate-600 w-8 text-center">#</th>
                        {([
                          ['equipmentRaw', 'Equipment'],
                          ['buildingCode', 'Building'],
                          ['woCount', 'WOs'],
                          ['labourCost', 'Labour'],
                          ['totalCost', 'Total Cost'],
                          ['avgCost', 'Avg / WO'],
                        ] as [keyof typeof eSort.sorted[0], string][]).map(([col, label]) => (
                          <th key={col} className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {label}
                              <SortBtn
                                col={col}
                                active={eSort.sortCol === col}
                                dir={eSort.sortDir}
                                onSort={() => eSort.toggle(col as any)}
                              />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eSort.sorted.map((eq, idx) => (
                        <tr
                          key={eq.equipmentRaw}
                          className={`transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                        >
                          <td className="px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate font-medium" title={eq.equipmentRaw}>{eq.equipmentRaw}</td>
                          <td className="px-3 py-2 font-mono text-slate-500 text-xs whitespace-nowrap">{eq.buildingCode ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{eq.woCount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmtCAD(eq.labourCost)}</td>
                          <td className="px-3 py-2 font-medium text-indigo-700 tabular-nums whitespace-nowrap">{fmtCAD(eq.totalCost)}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmtCAD(eq.avgCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Trades ── */}
          {tab === 'trades' && (
            <div className="space-y-6">
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-slate-300" />
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(200, (data?.crafts.length ?? 0) * 36)}>
                    <BarChart
                      data={data?.crafts}
                      layout="vertical"
                      margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                      barSize={18}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tickFormatter={v => fmtCAD(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="craft" width={90} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<HBarTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                        {(data?.crafts ?? []).map((_, i) => (
                          <Cell key={i} fill={i === 0 ? INDIGO : i < 3 ? '#818cf8' : INDIGO_LIGHT} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-left">
                          <th className="px-3 py-2 font-medium text-slate-600 w-8 text-center">#</th>
                          <th className="px-3 py-2 font-medium text-slate-600">Trade / Craft</th>
                          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">WOs</th>
                          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">Total Cost</th>
                          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">Avg / WO</th>
                          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const grandTotal = (data?.crafts ?? []).reduce((s, c) => s + c.totalCost, 0);
                          return (data?.crafts ?? []).map((c, idx) => (
                            <tr key={c.craft} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <td className="px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-slate-700">{c.craft}</td>
                              <td className="px-3 py-2 text-slate-500 tabular-nums">{c.woCount.toLocaleString()}</td>
                              <td className="px-3 py-2 font-medium text-indigo-700 tabular-nums whitespace-nowrap">{fmtCAD(c.totalCost)}</td>
                              <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmtCAD(c.woCount ? c.totalCost / c.woCount : 0)}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="h-full bg-indigo-500 rounded-full"
                                      style={{ width: `${grandTotal ? (c.totalCost / grandTotal) * 100 : 0}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400 tabular-nums">{pct(c.totalCost, grandTotal)}</span>
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
