/**
 * PhotoComplete — batch upload paper work order forms, extract handwriting via
 * Gemini Vision, review/edit fields, then mark each WO complete.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, X, CheckCircle2, AlertTriangle, AlertCircle,
  Loader2, FileImage, ChevronLeft, Edit2, Check, SkipForward,
  RefreshCw, Image as ImageIcon,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { api } from '../../../api';
import type { Staff } from '../../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedData {
  woNumber: string | null;
  completionDate: string | null;
  hours: number | null;
  completedBy: string[];
  completionRemark: string | null;
  confidence: 'high' | 'medium' | 'low';
}

type ItemStatus =
  | 'queued'       // waiting to extract
  | 'extracting'   // Gemini Vision in progress
  | 'review'       // extraction done, needs user review
  | 'warning'      // WO already closed/pending — needs decision
  | 'no-match'     // WO number not found in DB
  | 'submitting'   // being saved
  | 'done'         // successfully submitted
  | 'skipped'      // user chose to skip
  | 'error';       // extraction or submit failed

interface QueueItem {
  id: string;
  file: File;
  pageIndex: number;     // 0-based page within source file
  totalPages: number;    // total pages in source file (1 for images)
  thumbUrl: string;      // object URL for thumbnail
  imageBase64: string;   // compressed base64 for Gemini
  mimeType: string;
  status: ItemStatus;
  extracted: ExtractedData | null;
  // After DB lookup
  matchedWoId: string | null;
  matchedWoStatus: string | null;
  // Editable overrides (user can change any field)
  editDate: string;
  editHours: string;
  editBy: string;
  editRemark: string;
  // Staff match
  matchedStaff: { id: string; name: string }[];
  error: string | null;
  // Warning decision
  warningAction: 'skip' | 'overwrite' | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** Resize a base64/data-url image to max width, return base64 (no prefix) */
async function resizeImage(src: string, maxWidth = 1400): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Read a File as a data URL */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** Render a PDF page to a canvas and return data URL */
async function pdfPageToDataUrl(arrayBuffer: ArrayBuffer, pageNum: number): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.88);
}

/** Expand files: images → 1 item each; PDFs → 1 item per page */
async function expandFiles(files: File[]): Promise<Omit<QueueItem, 'matchedWoId' | 'matchedWoStatus' | 'matchedStaff' | 'editDate' | 'editHours' | 'editBy' | 'editRemark' | 'warningAction'>[]> {
  const items: Omit<QueueItem, 'matchedWoId' | 'matchedWoStatus' | 'matchedStaff' | 'editDate' | 'editHours' | 'editBy' | 'editRemark' | 'warningAction'>[] = [];

  for (const file of files) {
    if (file.type === 'application/pdf') {
      const buf = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const numPages = pdf.numPages;
      for (let p = 1; p <= numPages; p++) {
        const dataUrl = await pdfPageToDataUrl(buf, p);
        const { base64, mimeType } = await resizeImage(dataUrl);
        items.push({
          id: uid(), file, pageIndex: p - 1, totalPages: numPages,
          thumbUrl: dataUrl, imageBase64: base64, mimeType,
          status: 'queued', extracted: null, error: null,
        });
      }
    } else {
      const dataUrl = await readAsDataURL(file);
      const { base64, mimeType } = await resizeImage(dataUrl);
      items.push({
        id: uid(), file, pageIndex: 0, totalPages: 1,
        thumbUrl: dataUrl, imageBase64: base64, mimeType,
        status: 'queued', extracted: null, error: null,
      });
    }
  }
  return items;
}

/** Confidence badge */
function ConfBadge({ c }: { c: 'high' | 'medium' | 'low' }) {
  const map = {
    high:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low:    'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${map[c]}`}>
      {c} confidence
    </span>
  );
}

// ─── Review card ─────────────────────────────────────────────────────────────

function ReviewCard({
  item, staffList, onUpdate, onSubmit, onSkip,
}: {
  item: QueueItem;
  staffList: Staff[];
  onUpdate: (id: string, patch: Partial<QueueItem>) => void;
  onSubmit: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);

  const statusColour: Record<ItemStatus, string> = {
    queued:     'border-slate-200',
    extracting: 'border-indigo-200 bg-indigo-50/30',
    review:     item.extracted?.confidence === 'low' ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200',
    warning:    'border-orange-300 bg-orange-50/30',
    'no-match': 'border-red-200 bg-red-50/20',
    submitting: 'border-indigo-200 bg-indigo-50/20',
    done:       'border-emerald-200 bg-emerald-50/20',
    skipped:    'border-slate-100 bg-slate-50/50 opacity-60',
    error:      'border-red-200 bg-red-50/20',
  };

  const label = item.totalPages > 1
    ? `${item.file.name} — page ${item.pageIndex + 1}/${item.totalPages}`
    : item.file.name;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${statusColour[item.status]}`}>
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <button
          onClick={() => setImgExpanded(e => !e)}
          className="shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center hover:opacity-80 transition-opacity"
          title="Click to expand"
        >
          {item.thumbUrl
            ? <img src={item.thumbUrl} alt="" className="w-full h-full object-cover" />
            : <ImageIcon size={20} className="text-slate-300" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* File label + status */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs text-slate-400 truncate max-w-[200px]">{label}</span>
            {item.status === 'extracting' && (
              <span className="flex items-center gap-1 text-xs text-indigo-500">
                <Loader2 size={11} className="animate-spin" /> Extracting…
              </span>
            )}
            {item.status === 'done' && <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={12} /> Submitted</span>}
            {item.status === 'skipped' && <span className="text-xs text-slate-400">Skipped</span>}
            {item.status === 'error' && <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={11} /> Error</span>}
            {item.extracted && <ConfBadge c={item.extracted.confidence} />}
          </div>

          {/* Extracted fields */}
          {(item.status === 'review' || item.status === 'warning' || item.status === 'no-match') && (
            <>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-0.5">WO #</label>
                    <input
                      value={item.extracted?.woNumber ?? ''}
                      onChange={e => onUpdate(item.id, { extracted: { ...item.extracted!, woNumber: e.target.value } })}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-0.5">Date</label>
                    <input
                      type="date"
                      value={item.editDate}
                      onChange={e => onUpdate(item.id, { editDate: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-0.5">Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={item.editHours}
                      onChange={e => onUpdate(item.id, { editHours: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-0.5">By</label>
                    <input
                      value={item.editBy}
                      onChange={e => onUpdate(item.id, { editBy: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 block mb-0.5">Completion Remark</label>
                    <textarea
                      rows={3}
                      value={item.editRemark}
                      onChange={e => onUpdate(item.id, { editRemark: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
                  <span className="text-slate-500">WO #</span>
                  <span className={`font-mono font-semibold ${item.status === 'no-match' ? 'text-red-600' : 'text-slate-800'}`}>
                    {item.extracted?.woNumber ?? <em className="text-slate-300">not found</em>}
                    {item.status === 'no-match' && <span className="ml-1 text-red-500 font-normal">(no match)</span>}
                  </span>
                  <span className="text-slate-500">Date</span>
                  <span className="text-slate-700">{item.editDate || <em className="text-slate-300">—</em>}</span>
                  <span className="text-slate-500">Hours</span>
                  <span className="text-slate-700">{item.editHours || <em className="text-slate-300">—</em>}</span>
                  <span className="text-slate-500">By</span>
                  <span className="text-slate-700">{item.editBy || <em className="text-slate-300">—</em>}</span>
                  {item.matchedStaff.length > 0 && (
                    <>
                      <span className="text-slate-500">Matched staff</span>
                      <span className="text-indigo-600 text-xs">{item.matchedStaff.map(s => s.name).join(', ')}</span>
                    </>
                  )}
                  <span className="text-slate-500 col-span-2">Remark</span>
                  <span className="text-slate-700 col-span-2 line-clamp-3">{item.editRemark || <em className="text-slate-300">—</em>}</span>
                </div>
              )}

              {/* Warning: WO already closed */}
              {item.status === 'warning' && !item.warningAction && (
                <div className="mb-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                  <AlertTriangle size={12} className="inline mr-1" />
                  WO #{item.extracted?.woNumber} is already <strong>{item.matchedWoStatus}</strong>. What would you like to do?
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onUpdate(item.id, { warningAction: 'overwrite', status: 'review' })}
                      className="px-2 py-1 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600"
                    >
                      Overwrite
                    </button>
                    <button
                      onClick={() => onUpdate(item.id, { warningAction: 'skip', status: 'skipped' })}
                      className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {/* No-match: can still submit but WO won't be found */}
              {item.status === 'no-match' && (
                <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle size={12} className="inline mr-1" />
                  WO number not found in system. Edit the WO # above to fix, or skip this form.
                </div>
              )}

              {item.error && (
                <p className="mb-2 text-xs text-red-500">{item.error}</p>
              )}

              {/* Action buttons */}
              {(item.status === 'review' || (item.status === 'warning' && item.warningAction === 'overwrite')) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSubmit(item.id)}
                    disabled={item.status === 'submitting'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {item.status === 'submitting'
                      ? <><Loader2 size={11} className="animate-spin" /> Submitting…</>
                      : <><CheckCircle2 size={11} /> Mark Complete</>}
                  </button>
                  <button
                    onClick={() => setEditing(e => !e)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition-colors"
                  >
                    {editing ? <><Check size={11} /> Done editing</> : <><Edit2 size={11} /> Edit</>}
                  </button>
                  <button
                    onClick={() => onSkip(item.id)}
                    className="flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs transition-colors"
                  >
                    <SkipForward size={11} /> Skip
                  </button>
                </div>
              )}
            </>
          )}

          {item.status === 'queued' && (
            <p className="text-xs text-slate-400">Waiting to extract…</p>
          )}
          {item.status === 'error' && (
            <p className="text-xs text-red-500">{item.error}</p>
          )}
        </div>
      </div>

      {/* Expanded image lightbox */}
      {imgExpanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <img src={item.thumbUrl} alt="Form" className="max-h-[400px] mx-auto rounded-lg shadow" />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const PhotoComplete: React.FC = () => {
  const navigate = useNavigate();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load staff once for fuzzy matching
  useEffect(() => {
    api.getStaff().then(setStaffList).catch(() => {});
  }, []);

  const staffFuse = React.useMemo(() =>
    new Fuse(staffList.filter(s => s.active), { keys: ['name'], threshold: 0.4 }),
    [staffList]
  );

  function matchStaff(names: string[]): { id: string; name: string }[] {
    return names.flatMap(n => {
      const results = staffFuse.search(n);
      return results.slice(0, 1).map(r => ({ id: r.item.id, name: r.item.name }));
    });
  }

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  // ── Add files to queue ──
  const addFiles = useCallback(async (files: File[]) => {
    const expanded = await expandFiles(files);
    const staffNames = staffList.filter(s => s.active).map(s => s.name);

    const newItems: QueueItem[] = expanded.map(e => ({
      ...e,
      matchedWoId: null,
      matchedWoStatus: null,
      matchedStaff: [],
      editDate: '',
      editHours: '',
      editBy: '',
      editRemark: '',
      warningAction: null,
    }));

    setQueue(prev => [...prev, ...newItems]);

    // Extract all new items in parallel (batches of 3 to avoid rate limits)
    setProcessing(true);
    const BATCH = 3;
    for (let i = 0; i < newItems.length; i += BATCH) {
      const batch = newItems.slice(i, i + BATCH);
      await Promise.all(batch.map(item => extractItem(item, staffNames)));
    }
    setProcessing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffList]);

  const extractItem = async (item: QueueItem, staffNames: string[]) => {
    updateItem(item.id, { status: 'extracting' });
    try {
      const result = await api.extractCompletionImage(item.imageBase64, item.mimeType, staffNames);

      // Look up WO in DB by number
      let matchedWoId: string | null = null;
      let matchedWoStatus: string | null = null;
      let newStatus: ItemStatus = 'no-match';

      if (result.woNumber) {
        try {
          const found = await api.getWorkOrders({ woNumber: result.woNumber, limit: 1 });
          if (found.items.length > 0) {
            const wo = found.items[0];
            matchedWoId = wo.id;
            matchedWoStatus = wo.status;
            if (wo.status === 'CLOSE' || wo.status === 'PENDING_REVIEW') {
              newStatus = 'warning';
            } else {
              newStatus = 'review';
            }
          }
        } catch { /* keep no-match */ }
      }

      const matched = matchStaff(result.completedBy);
      const today = new Date().toISOString().slice(0, 10);

      updateItem(item.id, {
        status: newStatus,
        extracted: result,
        matchedWoId,
        matchedWoStatus,
        matchedStaff: matched,
        editDate: result.completionDate || today,
        editHours: result.hours !== null ? String(result.hours) : '',
        editBy: result.completedBy.join(', '),
        editRemark: result.completionRemark || '',
        warningAction: null,
      });
    } catch (e: any) {
      updateItem(item.id, { status: 'error', error: e.message });
    }
  };

  // ── Submit one item ──
  const submitItem = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item || !item.matchedWoId) return;

    updateItem(id, { status: 'submitting', error: null });
    try {
      // Upload photo to R2 first
      const blob = await (await fetch(`data:${item.mimeType};base64,${item.imageBase64}`)).blob();
      const file = new File([blob], `wo-completion-${item.matchedWoId}.jpg`, { type: 'image/jpeg' });
      const imageUrl = await api.uploadFile(file);

      await api.submitWorkOrderCompletion(item.matchedWoId, {
        staffIds: item.matchedStaff.map(s => s.id),
        staffNames: item.editBy ? item.editBy.split(',').map(s => s.trim()) : [],
        completedAt: item.editDate || new Date().toISOString().slice(0, 10),
        completionHours: item.editHours ? Number(item.editHours) : null,
        rawTranscript: '',
        technicianNotes: '',
        completionRemark: item.editRemark,
        completionImageUrl: imageUrl,
      });

      updateItem(id, { status: 'done' });
    } catch (e: any) {
      updateItem(id, { status: 'review', error: e.message });
    }
  };

  const skipItem = (id: string) => updateItem(id, { status: 'skipped' });

  // ── Submit all ready items ──
  const submitAll = async () => {
    const ready = queue.filter(i => i.status === 'review' && i.matchedWoId);
    for (const item of ready) {
      await submitItem(item.id);
    }
  };

  // ── Drop zone handlers ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (files.length) addFiles(files);
  }, [addFiles]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  // ── Stats ──
  const total = queue.length;
  const done = queue.filter(i => i.status === 'done').length;
  const readyCount = queue.filter(i => i.status === 'review' && i.matchedWoId).length;
  const pendingCount = queue.filter(i => ['queued', 'extracting'].includes(i.status)).length;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Complete from Photo</h1>
          <p className="text-sm text-slate-500">Upload paper work order forms — AI extracts the handwriting</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <div className={`p-3 rounded-full transition-colors ${dragOver ? 'bg-indigo-100' : 'bg-slate-100'}`}>
          <Upload size={24} className={dragOver ? 'text-indigo-500' : 'text-slate-400'} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Drop photos or PDFs here</p>
          <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, or PDF (multi-page PDFs split automatically)</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          Choose Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      {/* Progress bar + bulk actions */}
      {total > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-[160px]">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{done} of {total} submitted</span>
              {pendingCount > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> {pendingCount} extracting…
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
            {readyCount > 1 && (
              <button
                onClick={submitAll}
                className="px-4 py-2 min-h-11 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Submit all ({readyCount})
              </button>
            )}
            <button
              onClick={() => setQueue([])}
              className="px-3 py-2 min-h-11 border border-slate-200 text-slate-500 text-sm rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={13} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Queue */}
      <div className="space-y-3">
        {queue.map(item => (
          <ReviewCard
            key={item.id}
            item={item}
            staffList={staffList}
            onUpdate={updateItem}
            onSubmit={submitItem}
            onSkip={skipItem}
          />
        ))}
      </div>

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-3">
          <FileImage size={40} className="text-slate-200" />
          <p className="text-sm">No forms uploaded yet</p>
        </div>
      )}
    </div>
  );
};
