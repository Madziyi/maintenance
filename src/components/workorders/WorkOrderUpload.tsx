import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, AlertTriangle, X, ChevronRight, Loader2, Copy } from 'lucide-react';
import { api } from '../../../api';
import { parsePdfFile } from '../../utils/workOrderParser';
import type { BuildingData, ParsedWorkOrder } from '../../../types';

interface Props {
  canEdit: boolean;
  data: BuildingData[];
}

type Step = 1 | 2 | 3 | 4 | 5;
type ConflictAction = 'skip' | 'update' | 'keep-both';

type ParsedWorkOrderWithFile = ParsedWorkOrder & { _file: File };

interface ExistingRecord {
  id: string;
  workOrderNumber: string;
  status: string | null;
  openDate: string | null;
  buildingCode: string | null;
  buildingName: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const CONFLICT_LABELS: Record<ConflictAction, string> = {
  skip: 'Skip',
  update: 'Update existing',
  'keep-both': 'Keep both',
};

export const WorkOrderUpload: React.FC<Props> = ({ canEdit, data }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [parsedOrders, setParsedOrders] = useState<ParsedWorkOrderWithFile[]>([]);
  const [editedOrders, setEditedOrders] = useState<ParsedWorkOrderWithFile[]>([]);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<Step>(1);
  const [parseProgress, setParseProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [saveProgress, setSaveProgress] = useState<{ saved: number; total: number; errors: string[] }>({ saved: 0, total: 0, errors: [] });
  const [isDragOver, setIsDragOver] = useState(false);

  // Duplicate detection
  const [duplicateMap, setDuplicateMap] = useState<Record<string, ExistingRecord>>({});
  const [conflictActions, setConflictActions] = useState<Record<number, ConflictAction>>({});

  // Editing state for inline cell editing
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

  const allEquipment = data.flatMap(b => b.equipment);

  // ── Step 1 handlers ──────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(f => f.type === 'application/pdf');
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const fresh = pdfs.filter(f => !existing.has(f.name + f.size));
      return [...prev, ...fresh];
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  // ── Step 2: parsing + duplicate check ────────────────────────────────────────

  const startParsing = useCallback(async () => {
    setStep(2);
    setParseProgress({ current: 0, total: files.length });
    const all: ParsedWorkOrderWithFile[] = [];

    for (let i = 0; i < files.length; i++) {
      setParseProgress({ current: i + 1, total: files.length });
      const results = await parsePdfFile(files[i], allEquipment);
      for (const r of results) {
        all.push({ ...r, _file: files[i] });
      }
    }

    // Check which WO numbers already exist in the DB
    const woNumbers = all.map(o => o.workOrderNumber).filter(Boolean);
    const dupes = woNumbers.length > 0 ? await api.checkDuplicateWorkOrders(woNumbers) : {};

    // Default conflict action for each duplicate row is 'skip'
    const actions: Record<number, ConflictAction> = {};
    all.forEach((order, i) => {
      if (dupes[order.workOrderNumber]) actions[i] = 'skip';
    });

    setDuplicateMap(dupes);
    setConflictActions(actions);
    setParsedOrders(all);
    setEditedOrders(all.map(o => ({ ...o })));
    setSkipped(new Set());
    setStep(3);
  }, [files, allEquipment]);

  // ── Step 3: review helpers ────────────────────────────────────────────────────

  const updateOrder = (index: number, field: keyof ParsedWorkOrder, value: string) => {
    setEditedOrders(prev =>
      prev.map((o, i) => i === index ? { ...o, [field]: value } : o)
    );
  };

  const toggleSkip = (index: number) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const setConflictAction = (index: number, action: ConflictAction) => {
    setConflictActions(prev => ({ ...prev, [index]: action }));
    // If user picks skip via the conflict selector, also mark it skipped visually
    if (action === 'skip') {
      setSkipped(prev => new Set([...prev, index]));
    } else {
      setSkipped(prev => { const n = new Set(prev); n.delete(index); return n; });
    }
  };

  const skipAllWarnings = () => {
    const next = new Set(skipped);
    editedOrders.forEach((o, i) => { if (o.parseWarnings.length > 0) next.add(i); });
    setSkipped(next);
  };

  const skipAllDuplicates = () => {
    const nextSkipped = new Set(skipped);
    const nextActions = { ...conflictActions };
    editedOrders.forEach((o, i) => {
      if (duplicateMap[o.workOrderNumber]) {
        nextSkipped.add(i);
        nextActions[i] = 'skip';
      }
    });
    setSkipped(nextSkipped);
    setConflictActions(nextActions);
  };

  const duplicateCount = editedOrders.filter(o => duplicateMap[o.workOrderNumber]).length;
  const warningCount = editedOrders.filter(o => o.parseWarnings.length > 0 && !duplicateMap[o.workOrderNumber]).length;
  const skippedCount = skipped.size;

  // ── Step 4: saving ───────────────────────────────────────────────────────────

  const startSaving = useCallback(async () => {
    setStep(4);

    // Rows that won't be saved at all (skipped non-duplicates + skip-action duplicates)
    const toProcess = editedOrders.filter((_, i) => !skipped.has(i));
    setSaveProgress({ saved: 0, total: toProcess.length, errors: [] });

    const fileUrlMap = new Map<File, string>();
    const errors: string[] = [];
    let saved = 0;

    // Upload unique PDFs first
    const uniqueFiles = Array.from(new Set<File>(toProcess.map(o => o._file)));
    for (const file of uniqueFiles) {
      try {
        fileUrlMap.set(file, await api.uploadFile(file));
      } catch (err) {
        errors.push(`PDF upload failed for "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Save each order
    for (let i = 0; i < editedOrders.length; i++) {
      if (skipped.has(i)) continue;
      const order = editedOrders[i];
      const pdfUrl = fileUrlMap.get(order._file) ?? null;
      const action = conflictActions[i]; // undefined = new record, 'update' or 'keep-both' for duplicates

      const payload = {
        workOrderNumber: order.workOrderNumber,
        buildingCode: order.buildingCode,
        buildingName: order.buildingName,
        roomNumber: order.roomNumber,
        equipmentId: order.equipmentId,
        equipmentRaw: order.equipmentRaw,
        requester: order.requester,
        requestDescription: order.requestDescription,
        status: order.status,
        priority: order.priority,
        craft: order.craft,
        openDate: order.openDate,
        completeDate: order.completeDate,
        actualHours: order.actualHours,
        actualLabourCost: order.actualLabourCost,
        actualTotalCost: order.actualTotalCost,
        technicianNotes: order.technicianNotes,
        completionRemark: order.completionRemark,
        pdfUrl,
        pageNumber: order.pageNumber,
        pageCount: order.pageCount,
        source: 'pdf' as const,
        completedAt: null,
        completionHours: null,
        completedByStaffIds: null,
        completedByNames: null,
        rawTranscript: null,
        technicians: order.technicians,
      };

      try {
        if (action === 'update') {
          const existing = duplicateMap[order.workOrderNumber];
          await api.updateWorkOrder(existing.id, payload);
        } else {
          // 'keep-both' or new record
          await api.createWorkOrder(payload);
        }
        saved++;
        setSaveProgress(prev => ({ ...prev, saved, errors: [...errors] }));
      } catch (err) {
        errors.push(`WO #${order.workOrderNumber}: ${err instanceof Error ? err.message : String(err)}`);
        setSaveProgress(prev => ({ ...prev, errors: [...errors] }));
      }
    }

    setSaveProgress({ saved, total: toProcess.length, errors });
    setStep(5);
  }, [editedOrders, skipped, conflictActions, duplicateMap]);

  // ── Reset ────────────────────────────────────────────────────────────────────

  const resetWizard = () => {
    setFiles([]);
    setParsedOrders([]);
    setEditedOrders([]);
    setSkipped(new Set());
    setDuplicateMap({});
    setConflictActions({});
    setStep(1);
    setParseProgress({ current: 0, total: 0 });
    setSaveProgress({ saved: 0, total: 0, errors: [] });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => (step === 1 ? navigate('/work-orders') : resetWizard())}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Upload Work Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Step {step} of 5 —{' '}
            {step === 1 && 'Select PDFs'}
            {step === 2 && 'Parsing files'}
            {step === 3 && 'Review'}
            {step === 4 && 'Saving'}
            {step === 5 && 'Complete'}
          </p>
        </div>
      </div>

      {/* Step 1 – Drop zone */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center min-h-64 rounded-xl border-2 border-dashed cursor-pointer transition-colors select-none ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50'
            }`}
          >
            <Upload size={40} strokeWidth={1.4} className={isDragOver ? 'text-indigo-500' : 'text-slate-400'} />
            <p className="mt-4 text-base font-medium text-slate-700">Drop PDF files here</p>
            <p className="mt-1 text-sm text-slate-400">or click to browse</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" multiple onChange={handleFileInputChange} className="sr-only" />
          </div>

          {files.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeFile(i); }}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={startParsing}
              disabled={files.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Parse Work Orders
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 – Parsing */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center py-20 gap-5">
          <Loader2 size={40} className="text-indigo-500 animate-spin" />
          <div className="text-center">
            <p className="text-base font-medium text-slate-700">
              Parsing file {parseProgress.current} of {parseProgress.total}…
            </p>
            <p className="text-sm text-slate-400 mt-1">Extracting work order data from PDFs</p>
          </div>
        </div>
      )}

      {/* Step 3 – Review */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-5 py-4">
            <div className="flex items-center gap-5 text-sm flex-wrap">
              <span className="font-medium text-slate-800">
                {editedOrders.length} work order{editedOrders.length !== 1 ? 's' : ''} found
              </span>
              {duplicateCount > 0 && (
                <span className="flex items-center gap-1.5 text-orange-600">
                  <Copy size={14} />
                  {duplicateCount} already in system
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle size={14} />
                  {warningCount} with parse warnings
                </span>
              )}
              {skippedCount > 0 && (
                <span className="text-slate-500">{skippedCount} skipped</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {duplicateCount > 0 && (
                <button
                  onClick={skipAllDuplicates}
                  className="text-sm px-3 py-1.5 rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                >
                  Skip all duplicates
                </button>
              )}
              {warningCount > 0 && (
                <button
                  onClick={skipAllWarnings}
                  className="text-sm px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  Skip all with warnings
                </button>
              )}
            </div>
          </div>

          {/* Duplicate legend */}
          {duplicateCount > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800">
              <span className="font-medium">Duplicates detected.</span>{' '}
              For each orange row, choose what to do:
              <span className="font-medium"> Skip</span> — don't import,
              <span className="font-medium"> Update existing</span> — overwrite stored fields (keeps annotations),
              <span className="font-medium"> Keep both</span> — save as a separate record.
            </div>
          )}

          {/* Review cards (mobile) */}
          <div className="md:hidden space-y-3">
            {editedOrders.map((order, i) => {
              const isDuplicate = !!duplicateMap[order.workOrderNumber];
              const hasWarnings = order.parseWarnings.length > 0;
              const isSkipped = skipped.has(i);
              const conflictAction = conflictActions[i] ?? 'skip';
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-3 bg-white ${isDuplicate ? 'border-orange-300' : hasWarnings ? 'border-amber-300' : 'border-slate-200'} ${isSkipped ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">WO #</p>
                      <p className="font-mono text-sm font-semibold text-slate-800 truncate">{order.workOrderNumber || '—'}</p>
                    </div>
                    {isDuplicate ? (
                      <select
                        value={conflictAction}
                        onChange={e => setConflictAction(i, e.target.value as ConflictAction)}
                        className="text-xs px-2 py-1 min-h-9 rounded border border-slate-200"
                      >
                        {(Object.entries(CONFLICT_LABELS) as [ConflictAction, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    ) : (
                      <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={isSkipped}
                          onChange={() => toggleSkip(i)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Skip
                      </label>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                    <div><span className="text-slate-400">Equipment: </span><span className="text-slate-700">{order.equipmentRaw || '—'}</span></div>
                    <div><span className="text-slate-400">Building: </span><span className="text-slate-700">{order.buildingCode || '—'}</span></div>
                    <div><span className="text-slate-400">Open Date: </span><span className="text-slate-700">{order.openDate || '—'}</span></div>
                    {hasWarnings && (
                      <div className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {order.parseWarnings.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Review table (desktop) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="px-3 py-3 font-medium text-slate-600 whitespace-nowrap">Action</th>
                    <th className="px-3 py-3 font-medium text-slate-600 whitespace-nowrap">WO #</th>
                    <th className="px-3 py-3 font-medium text-slate-600">Equipment</th>
                    <th className="px-3 py-3 font-medium text-slate-600">Building</th>
                    <th className="px-3 py-3 font-medium text-slate-600 whitespace-nowrap">Open Date</th>
                    <th className="px-3 py-3 font-medium text-slate-600">Status</th>
                    <th className="px-3 py-3 font-medium text-slate-600">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editedOrders.map((order, i) => {
                    const isDuplicate = !!duplicateMap[order.workOrderNumber];
                    const existingRecord = duplicateMap[order.workOrderNumber];
                    const hasWarnings = order.parseWarnings.length > 0;
                    const isSkipped = skipped.has(i);
                    const conflictAction = conflictActions[i] ?? 'skip';

                    return (
                      <tr
                        key={i}
                        className={[
                          isDuplicate ? 'bg-orange-50 border-l-2 border-l-orange-400' : hasWarnings ? 'bg-yellow-50 border-l-2 border-l-amber-400' : '',
                          isSkipped ? 'opacity-40' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {/* Action column */}
                        <td className="px-3 py-2">
                          {isDuplicate ? (
                            <select
                              value={conflictAction}
                              onChange={e => setConflictAction(i, e.target.value as ConflictAction)}
                              className={`text-xs px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                                conflictAction === 'skip'
                                  ? 'border-slate-200 bg-white text-slate-600'
                                  : conflictAction === 'update'
                                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                                  : 'border-blue-300 bg-blue-50 text-blue-700'
                              }`}
                            >
                              {(Object.entries(CONFLICT_LABELS) as [ConflictAction, string][]).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSkipped}
                              onChange={() => toggleSkip(i)}
                              title="Skip this row"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          )}
                        </td>

                        {/* WO # */}
                        <td className="px-3 py-2 font-mono">
                          <div className="flex flex-col gap-0.5">
                            {editingCell?.row === i && editingCell.col === 'workOrderNumber' ? (
                              <input
                                autoFocus
                                value={order.workOrderNumber}
                                onChange={e => updateOrder(i, 'workOrderNumber', e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                className="w-24 px-1.5 py-0.5 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            ) : (
                              <span
                                onClick={() => setEditingCell({ row: i, col: 'workOrderNumber' })}
                                className="cursor-pointer hover:underline hover:text-indigo-600"
                              >
                                {order.workOrderNumber || <span className="text-slate-400">—</span>}
                              </span>
                            )}
                            {isDuplicate && (
                              <span className="text-[10px] text-orange-600 font-medium">
                                already exists · {existingRecord.status ?? '?'} · {existingRecord.openDate ?? '?'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Equipment */}
                        <td className="px-3 py-2 max-w-[160px]">
                          {editingCell?.row === i && editingCell.col === 'equipmentRaw' ? (
                            <input
                              autoFocus
                              value={order.equipmentRaw ?? ''}
                              onChange={e => updateOrder(i, 'equipmentRaw', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              className="w-full px-1.5 py-0.5 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingCell({ row: i, col: 'equipmentRaw' })}
                              className="cursor-pointer hover:underline hover:text-indigo-600 truncate block"
                            >
                              {order.equipmentRaw || <span className="text-slate-400">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Building */}
                        <td className="px-3 py-2">
                          {editingCell?.row === i && editingCell.col === 'buildingCode' ? (
                            <input
                              autoFocus
                              value={order.buildingCode ?? ''}
                              onChange={e => updateOrder(i, 'buildingCode', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              className="w-20 px-1.5 py-0.5 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingCell({ row: i, col: 'buildingCode' })}
                              className="cursor-pointer hover:underline hover:text-indigo-600"
                            >
                              {order.buildingCode || <span className="text-slate-400">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Open Date */}
                        <td className="px-3 py-2">
                          {editingCell?.row === i && editingCell.col === 'openDate' ? (
                            <input
                              autoFocus
                              value={order.openDate ?? ''}
                              onChange={e => updateOrder(i, 'openDate', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              className="w-28 px-1.5 py-0.5 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingCell({ row: i, col: 'openDate' })}
                              className="cursor-pointer hover:underline hover:text-indigo-600 whitespace-nowrap"
                            >
                              {order.openDate || <span className="text-slate-400">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2">
                          {editingCell?.row === i && editingCell.col === 'status' ? (
                            <select
                              autoFocus
                              value={order.status ?? ''}
                              onChange={e => { updateOrder(i, 'status', e.target.value); setEditingCell(null); }}
                              onBlur={() => setEditingCell(null)}
                              className="px-1.5 py-0.5 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">—</option>
                              <option value="OPEN">OPEN</option>
                              <option value="CLOSE">CLOSE</option>
                            </select>
                          ) : (
                            <span
                              onClick={() => setEditingCell({ row: i, col: 'status' })}
                              className="cursor-pointer hover:underline hover:text-indigo-600"
                            >
                              {order.status || <span className="text-slate-400">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Warnings */}
                        <td className="px-3 py-2">
                          {hasWarnings ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                              <AlertTriangle size={12} />
                              {order.parseWarnings.join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={startSaving}
              disabled={editedOrders.every((_, i) => skipped.has(i))}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm &amp; Save
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4 – Saving */}
      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center py-20 gap-6">
          <Loader2 size={40} className="text-indigo-500 animate-spin" />
          <div className="text-center w-full max-w-sm">
            <p className="text-base font-medium text-slate-700 mb-4">
              Saving {saveProgress.saved} / {saveProgress.total} work orders…
            </p>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: saveProgress.total > 0
                    ? `${Math.round((saveProgress.saved / saveProgress.total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {saveProgress.total > 0
                ? `${Math.round((saveProgress.saved / saveProgress.total) * 100)}%`
                : '0%'}
            </p>
          </div>
        </div>
      )}

      {/* Step 5 – Summary */}
      {step === 5 && (
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col items-center py-12 gap-6">
          <CheckCircle size={56} className="text-green-500" strokeWidth={1.4} />
          <div className="text-center">
            <p className="text-xl font-semibold text-slate-900">
              {saveProgress.saved} work order{saveProgress.saved !== 1 ? 's' : ''} saved successfully
            </p>
            {saveProgress.total - saveProgress.saved > 0 && (
              <p className="text-sm text-slate-500 mt-1">
                {saveProgress.total - saveProgress.saved} skipped or failed
              </p>
            )}
          </div>

          {saveProgress.errors.length > 0 && (
            <div className="w-full max-w-xl bg-red-50 border border-red-200 rounded-lg px-5 py-4">
              <p className="text-sm font-medium text-red-700 mb-2">
                {saveProgress.errors.length} error{saveProgress.errors.length !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {saveProgress.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600 font-mono leading-relaxed">{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => navigate('/work-orders')}
              className="px-5 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              View Work Orders
            </button>
            <button
              onClick={resetWizard}
              className="px-5 py-2.5 rounded-md border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Upload More
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
