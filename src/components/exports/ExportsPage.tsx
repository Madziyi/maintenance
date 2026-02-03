import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import { Equipment } from '../../../types';
import { Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/src/components/common/Toast';

type SheetCItem = { equipment: Equipment; lastChangedAt: string | null; changedFields: string[] };

function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isoFromLocalDatetime(value: string) {
  // value comes as "YYYY-MM-DDTHH:mm" in local time
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function defaultSinceLocalValue() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setSeconds(0);
  d.setMilliseconds(0);
  // format as YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export const ExportsPage: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { showToast } = useToast();

  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [loadingC, setLoadingC] = useState(false);

  const [sheetA, setSheetA] = useState<Equipment[]>([]);
  const [sheetB, setSheetB] = useState<Equipment[]>([]);
  const [sheetC, setSheetC] = useState<SheetCItem[]>([]);

  const [sinceLocal, setSinceLocal] = useState(defaultSinceLocalValue());

  const sinceIso = useMemo(() => isoFromLocalDatetime(sinceLocal), [sinceLocal]);

  const previewA = sheetA.slice(0, 20);
  const previewB = sheetB.slice(0, 20);
  const previewC = sheetC.slice(0, 20);

  const loadA = async () => {
    setLoadingA(true);
    try {
      setSheetA(await api.getExportSheetA());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load Sheet A', 'error');
    } finally {
      setLoadingA(false);
    }
  };

  const loadB = async () => {
    setLoadingB(true);
    try {
      setSheetB(await api.getExportSheetB());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load Sheet B', 'error');
    } finally {
      setLoadingB(false);
    }
  };

  const loadC = async () => {
    if (!sinceIso) {
      showToast('Pick a valid baseline timestamp', 'warning');
      return;
    }
    setLoadingC(true);
    try {
      setSheetC(await api.getExportSheetC(sinceIso));
    } catch (e: any) {
      showToast(e?.message || 'Failed to load Sheet C', 'error');
    } finally {
      setLoadingC(false);
    }
  };

  useEffect(() => {
    if (!canEdit) return;
    // load initial previews
    loadA();
    loadB();
    loadC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  if (!canEdit) {
    return (
      <div className="space-y-4 pb-20 animate-fade-in">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Exports</h1>
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-600 text-sm">
          Please log in to access exports.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Exports</h1>
          <p className="text-slate-500 text-sm mt-1">Download the three reconciliation sheets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SheetCard
          title="Sheet A — NEW (NewEquipment = true)"
          subtitle={`${sheetA.length} rows`}
          loading={loadingA}
          onRefresh={loadA}
          onDownload={async () => {
            const csv = await api.downloadExportSheetA();
            downloadTextFile(`sheet_a_new_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
          }}
        >
          <PreviewTable
            rows={previewA.map(e => ({
              id: e.id,
              accountingName: e.accountingName,
              scadaName: e.scadaName || '',
              location: e.LocationDesc || e.Location,
              room: e.room,
              status: e.status === 'REMOVED' ? 'Deleted' : e.status,
            }))}
          />
        </SheetCard>

        <SheetCard
          title="Sheet B — Deleted"
          subtitle={`${sheetB.length} rows`}
          loading={loadingB}
          onRefresh={loadB}
          onDownload={async () => {
            const csv = await api.downloadExportSheetB();
            downloadTextFile(`sheet_b_deleted_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
          }}
        >
          <PreviewTable
            rows={previewB.map(e => ({
              id: e.id,
              accountingName: e.accountingName,
              scadaName: e.scadaName || '',
              location: e.LocationDesc || e.Location,
              room: e.room,
              status: e.status === 'REMOVED' ? 'Deleted' : e.status,
            }))}
          />
        </SheetCard>

        <SheetCard
          title="Sheet C — CHANGED since baseline"
          subtitle={`${sheetC.length} rows`}
          loading={loadingC}
          onRefresh={loadC}
          extraControls={
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={sinceLocal}
                onChange={e => setSinceLocal(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          }
          onDownload={async () => {
            if (!sinceIso) {
              showToast('Pick a valid baseline timestamp', 'warning');
              return;
            }
            const csv = await api.downloadExportSheetC(sinceIso);
            downloadTextFile(`sheet_c_changed_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
          }}
        >
          <PreviewTable
            rows={previewC.map(x => ({
              id: x.equipment.id,
              accountingName: x.equipment.accountingName,
              scadaName: x.equipment.scadaName || '',
              location: x.equipment.LocationDesc || x.equipment.Location,
              room: x.equipment.room,
              changedFields: (x.changedFields || []).join(', '),
              lastChangedAt: x.lastChangedAt || '',
            }))}
          />
        </SheetCard>
      </div>
    </div>
  );
};

const SheetCard: React.FC<{
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  onDownload: () => void | Promise<void>;
  extraControls?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, loading, onRefresh, onDownload, extraControls, children }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{title}</div>
            <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {extraControls}
            <button
              onClick={onRefresh}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={onDownload}
              className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-2"
              disabled={loading}
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
};

const PreviewTable: React.FC<{ rows: Array<Record<string, string>> }> = ({ rows }) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['id', 'accountingName', 'scadaName', 'location', 'room', 'status'];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            {headers.map(h => (
              <th key={h} className="text-left py-2 pr-4 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="py-6 text-slate-500" colSpan={headers.length}>
                No rows
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx}>
                {headers.map(h => (
                  <td key={h} className="py-2 pr-4 max-w-[220px] truncate" title={r[h] || ''}>
                    {r[h] || ''}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

