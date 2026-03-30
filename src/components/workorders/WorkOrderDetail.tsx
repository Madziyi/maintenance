import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Wrench,
  Calendar,
  User,
  Clock,
  DollarSign,
  MessageSquare,
  Send,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Printer,
  Mic,
  ArrowRight,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { api } from '../../../api';
import { CompletionChat } from './CompletionChat';
import { PassOnModal } from './PassOnModal';
import type { WorkOrder, Staff, WorkOrderAnnotation } from '../../../types';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

interface Props {
  canEdit: boolean;
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function fmt(v: string | number | null | undefined, fallback = '—'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function buildPrintHTML(wo: WorkOrder): string {
  const row = (label: string, value: string) =>
    `<tr><td class="label">${label}</td><td>${value || '—'}</td></tr>`;

  const techRows = (wo.technicians ?? [])
    .map(t =>
      `<tr>
        <td>${fmt(t.employeeNumber)}</td>
        <td>${fmt(t.craft)}</td>
        <td>${fmt(t.hours)}</td>
        <td>$${fmt(t.totalCost ?? 0)}</td>
      </tr>`
    )
    .join('');

  const annotRows = (wo.annotations ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(a =>
      `<tr>
        <td>${fmt(a.authorName)}</td>
        <td>${fmt(a.createdAt?.slice(0, 10))}</td>
        <td>${fmt(a.text)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Work Order #${wo.workOrderNumber}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 16px 24px; }
  .header { border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 16pt; color: #1e3a5f; margin: 0; }
  .header .meta { font-size: 9pt; color: #555; text-align: right; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9pt; font-weight: bold;
           border: 1px solid currentColor; }
  .badge-close { color: #166534; border-color: #86efac; background: #f0fdf4; }
  .badge-open  { color: #92400e; border-color: #fcd34d; background: #fffbeb; }
  .section { margin-bottom: 14px; }
  .section-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em;
                   color: #555; font-weight: bold; border-bottom: 1px solid #e2e8f0;
                   padding-bottom: 3px; margin-bottom: 6px; }
  table.fields { width: 100%; border-collapse: collapse; font-size: 10pt; }
  table.fields td { padding: 3px 4px; vertical-align: top; }
  table.fields td.label { color: #666; width: 140px; font-size: 9pt; text-transform: uppercase;
                           letter-spacing: 0.04em; white-space: nowrap; }
  table.data { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4px; }
  table.data th { background: #f1f5f9; padding: 4px 6px; text-align: left; font-size: 9pt;
                  font-weight: 600; border: 1px solid #e2e8f0; }
  table.data td { padding: 4px 6px; border: 1px solid #e2e8f0; vertical-align: top; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
  .pre { white-space: pre-wrap; font-size: 10pt; }
  .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px;
            font-size: 8pt; color: #aaa; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 0; }
    @page { margin: 14mm 12mm; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div style="font-size:9pt;color:#555;margin-bottom:3px;">University of Windsor — Facilities</div>
    <h1>Work Order #${wo.workOrderNumber}</h1>
  </div>
  <div class="meta">
    <span class="badge ${wo.status?.toUpperCase() === 'CLOSE' ? 'badge-close' : 'badge-open'}">${fmt(wo.status)}</span><br>
    Printed: ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">Location</div>
    <table class="fields">
      ${row('Building', `${fmt(wo.buildingName)} (${fmt(wo.buildingCode)})`)}
      ${row('Room', fmt(wo.roomNumber))}
    </table>
  </div>
  <div class="section">
    <div class="section-title">Work Details</div>
    <table class="fields">
      ${row('Equipment', fmt(wo.equipmentRaw))}
      ${row('Craft', fmt(wo.craft))}
      ${row('Priority', fmt(wo.priority))}
      ${row('Requester', fmt(wo.requester))}
    </table>
  </div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">Dates</div>
    <table class="fields">
      ${row('Open Date', fmt(wo.openDate))}
      ${row('Complete Date', fmt(wo.completeDate))}
    </table>
  </div>
  <div class="section">
    <div class="section-title">Actuals</div>
    <table class="fields">
      ${row('Hours', fmt(wo.actualHours))}
      ${row('Labour Cost', wo.actualLabourCost ? '$' + wo.actualLabourCost.toFixed(2) : '—')}
      ${row('Total Cost', wo.actualTotalCost ? '$' + wo.actualTotalCost.toFixed(2) : '—')}
    </table>
  </div>
</div>

${wo.requestDescription ? `
<div class="section">
  <div class="section-title">Request Description</div>
  <p class="pre">${wo.requestDescription.replace(/</g, '&lt;')}</p>
</div>` : ''}

${wo.completionRemark ? `
<div class="section">
  <div class="section-title">Completion Remark</div>
  <p class="pre">${wo.completionRemark.replace(/</g, '&lt;')}</p>
</div>` : ''}

${wo.technicianNotes ? `
<div class="section">
  <div class="section-title">Technician Notes</div>
  <p class="pre">${wo.technicianNotes.replace(/</g, '&lt;')}</p>
</div>` : ''}

${(wo.technicians ?? []).length > 0 ? `
<div class="section">
  <div class="section-title">Labour</div>
  <table class="data">
    <thead><tr><th>Employee #</th><th>Craft</th><th>Hours</th><th>Total Cost</th></tr></thead>
    <tbody>${techRows}</tbody>
  </table>
</div>` : ''}

${(wo.annotations ?? []).length > 0 ? `
<div class="section">
  <div class="section-title">Annotations</div>
  <table class="data">
    <thead><tr><th>Author</th><th>Date</th><th>Note</th></tr></thead>
    <tbody>${annotRows}</tbody>
  </table>
</div>` : ''}

<div class="footer">
  <span>WayFinder — University of Windsor Facilities</span>
  <span>WO #${wo.workOrderNumber} &mdash; source: ${wo.source ?? 'manual'}</span>
</div>

</body>
</html>`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('');
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const isClose = status.toUpperCase() === 'CLOSE';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
        isClose ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export const WorkOrderDetail: React.FC<Props> = ({ canEdit }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [annotationText, setAnnotationText] = useState('');
  const [annotationAuthor, setAnnotationAuthor] = useState('');
  const [submittingAnnotation, setSubmittingAnnotation] = useState(false);
  const [pdfScale, setPdfScale] = useState(1.2);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Completion chat
  const [showChatModal, setShowChatModal] = useState(false);
  const [showPassOnModal, setShowPassOnModal] = useState(false);
  const [approvingWO, setApprovingWO] = useState(false);
  // Assignment
  const [assigningStaff, setAssigningStaff] = useState(false);

  // Fetch WO + staff on mount
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getWorkOrder(id), api.getStaff()])
      .then(([woData, staffData]) => {
        setWo(woData);
        setCurrentPage(woData.pageNumber > 0 ? woData.pageNumber : 1);
        setStaff(staffData);
        if (staffData.length > 0) setAnnotationAuthor(staffData[0].id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load work order'))
      .finally(() => setLoading(false));
  }, [id]);

  // Render PDF page
  useEffect(() => {
    if (!wo?.pdfUrl || !canvasRef.current) return;

    let cancelled = false;

    const renderPage = async () => {
      setPdfLoading(true);
      try {
        // Cancel any in-progress render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const pdf = await pdfjsLib.getDocument(wo.pdfUrl!).promise;
        const page = await pdf.getPage(Math.min(currentPage, pdf.numPages));
        const viewport = page.getViewport({ scale: pdfScale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const task = page.render({ canvasContext: ctx, canvas, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: unknown) {
        // RenderingCancelledException is expected when we cancel
        if (
          cancelled ||
          (err instanceof Error && err.name === 'RenderingCancelledException')
        ) {
          return;
        }
        console.error('PDF render error:', err);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [wo?.pdfUrl, currentPage, pdfScale]);

  const handleSubmitAnnotation = async () => {
    if (!wo || !annotationText.trim()) return;
    setSubmittingAnnotation(true);
    try {
      const selectedStaff = staff.find(s => s.id === annotationAuthor);
      const authorName = selectedStaff?.name ?? annotationAuthor;
      const annotation = await api.addWorkOrderAnnotation(wo.id, authorName, annotationText.trim(), annotationAuthor || undefined);
      setWo(prev =>
        prev
          ? {
              ...prev,
              annotations: [annotation, ...(prev.annotations ?? [])],
            }
          : prev
      );
      setAnnotationText('');
    } catch (err) {
      console.error('Failed to add annotation:', err);
    } finally {
      setSubmittingAnnotation(false);
    }
  };


  const handleChatComplete = async (fields: {
    completionDate: string;
    hours: number | null;
    collaborators: string[];
    collaboratorStaffIds: string[];
    completionRemark: string;
    rawTranscript: string;
  }) => {
    if (!wo) return;

    // Build completedBy: assignee first, then fuzzy-matched collaborators from CompletionChat
    const byIds: string[] = [];
    const byNames: string[] = [];

    if (wo.assignedToStaffId) byIds.push(wo.assignedToStaffId);
    if (wo.assignedToName)    byNames.push(wo.assignedToName);

    for (let i = 0; i < fields.collaborators.length; i++) {
      const id   = fields.collaboratorStaffIds[i];
      const name = fields.collaborators[i];
      if (id && !byIds.includes(id))          { byIds.push(id); byNames.push(name); }
      else if (!id && !byNames.includes(name)) byNames.push(name);
    }

    const updated = await api.submitWorkOrderCompletion(wo.id, {
      completedAt: fields.completionDate,
      completionHours: fields.hours,
      staffIds: byIds,
      staffNames: byNames,
      technicianNotes: '',
      rawTranscript: fields.rawTranscript,
      completionRemark: fields.completionRemark,
    });
    setWo(updated);
    setShowChatModal(false);
  };

  const handleAssign = async (staffId: string, staffName: string) => {
    if (!wo) return;
    setAssigningStaff(true);
    try {
      const updated = await api.updateWorkOrder(wo.id, {
        ...wo,
        assignedToStaffId: staffId || null,
        assignedToName: staffName || null,
      });
      setWo(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setAssigningStaff(false);
    }
  };

  const handleApprove = async () => {
    if (!wo) return;
    setApprovingWO(true);
    try {
      const updated = await api.approveWorkOrder(wo.id);
      setWo(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setApprovingWO(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !wo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-600 font-medium">{error ?? 'Work order not found'}</p>
        <button
          onClick={() => navigate('/work-orders')}
          className="text-sm text-indigo-600 hover:underline"
        >
          Back to Work Orders
        </button>
      </div>
    );
  }

  const annotations: WorkOrderAnnotation[] = [...(wo.annotations ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-6 pb-16">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Work Order #{wo.workOrderNumber}
            </h1>
            <StatusBadge status={wo.status} />
          </div>
          {wo.buildingName && (
            <p className="text-sm text-slate-500 mt-0.5">{wo.buildingName}</p>
          )}
        </div>
        <button
          onClick={() => {
            const printWin = window.open('', '_blank', 'width=900,height=700');
            if (!printWin) return;
            printWin.document.write(buildPrintHTML(wo));
            printWin.document.close();
            printWin.focus();
            printWin.print();
          }}
          title="Print work order"
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          <Printer size={15} />
          Print
        </button>
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left – PDF viewer */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <FileText size={15} className="text-slate-400" />
              PDF Document
            </div>
            {wo.pdfUrl && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Page navigation — only shown for multi-page WOs */}
                {wo.pageCount > 1 && (
                  <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(wo.pageNumber, p - 1))}
                      disabled={currentPage <= wo.pageNumber}
                      title="Previous page"
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-slate-500 tabular-nums w-16 text-center">
                      p.{currentPage} / {wo.pageNumber + wo.pageCount - 1}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(wo.pageNumber + wo.pageCount - 1, p + 1))}
                      disabled={currentPage >= wo.pageNumber + wo.pageCount - 1}
                      title="Next page"
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
                {/* Zoom controls */}
                <button
                  onClick={() => setPdfScale(s => Math.max(0.5, s - 0.2))}
                  disabled={pdfScale <= 0.5}
                  title="Zoom out"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-40 transition-colors"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-xs text-slate-400 w-12 text-center">
                  {Math.round(pdfScale * 100)}%
                </span>
                <button
                  onClick={() => setPdfScale(s => Math.min(3.0, s + 0.2))}
                  disabled={pdfScale >= 3.0}
                  title="Zoom in"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-40 transition-colors"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            )}
          </div>

          <div className="overflow-auto max-h-[640px] p-2 sm:p-4 bg-slate-100">
            {!wo.pdfUrl ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <FileText size={40} strokeWidth={1.2} />
                <p className="text-sm">PDF not available</p>
              </div>
            ) : (
              <div className="relative">
                {pdfLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100/60 z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
                  </div>
                )}
                <canvas ref={canvasRef} className="shadow-md mx-auto block" />
              </div>
            )}
          </div>
        </div>

        {/* Right – Detail fields */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6 space-y-6">
          {/* Location */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 uppercase tracking-wide">
              <Building2 size={14} />
              Location
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1">
              <InfoRow label="Building">
                {wo.buildingCode ? (
                  <Link
                    to={`/building/${wo.buildingCode}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {wo.buildingName ?? wo.buildingCode}
                  </Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </InfoRow>
              <InfoRow label="Room">
                {wo.roomNumber ?? <span className="text-slate-400">—</span>}
              </InfoRow>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Equipment */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 uppercase tracking-wide">
              <Wrench size={14} />
              Equipment
            </div>
            <div className="pl-1">
              <InfoRow label="Equipment">
                {wo.equipmentId ? (
                  <Link
                    to={`/equipment/${wo.equipmentId}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {wo.equipmentRaw ?? wo.equipmentId}
                  </Link>
                ) : (
                  <span>{wo.equipmentRaw ?? <span className="text-slate-400">—</span>}</span>
                )}
              </InfoRow>
            </div>
          </div>

          {/* Request description */}
          {wo.requestDescription && (
            <>
              <hr className="border-slate-100" />
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Request</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed pl-1">
                  {wo.requestDescription}
                </p>
              </div>
            </>
          )}

          <hr className="border-slate-100" />

          {/* Dates */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 uppercase tracking-wide">
              <Calendar size={14} />
              Dates
            </div>
            <div className="flex items-center gap-3 pl-1 text-sm">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Open</p>
                <p className="text-slate-800">{wo.openDate ?? <span className="text-slate-400">—</span>}</p>
              </div>
              <span className="text-slate-300 text-base">→</span>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Complete</p>
                <p className="text-slate-800">{wo.completeDate ?? <span className="text-slate-400">—</span>}</p>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Actuals */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 uppercase tracking-wide">
              <DollarSign size={14} />
              Actuals
            </div>
            <div className="flex flex-wrap gap-2 pl-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-sm text-slate-700">
                <Clock size={12} className="text-slate-400" />
                {wo.actualHours} hrs
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-sm text-slate-700">
                <DollarSign size={12} className="text-slate-400" />
                {wo.actualLabourCost.toFixed(2)} labour
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-sm font-medium text-slate-700">
                <DollarSign size={12} className="text-slate-400" />
                {wo.actualTotalCost.toFixed(2)} total
              </span>
            </div>
          </div>

          {/* Craft + Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1">
            <InfoRow label="Craft">
              {wo.craft ?? <span className="text-slate-400">—</span>}
            </InfoRow>
            <InfoRow label="Priority">
              {wo.priority ?? <span className="text-slate-400">—</span>}
            </InfoRow>
          </div>

          {/* Requester */}
          {wo.requester && (
            <div className="pl-1">
              <InfoRow label="Requester">
                <div className="flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  {wo.requester}
                </div>
              </InfoRow>
            </div>
          )}

          {/* Technicians table */}
          {wo.technicians && wo.technicians.length > 0 && (
            <>
              <hr className="border-slate-100" />
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Technicians</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="pb-1 font-medium">Employee #</th>
                      <th className="pb-1 font-medium">Craft</th>
                      <th className="pb-1 font-medium text-right">Hrs</th>
                      <th className="pb-1 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {wo.technicians.map(t => (
                      <tr key={t.id}>
                        <td className="py-1 font-mono text-slate-700">{t.employeeNumber ?? '—'}</td>
                        <td className="py-1 text-slate-600">{t.craft ?? '—'}</td>
                        <td className="py-1 text-right text-slate-600">{t.hours ?? '—'}</td>
                        <td className="py-1 text-right text-slate-600">
                          {t.totalCost != null ? `$${t.totalCost.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Technician notes */}
          {wo.technicianNotes && (
            <div className="pl-1">
              <InfoRow label="Completion Remarks">
                <p className="whitespace-pre-wrap leading-relaxed text-slate-700 mt-1">
                  {wo.technicianNotes}
                </p>
              </InfoRow>
            </div>
          )}

          {/* Completion remark */}
          {wo.completionRemark && (
            <div className="pl-1">
              <InfoRow label="Completion Remark">
                <p className="italic text-slate-600 mt-0.5">{wo.completionRemark}</p>
              </InfoRow>
            </div>
          )}
        </div>
      </div>

      {/* ── Approval banner (manager view when PENDING_REVIEW) ───────────────── */}
      {wo.status === 'PENDING_REVIEW' && (
        <div className="bg-white border border-emerald-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-base font-semibold text-emerald-800">
              <ClipboardCheck size={18} className="text-emerald-600" />
              Pending Manager Approval
            </div>
            <button
              onClick={handleApprove}
              disabled={approvingWO}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {approvingWO ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Approve & Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Completed by</p>
              <p className="font-medium text-slate-800">{wo.completedByNames ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Completed on</p>
              <p className="font-medium text-slate-800">{wo.completedAt ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Hours</p>
              <p className="font-medium text-slate-800">{wo.completionHours ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Remark</p>
              <p className="font-medium text-slate-800">{wo.completionRemark || '—'}</p>
            </div>
          </div>
          {wo.technicianNotes && (
            <div className="bg-slate-50 rounded-md px-4 py-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Technician notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{wo.technicianNotes}</p>
            </div>
          )}
          {wo.rawTranscript && wo.rawTranscript !== wo.technicianNotes && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-600 select-none">View raw voice transcript</summary>
              <p className="mt-1 pl-2 italic leading-relaxed">{wo.rawTranscript}</p>
            </details>
          )}
        </div>
      )}

      {/* ── Assignment + Mark as Complete ────────────────────────────────────── */}
      {wo.status !== 'CLOSE' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          {/* Assignment row */}
          {canEdit && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <User size={14} className="text-slate-400" />
                Assigned to:
                {wo.assignedToName
                  ? <span className="text-indigo-700 font-semibold">{wo.assignedToName}</span>
                  : <span className="text-slate-400 font-normal italic">Unassigned</span>}
                {assigningStaff && <Loader2 size={12} className="animate-spin text-slate-400" />}
              </div>
              <select
                value={wo.assignedToStaffId ?? ''}
                onChange={e => {
                  const s = staff.find(x => x.id === e.target.value);
                  handleAssign(e.target.value, s?.name ?? '');
                }}
                className="w-full sm:w-auto text-sm border border-slate-200 rounded-lg px-3 py-2 min-h-11 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
              >
                <option value="">— Unassigned —</option>
                {staff.filter(s => s.active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.craft ? ` (${s.craft})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Mark complete button */}
          {wo.status !== 'PENDING_REVIEW' && (
            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${canEdit ? 'border-t border-slate-100 pt-4' : ''}`}>
              <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <CheckCircle2 size={16} className="text-slate-400" />
                Mark as Complete
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowPassOnModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 rounded-md border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors"
                >
                  <ArrowRight size={14} />
                  Pass On
                </button>
                <button
                  onClick={() => setShowChatModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Mic size={14} />
                  Log Completion
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CompletionChat modal */}
      {showChatModal && wo && (
        <CompletionChat
          wo={wo}
          staffList={staff}
          onComplete={handleChatComplete}
          onClose={() => setShowChatModal(false)}
        />
      )}

      {/* Pass On modal */}
      {showPassOnModal && wo && (
        <PassOnModal
          wo={wo}
          currentStaff={wo.assignedToStaffId ? staff.find(s => s.id === wo.assignedToStaffId) ?? null : null}
          onDone={updated => { setWo(updated); setShowPassOnModal(false); }}
          onClose={() => setShowPassOnModal(false)}
        />
      )}

      {/* Annotation thread */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <MessageSquare size={16} className="text-slate-400" />
          Notes &amp; Annotations
        </div>

        {/* Existing annotations */}
        {annotations.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <div className="space-y-4">
            {annotations.map(ann => (
              <div key={ann.id} className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                  {initials(ann.authorName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{ann.authorName}</span>
                    <span className="text-xs text-slate-400">{relativeTime(ann.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">{ann.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add annotation form */}
        {canEdit && (
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <p className="text-sm font-medium text-slate-600">Add a note</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-40 shrink-0">
                <select
                  value={annotationAuthor}
                  onChange={e => setAnnotationAuthor(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {staff.length === 0 && (
                    <option value="">No staff</option>
                  )}
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={3}
                  value={annotationText}
                  onChange={e => setAnnotationText(e.target.value)}
                  placeholder="Write a note…"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={handleSubmitAnnotation}
                  disabled={!annotationText.trim() || submittingAnnotation || !annotationAuthor}
                  className="self-stretch sm:self-end inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingAnnotation ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
