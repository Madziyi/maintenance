/**
 * PassOnModal — shift handoff for a work order.
 *
 * Two paths:
 *  1. Hold mic → speak handoff note → AI cleans → post as annotation + call pass-on API
 *  2. Quick button "It's urgent but I couldn't get to it today" → instant pass-on
 */
import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { PushToTalkMic } from '../common/PushToTalkMic';
import { api } from '../../../api';
import type { WorkOrder, Staff } from '../../../types';

interface Props {
  wo: WorkOrder;
  currentStaff?: Staff | null;
  onDone: (updated: WorkOrder) => void;
  onClose: () => void;
}

export const PassOnModal: React.FC<Props> = ({ wo, currentStaff, onDone, onClose }) => {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (handoffNote: string, reason: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.passOnWorkOrder(wo.id, {
        fromStaffId: currentStaff?.id,
        fromStaffName: currentStaff?.name,
        reason,
        handoffNote: handoffNote || undefined,
      });
      setDone(true);
      setTimeout(() => onDone(updated), 1200);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const handleVoiceNote = (cleaned: string) => {
    setNote(cleaned);
  };

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    submit(note.trim(), 'end_of_day');
  };

  const handleQuick = () => {
    submit("It's urgent but I couldn't get to it today.", 'urgent_incomplete');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pass On Work Order</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">WO #{wo.workOrderNumber}</p>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-10 px-5">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="text-sm font-medium text-slate-700">Passed on — manager notified</p>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5">

            {/* WO summary */}
            <p className="text-sm text-slate-600 line-clamp-2">
              {wo.requestDescription || wo.equipmentRaw || 'Work order'}
            </p>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={13} /> {error}
              </div>
            )}

            {/* Option 1 — Voice note */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Leave a handoff note
              </p>
              <div className="flex items-center gap-3">
                <PushToTalkMic
                  size="md"
                  autoClean
                  onTranscript={handleVoiceNote}
                  disabled={submitting}
                />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hold the mic and tell the next person what you found and what still needs doing.
                </p>
              </div>

              {note && (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={handleSubmitNote}
                    disabled={submitting || !note.trim()}
                    className="w-full py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                  >
                    {submitting
                      ? <><Loader2 size={14} className="animate-spin" /> Passing on…</>
                      : 'Pass On with Note'}
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-slate-100" />
              <span className="text-xs text-slate-400">or</span>
              <div className="flex-1 border-t border-slate-100" />
            </div>

            {/* Option 2 — Quick button */}
            <button
              onClick={handleQuick}
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium flex items-center gap-3 transition-colors disabled:opacity-50"
            >
              {submitting
                ? <Loader2 size={16} className="animate-spin shrink-0" />
                : <AlertTriangle size={16} className="shrink-0 text-amber-500" />}
              <span className="text-left">It's urgent but I couldn't get to it today</span>
            </button>

          </div>
        )}
      </div>
    </div>
  );
};
