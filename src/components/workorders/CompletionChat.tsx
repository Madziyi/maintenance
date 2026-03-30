/**
 * CompletionChat — real-time push-to-talk completion session.
 *
 * Hold the mic button to speak; release to send. AI responds, user holds
 * again to reply. Fully push-to-talk — no silence detection.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send, X, CheckCircle2, Loader2,
  Calendar, Clock, Users, FileText, Volume2, VolumeX,
  ChevronRight, RotateCcw, ArrowRightLeft,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { PushToTalkMic } from '../common/PushToTalkMic';
import { api } from '../../../api';
import type { WorkOrder, Staff } from '../../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollaboratorMatch {
  spokenName: string;    // what Gemini extracted
  resolvedName: string;  // matched staff.name
  staffId: string;       // matched staff.id
}

interface Extracted {
  completionDate: string | null;
  hours: number | null;
  collaborators: string[];             // raw names from Gemini (used in AI history)
  collaboratorMatches: CollaboratorMatch[]; // fuzzy-resolved staff-only matches
  completionRemark: string | null;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

type Phase = 'thinking' | 'speaking' | 'idle' | 'done';

interface Props {
  wo: WorkOrder;
  staffList: Staff[];
  onComplete: (fields: {
    completionDate: string;
    hours: number | null;
    collaborators: string[];
    collaboratorStaffIds: string[];
    completionRemark: string;
    rawTranscript: string;
  }) => Promise<void>;
  onClose: () => void;
  /** If true, shows "Skip" and "Pass On" buttons flanking the mic */
  endOfDayMode?: boolean;
  onSkip?: () => void;
  onPassOn?: () => void;
}

// ─── Speech helpers ───────────────────────────────────────────────────────────

// Preferred voice names in priority order — Google neural voices sound closest to natural
const PREFERRED_VOICES = [
  'Google US English',
  'Google UK English Female',
  'Google UK English Male',
  'Samantha',           // macOS natural voice
  'Karen',              // macOS AU
  'Daniel',             // macOS UK
  'Microsoft Aria Online (Natural)',
  'Microsoft Jenny Online (Natural)',
  'Microsoft Guy Online (Natural)',
  'Microsoft Zira',
];

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en') && !v.default) ?? voices[0] ?? null;
}

function speak(text: string, onEnd?: () => void, muted = false): SpeechSynthesisUtterance | null {
  if (muted || typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return null;
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 1.0;
  utt.pitch = 1.0;
  utt.volume = 1.0;

  const doSpeak = () => {
    const voice = pickVoice();
    if (voice) utt.voice = voice;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
  }
  return utt;
}

// ─── Collaborator fuzzy matching ──────────────────────────────────────────────
// Tighter threshold (0.35) than general search — name false-positives are costly.
// Returns only confirmed staff matches; unmatched names stay in the remark text.
function matchCollaborators(
  names: string[],
  staffList: Staff[],
): CollaboratorMatch[] {
  if (!names.length || !staffList.length) return [];
  const fuse = new Fuse(staffList, { keys: ['name'], threshold: 0.35, includeScore: true });
  const seen = new Set<string>();
  const matches: CollaboratorMatch[] = [];
  for (const name of names) {
    const hit = fuse.search(name)[0];
    if (!hit || (hit.score ?? 1) > 0.35) continue; // no confident match
    const staff = hit.item;
    if (seen.has(staff.id)) continue; // dedupe
    seen.add(staff.id);
    matches.push({ spokenName: name, resolvedName: staff.name, staffId: staff.id });
  }
  return matches;
}

// Strip leaked raw JSON — handles both full JSON and truncated/malformed Gemini output
function safeReply(text: string): string {
  const t = text.trim();
  if (t.startsWith('{')) {
    try { return (JSON.parse(t) as any).reply || t; } catch {
      const m = t.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
  }
  return t;
}

// ─── Extracted field card ─────────────────────────────────────────────────────

function FieldCard({
  icon: Icon, label, value, colour,
}: {
  icon: React.ElementType; label: string; value: string | null; colour: string;
}) {
  const filled = value !== null && value !== '' && !(Array.isArray(value) && (value as any).length === 0);
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 border transition-all duration-300 ${
      filled ? `${colour} shadow-sm` : 'bg-slate-50 border-slate-100'
    }`}>
      <Icon size={14} className={filled ? 'mt-0.5 shrink-0' : 'mt-0.5 shrink-0 text-slate-300'} />
      <div className="min-w-0">
        <p className={`text-xs font-medium ${filled ? '' : 'text-slate-400'}`}>{label}</p>
        <p className={`text-xs mt-0.5 truncate ${filled ? 'font-semibold' : 'text-slate-300 italic'}`}>
          {value ?? 'Not captured yet'}
        </p>
      </div>
    </div>
  );
}

type EditField = 'date' | 'hours' | 'with' | 'remark' | null;

// ─── Main component ───────────────────────────────────────────────────────────

export const CompletionChat: React.FC<Props> = ({
  wo, staffList, onComplete, onClose, endOfDayMode = false, onSkip, onPassOn,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const geminiHistory = useRef<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);

  const activeStaffList = useMemo(() => staffList.filter(s => s.active), [staffList]);

  const [extracted, setExtracted] = useState<Extracted>({
    completionDate: null, hours: null, collaborators: [], collaboratorMatches: [], completionRemark: null,
  });

  const [phase, setPhase] = useState<Phase>('idle');
  const [textInput, setTextInput] = useState('');
  const [textMode, setTextMode] = useState(false);
  const [muted, setMuted] = useState(true); // voice off by default
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allTranscript, setAllTranscript] = useState('');
  const [liveRawTranscript, setLiveRawTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [editField, setEditField] = useState<EditField>(null);
  const [remarkDraft, setRemarkDraft] = useState<string>('');
  const [hoursDraft, setHoursDraft] = useState<string>('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffFilter, setStaffFilter] = useState('');
  const [manualLock, setManualLock] = useState({
    completionDate: false,
    hours: false,
    collaborators: false,
    completionRemark: false,
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll chat to bottom (messages + live transcript) ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveRawTranscript, isRecording]);

  const toggleStaffId = useCallback((id: string) => {
    setSelectedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Send a turn to AI and get response ──
  const sendToAI = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    setPhase('thinking');

    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    geminiHistory.current = [
      ...geminiHistory.current,
      { role: 'user', parts: [{ text: userText }] },
    ];

    try {
      const result = await api.completionChat({
        messages: geminiHistory.current,
        extracted,
        woContext: {
          woNumber: wo.workOrderNumber,
          description: wo.requestDescription,
          buildingCode: wo.buildingCode,
          roomNumber: wo.roomNumber,
          equipmentRaw: wo.equipmentRaw,
        },
        staffNames: activeStaffList.map(s => s.name),
        todayDate: today,
      });

      const newCollaborators = !manualLock.collaborators && result.extracted.collaborators?.length
        ? result.extracted.collaborators
        : extracted.collaborators;
      const merged: Extracted = {
        completionDate: manualLock.completionDate ? extracted.completionDate : (result.extracted.completionDate ?? extracted.completionDate),
        hours: manualLock.hours ? extracted.hours : (result.extracted.hours ?? extracted.hours),
        collaborators: newCollaborators,
        collaboratorMatches: matchCollaborators(newCollaborators, activeStaffList),
        completionRemark: manualLock.completionRemark ? extracted.completionRemark : (result.extracted.completionRemark ?? extracted.completionRemark),
      };
      setExtracted(merged);

      const replyText = safeReply(result.reply);

      geminiHistory.current = [
        ...geminiHistory.current,
        { role: 'model', parts: [{ text: replyText }] },
      ];
      setMessages(prev => [...prev, { role: 'ai', text: replyText }]);

      if (result.nextStep === 'skip' && onSkip) {
        setPhase('idle');
        speak(replyText, () => { onSkip?.(); }, muted);
        return;
      }

      if (result.nextStep === 'done') {
        // No auto-submit — just speak and return to idle so the user can review/edit then submit.
        setPhase('speaking');
        speak(replyText, () => {
          setPhase('idle');
        }, muted);
        return;
      }

      // Continue — speak reply, then return to idle (user holds mic to reply)
      setPhase('speaking');
      speak(replyText, () => { setPhase('idle'); }, muted);

    } catch (e: any) {
      setError(e.message);
      setPhase('idle');
    }
  }, [extracted, wo, activeStaffList, today, muted, onSkip, manualLock]);

  // ── Opening greeting on mount ──
  useEffect(() => {
    const rawDesc = wo.requestDescription || wo.equipmentRaw || `work order ${wo.workOrderNumber}`;
    // Truncate long descriptions so TTS doesn't read a full paragraph
    const desc = rawDesc.length > 120 ? rawDesc.slice(0, 117).trimEnd() + '…' : rawDesc;
    const greeting = `What are your completion remarks for: ${desc}? Just tell me what happened — date, hours, who you worked with, and what you found.`;

    setMessages([{ role: 'ai', text: greeting }]);
    geminiHistory.current = []; // greeting is hardcoded UI only — not sent to Gemini

    setPhase('speaking');
    speak(greeting, () => { setPhase('idle'); }, muted);

    return () => { window.speechSynthesis?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit completion ──
  const handleSubmit = async (ext: Extracted = extracted) => {
    const date = ext.completionDate || today;
    let remark = ext.completionRemark || '';
    if (!remark) {
      sendToAI('(user attempted submit without completion remark — please ask for it)');
      return;
    }
    setSubmitting(true);
    setPhase('done');
    try {
      // Final-stage cleanup only (keeps the interactive chat fast).
      // Uses WO context to correct HVAC abbreviations/equipment naming where possible.
      try {
        const cleaned = await api.cleanTranscript(remark, {
          equipmentName: wo.equipmentRaw ?? undefined,
          buildingCode: wo.buildingCode ?? undefined,
          roomNumber: wo.roomNumber ?? undefined,
        });
        remark = cleaned.cleaned || remark;
      } catch {
        // Non-blocking: submit the remark as-is if cleanup fails.
      }

      await onComplete({
        completionDate: date,
        hours: ext.hours,
        collaborators: ext.collaboratorMatches.map(m => m.resolvedName),
        collaboratorStaffIds: ext.collaboratorMatches.map(m => m.staffId),
        completionRemark: remark,
        rawTranscript: allTranscript.trim(),
      });
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
      setPhase('idle');
    }
  };

  // ── Text mode send ──
  const handleTextSend = () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    sendToAI(text);
  };

  const allFilled = extracted.completionDate && extracted.hours !== null &&
    extracted.completionRemark;

  const fmtDate = (d: string | null) => {
    if (!d) return null;
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  const micDisabled = phase === 'thinking' || phase === 'speaking' || submitting || phase === 'done';

  const handleVoiceTranscript = useCallback((cleaned: string, raw: string) => {
    const rawText = raw.trim();
    if (rawText) {
      setAllTranscript(prev => (prev ? `${prev} ${rawText}` : rawText));
    }
    setLiveRawTranscript('');
    setIsRecording(false);
    sendToAI(cleaned);
  }, [sendToAI]);

  // Keep edit drafts in sync with extracted values when opening editors.
  useEffect(() => {
    if (editField === 'remark') setRemarkDraft(extracted.completionRemark || '');
    if (editField === 'hours') setHoursDraft(extracted.hours !== null ? String(extracted.hours) : '');
    if (editField === 'with') {
      setSelectedStaffIds(new Set(extracted.collaboratorMatches.map(m => m.staffId)));
      setStaffFilter('');
    }
  }, [editField, extracted]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] max-h-[100dvh] sm:h-[90vh] sm:max-h-[720px]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                WO #{wo.workOrderNumber}
              </span>
              {wo.buildingCode && (
                <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">
                  {wo.buildingCode}{wo.roomNumber ? ` · ${wo.roomNumber}` : ''}
                </span>
              )}
              {endOfDayMode && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
                  End of Day
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-800 mt-1 line-clamp-1">
              {wo.requestDescription || wo.equipmentRaw || 'Work Order'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMuted(m => !m)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title={muted ? 'Unmute AI voice' : 'Mute AI voice'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Extracted fields strip (fixed height — editors overlay chat below) ── */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" className="text-left" onClick={() => setEditField(f => f === 'date' ? null : 'date')}>
              <FieldCard icon={Calendar} label="Date" value={fmtDate(extracted.completionDate)}
                colour="bg-blue-50 border-blue-200 text-blue-700" />
            </button>
            <button type="button" className="text-left" onClick={() => setEditField(f => f === 'hours' ? null : 'hours')}>
              <FieldCard icon={Clock} label="Hours" value={extracted.hours !== null ? `${extracted.hours}h` : null}
                colour="bg-emerald-50 border-emerald-200 text-emerald-700" />
            </button>
            <button type="button" className="text-left" onClick={() => setEditField(f => f === 'with' ? null : 'with')}>
              <FieldCard icon={Users} label="With"
                value={extracted.collaboratorMatches.length ? extracted.collaboratorMatches.map(m => m.resolvedName).join(', ') : null}
                colour="bg-violet-50 border-violet-200 text-violet-700" />
            </button>
            <button type="button" className="text-left" onClick={() => setEditField(f => f === 'remark' ? null : 'remark')}>
              <FieldCard icon={FileText} label="Remark"
                value={extracted.completionRemark}
                colour="bg-amber-50 border-amber-200 text-amber-700" />
            </button>
          </div>
        </div>

        {/* ── Chat messages + field editor overlay (overlay sits on top of chat, does not expand header) ── */}
        <div className="flex-1 flex flex-col min-h-0 relative">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {phase === 'thinking' && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-100">
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Live transcript — appears as a pending user bubble while recording */}
          {isRecording && !textMode && (
            <div className="flex justify-end">
              <div className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed bg-indigo-400/70 text-white italic">
                {liveRawTranscript || 'Listening…'}
              </div>
            </div>
          )}

          {error && (
            <div className="text-center text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error} — <button className="underline" onClick={() => setError(null)}>dismiss</button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── Bottom controls (field editor overlay covers this + chat above) ── */}
        <div className="shrink-0 border-t border-slate-100 px-4 sm:px-5 pt-3 pb-4 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>

          {/* Status line */}
          <div className="flex items-center justify-center gap-2 h-5">
            {phase === 'thinking' ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Thinking…
              </span>
            ) : phase === 'speaking' ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-500">
                <Volume2 size={12} className="animate-pulse" /> Speaking…
              </span>
            ) : isRecording && !textMode ? (
              <span className="text-xs text-indigo-500 animate-pulse">● Recording — release to send</span>
            ) : phase === 'idle' && !textMode ? (
              <span className="text-xs text-slate-400">Hold mic to speak</span>
            ) : null}
          </div>

          {/* Voice action bar */}
          {!textMode && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
              <div className="grid grid-cols-3 items-center gap-2">

                {/* Left — Skip or Submit */}
                <div className="flex justify-center">
                  {endOfDayMode && onSkip ? (
                    <button
                      onClick={onSkip}
                      className="w-full py-3 text-sm text-slate-500 border border-slate-200 bg-white rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-1 font-medium"
                    >
                      <ChevronRight size={14} /> Skip
                    </button>
                  ) : allFilled ? (
                    <button
                      onClick={() => handleSubmit()}
                      disabled={submitting}
                      className="w-full py-3 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Submit
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

                {/* Centre — Mic */}
                <div className="flex justify-center">
                  <PushToTalkMic
                    size="lg"
                    autoClean={false}
                    onTranscript={handleVoiceTranscript}
                    onLiveTranscript={setLiveRawTranscript}
                    onRecordStart={() => { setIsRecording(true); setLiveRawTranscript(''); }}
                    onRecordEnd={() => { setIsRecording(false); }}
                    disabled={micDisabled}
                    transcriptContext={{
                      equipmentName: wo.equipmentRaw ?? undefined,
                      buildingCode: wo.buildingCode ?? undefined,
                      roomNumber: wo.roomNumber ?? undefined,
                    }}
                  />
                </div>

                {/* Right — Pass On (EOD) or Submit (all filled, non-EOD) */}
                <div className="flex justify-center">
                  {endOfDayMode && onPassOn ? (
                    <button
                      onClick={onPassOn}
                      disabled={submitting}
                      className="w-full py-3 text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium"
                    >
                      <ArrowRightLeft size={14} /> Pass On
                    </button>
                  ) : !endOfDayMode && allFilled ? (
                    <button
                      onClick={() => handleSubmit()}
                      disabled={submitting}
                      className="w-full py-3 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Submit
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

              </div>

              {/* EOD submit row — appears inside the card once all fields are filled */}
              {endOfDayMode && allFilled && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => handleSubmit()}
                    disabled={submitting}
                    className="w-full py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Submit Work Order
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Text mode input */}
          {textMode && (
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
                rows={2}
                placeholder="Type your message…"
                className="flex-1 resize-none text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                disabled={phase === 'thinking' || submitting}
              />
              <button
                onClick={handleTextSend}
                disabled={!textInput.trim() || phase === 'thinking' || submitting}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {/* Mode toggle row */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setTextMode(t => !t)}
              className="text-xs text-slate-400 hover:text-indigo-500 transition-colors underline underline-offset-2"
            >
              {textMode ? 'Switch to voice' : 'Type instead'}
            </button>
            <button
              onClick={() => {
                window.speechSynthesis?.cancel();
                setMessages([]);
                geminiHistory.current = [];
                setExtracted({ completionDate: null, hours: null, collaborators: [], collaboratorMatches: [], completionRemark: null });
                setPhase('idle');
                setError(null);
                const greeting = 'Let\'s start over. Tell me about this work order completion.';
                geminiHistory.current = [];
                setMessages([{ role: 'ai', text: greeting }]);
                speak(greeting, () => { setPhase('idle'); }, muted);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
            >
              <RotateCcw size={10} /> Reset
            </button>
          </div>
        </div>

        {editField && (
          <div
            className="absolute inset-0 z-10 flex flex-col bg-white/92 backdrop-blur-sm border-t border-slate-200/90 shadow-[0_-10px_40px_rgba(15,23,42,0.12)]"
            aria-modal="true"
            role="dialog"
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                {editField === 'date' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Edit date</p>
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={() => setEditField(null)}>
                        Done
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => {
                          setManualLock(l => ({ ...l, completionDate: true }));
                          setExtracted(e => ({ ...e, completionDate: today }));
                        }}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => {
                          setManualLock(l => ({ ...l, completionDate: true }));
                          const y = new Date();
                          y.setDate(y.getDate() - 1);
                          const iso = y.toISOString().slice(0, 10);
                          setExtracted(e => ({ ...e, completionDate: iso }));
                        }}
                      >
                        Yesterday
                      </button>
                      <label className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100 cursor-pointer">
                        Pick…
                        <input
                          type="date"
                          className="ml-2 bg-transparent"
                          value={extracted.completionDate || ''}
                          onChange={(ev) => {
                            setManualLock(l => ({ ...l, completionDate: true }));
                            setExtracted(e => ({ ...e, completionDate: ev.target.value || null }));
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => {
                          setManualLock(l => ({ ...l, completionDate: true }));
                          setExtracted(e => ({ ...e, completionDate: null }));
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {editField === 'hours' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Edit hours</p>
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={() => setEditField(null)}>
                        Done
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[0.5, 1, 2, 3, 4, 5, 8].map(h => (
                        <button
                          key={h}
                          type="button"
                          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                          onClick={() => {
                            setManualLock(l => ({ ...l, hours: true }));
                            setExtracted(e => ({ ...e, hours: h }));
                          }}
                        >
                          {h}h
                        </button>
                      ))}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
                        <input
                          inputMode="decimal"
                          value={hoursDraft}
                          onChange={e => setHoursDraft(e.target.value)}
                          placeholder="e.g. 1.5"
                          className="w-20 text-sm bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                          onClick={() => {
                            const n = Number(hoursDraft);
                            if (!Number.isFinite(n)) return;
                            setManualLock(l => ({ ...l, hours: true }));
                            setExtracted(e => ({ ...e, hours: n }));
                          }}
                        >
                          Set
                        </button>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => {
                          setManualLock(l => ({ ...l, hours: true }));
                          setExtracted(e => ({ ...e, hours: null }));
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {editField === 'with' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Edit collaborators</p>
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={() => setEditField(null)}>
                        Done
                      </button>
                    </div>
                    <input
                      value={staffFilter}
                      onChange={e => setStaffFilter(e.target.value)}
                      placeholder="Search staff…"
                      className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="max-h-44 overflow-auto rounded-xl border border-slate-200 bg-white">
                      {activeStaffList
                        .filter(s => !staffFilter.trim() || s.name.toLowerCase().includes(staffFilter.trim().toLowerCase()))
                        .map(s => (
                          <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedStaffIds.has(s.id)}
                              onChange={() => toggleStaffId(s.id)}
                            />
                            <span className="text-slate-700">{s.name}</span>
                          </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => setSelectedStaffIds(new Set())}
                      >
                        Clear selection
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                        onClick={() => {
                          setManualLock(l => ({ ...l, collaborators: true }));
                          const matches = activeStaffList
                            .filter(s => selectedStaffIds.has(s.id))
                            .map(s => ({ spokenName: s.name, resolvedName: s.name, staffId: s.id }));
                          setExtracted(e => ({
                            ...e,
                            collaboratorMatches: matches,
                            collaborators: matches.map(m => m.resolvedName),
                          }));
                          setEditField(null);
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}

                {editField === 'remark' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Edit remark</p>
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={() => setEditField(null)}>
                        Done
                      </button>
                    </div>
                    <textarea
                      value={remarkDraft}
                      onChange={e => setRemarkDraft(e.target.value)}
                      rows={4}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-100"
                        onClick={() => setRemarkDraft('')}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                        onClick={() => {
                          setManualLock(l => ({ ...l, completionRemark: true }));
                          setExtracted(e => ({ ...e, completionRemark: remarkDraft.trim() || null }));
                          setEditField(null);
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
