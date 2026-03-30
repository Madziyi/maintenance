/**
 * EndOfDay — cycles through a staff member's assigned open work orders,
 * opening CompletionChat for each one in sequence.
 */
import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, ChevronRight, User, Mic } from 'lucide-react';
import { api } from '../../../api';
import type { WorkOrder, Staff } from '../../../types';
import { CompletionChat } from './CompletionChat';
import { PassOnModal } from './PassOnModal';

interface Props {
  staffList: Staff[];
  onClose: () => void;
  onWorkOrderCompleted?: (woId: string) => void;
  /** Pre-selected staff — skips the "who are you?" step */
  initialStaff?: Staff | null;
  /** Pre-loaded work order queue — skips the loading step */
  initialQueue?: WorkOrder[];
}

type Step = 'pick-staff' | 'loading' | 'queue' | 'completing' | 'done';

export const EndOfDay: React.FC<Props> = ({ staffList, onClose, onWorkOrderCompleted, initialStaff, initialQueue }) => {
  const preloaded = !!(initialStaff && initialQueue);
  const [step, setStep] = useState<Step>(() => {
    if (preloaded) return initialQueue!.length > 0 ? 'queue' : 'done';
    return 'pick-staff';
  });
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(initialStaff ?? null);
  const [queue, setQueue] = useState<WorkOrder[]>(initialQueue ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]); // WO ids
  const [skipped, setSkipped] = useState<string[]>([]);
  const [passedOn, setPassedOn] = useState<string[]>([]);
  const [showPassOn, setShowPassOn] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeStaff = staffList.filter(s => s.active);

  // ── Load assigned open WOs for selected staff ──
  useEffect(() => {
    if (!selectedStaff || preloaded) return;
    setStep('loading');
    setLoadError(null);
    api.getWorkOrders({
      assignedTo: selectedStaff.id,
      status: 'OPEN',
      limit: 50,
      sortBy: 'openDate',
      sortDir: 'asc',
    })
      .then(r => {
        setQueue(r.items);
        setStep(r.items.length > 0 ? 'queue' : 'done');
      })
      .catch(e => {
        setLoadError(e.message);
        setStep('pick-staff');
      });
  }, [selectedStaff]);

  const currentWO = queue[currentIdx] ?? null;
  const progress = completed.length + skipped.length + passedOn.length;
  const total = queue.length;

  const handleComplete = async (fields: {
    completionDate: string;
    hours: number | null;
    collaborators: string[];
    completionRemark: string;
    rawTranscript: string;
  }) => {
    if (!currentWO || !selectedStaff) return;

    await api.submitWorkOrderCompletion(currentWO.id, {
      completedAt: fields.completionDate,
      completionHours: fields.hours,
      staffIds: [selectedStaff.id],
      staffNames: [selectedStaff.name, ...fields.collaborators],
      rawTranscript: fields.rawTranscript,
      completionRemark: fields.completionRemark,
      technicianNotes: '',
    });

    setCompleted(prev => [...prev, currentWO.id]);
    onWorkOrderCompleted?.(currentWO.id);
    advance();
  };

  const handleSkip = () => {
    if (!currentWO) return;
    setSkipped(prev => [...prev, currentWO.id]);
    advance();
  };

  const handlePassOn = () => setShowPassOn(true);

  const handlePassOnDone = () => {
    if (!currentWO) return;
    setPassedOn(prev => [...prev, currentWO.id]);
    setShowPassOn(false);
    advance();
  };

  const advance = () => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= queue.length) {
      setStep('done');
    } else {
      setCurrentIdx(nextIdx);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Pick Staff
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'pick-staff') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Mic size={16} className="text-indigo-500" /> End of Day
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4">
            <p className="text-sm text-slate-500 mb-4">Who are you? Select your name to see your open work orders.</p>

            {loadError && (
              <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{loadError}</p>
            )}

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {activeStaff.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStaff(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <User size={14} className="text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-700">{s.name}</p>
                    {s.craft && <p className="text-xs text-slate-400">{s.craft}</p>}
                  </div>
                  <ChevronRight size={14} className="ml-auto text-slate-300 group-hover:text-indigo-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Loading
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
          <p className="text-sm text-slate-500">Loading {selectedStaff?.name}'s work orders…</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Queue overview
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'queue') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">End of Day</h2>
              <p className="text-xs text-slate-400">{selectedStaff?.name} · {queue.length} open WO{queue.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-2 max-h-80 overflow-y-auto">
            {queue.map((wo, i) => (
              <div key={wo.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                  i === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}>{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-slate-500">#{wo.workOrderNumber}</p>
                  <p className="text-sm text-slate-700 truncate">{wo.requestDescription || wo.equipmentRaw || 'Work Order'}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 pb-5">
            <button
              onClick={() => setStep('completing')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow"
            >
              <Mic size={15} /> Start End of Day
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Completing — show CompletionChat for current WO
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'completing' && currentWO) {
    return (
      <>
        {/* Progress bar overlay at top */}
        <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-slate-200">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
          />
        </div>
        <div className="fixed top-1 left-1/2 -translate-x-1/2 z-[60] bg-white/90 backdrop-blur-sm text-xs text-slate-500 px-3 py-1 rounded-full shadow-sm border border-slate-100">
          {progress} / {total} done
        </div>

        <CompletionChat
          key={currentWO.id}
          wo={currentWO}
          staffList={staffList}
          onComplete={handleComplete}
          onClose={onClose}
          endOfDayMode
          onSkip={handleSkip}
          onPassOn={handlePassOn}
        />

        {showPassOn && (
          <PassOnModal
            wo={currentWO}
            currentStaff={selectedStaff}
            onDone={handlePassOnDone}
            onClose={() => setShowPassOn(false)}
          />
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Done
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center px-8 py-10">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-emerald-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          {queue.length === 0 ? 'No open work orders!' : 'End of Day Complete'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {queue.length === 0
            ? `${selectedStaff?.name} has no open assigned work orders.`
            : [
                `${completed.length} completed`,
                skipped.length ? `${skipped.length} skipped` : '',
                passedOn.length ? `${passedOn.length} passed on` : '',
              ].filter(Boolean).join(' · ')}
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
