/**
 * PassOnModal — shift handoff for a work order.
 *
 * Two paths:
 *  1. Hold mic → live transcript shows in real-time → AI cleans → editable preview → pass on
 *  2. Quick button "It's urgent but I couldn't get to it today" → instant pass-on
 */
import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle2, ArrowRightLeft } from 'lucide-react';
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
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
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
    setLiveTranscript('');
    setIsRecording(false);
    setNote(cleaned);
  };

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    submit(note.trim(), 'end_of_day');
  };

  const handleQuick = () => {
    submit("It's urgent but I couldn't get to it today.", 'urgent_incomplete');
  };

  // What to show in the preview box
  const previewText = isRecording
    ? liveTranscript
    : note;

  const previewPlaceholder = isRecording
    ? 'Listening…'
    : 'Hold the mic to leave a note for the next person.';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ArrowRightLeft size={15} className="text-amber-500" /> Pass On Work Order
            </h2>
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
          <div className="px-5 py-5 space-y-4">

            {/* WO description */}
            <p className="text-sm text-slate-500 line-clamp-2">
              {wo.requestDescription || wo.equipmentRaw || 'Work order'}
            </p>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={13} /> {error}
              </div>
            )}

            {/* Note preview — always visible */}
            <div className={`rounded-xl border transition-colors ${
              isRecording
                ? 'border-indigo-300 bg-indigo-50'
                : note
                ? 'border-slate-200 bg-white'
                : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                  {isRecording ? '● Recording' : note ? 'Handoff note' : 'Handoff note'}
                </p>
                {note && !isRecording && (
                  <p className="text-[10px] text-slate-400">tap to edit</p>
                )}
              </div>
              <textarea
                value={isRecording ? liveTranscript : note}
                onChange={e => { if (!isRecording) setNote(e.target.value); }}
                readOnly={isRecording}
                rows={3}
                placeholder={previewPlaceholder}
                className={`w-full text-sm px-3 pb-3 bg-transparent resize-none focus:outline-none leading-relaxed ${
                  isRecording
                    ? 'text-indigo-700 italic placeholder:text-indigo-400'
                    : note
                    ? 'text-slate-800'
                    : 'text-slate-400 placeholder:text-slate-300'
                }`}
              />
            </div>

            {/* Solid mic action card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
              <div className="grid grid-cols-3 items-center gap-2">

                {/* Left — status label */}
                <div className="flex justify-center">
                  <p className="text-xs text-slate-400 text-center leading-tight">
                    {isRecording
                      ? <span className="text-indigo-500 animate-pulse font-medium">● Recording</span>
                      : note
                      ? <span className="text-emerald-600 font-medium">Note ready</span>
                      : <span>Hold to<br/>speak</span>}
                  </p>
                </div>

                {/* Centre — Mic */}
                <div className="flex justify-center">
                  <PushToTalkMic
                    size="lg"
                    autoClean
                    onTranscript={handleVoiceNote}
                    onLiveTranscript={setLiveTranscript}
                    onRecordStart={() => {
                      setIsRecording(true);
                      setLiveTranscript('');
                      setNote('');
                    }}
                    onRecordEnd={() => setIsRecording(false)}
                    disabled={submitting}
                  />
                </div>

                {/* Right — Pass On button (once note is ready) */}
                <div className="flex justify-center">
                  {note && !isRecording ? (
                    <button
                      onClick={handleSubmitNote}
                      disabled={submitting || !note.trim()}
                      className="w-full py-3 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {submitting
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ArrowRightLeft size={14} />}
                      {submitting ? 'Sending…' : 'Send'}
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-slate-100" />
              <span className="text-xs text-slate-400">or</span>
              <div className="flex-1 border-t border-slate-100" />
            </div>

            {/* Quick urgent button */}
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
