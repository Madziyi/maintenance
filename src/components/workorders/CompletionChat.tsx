/**
 * CompletionChat — real-time push-to-talk completion session.
 *
 * Hold the mic button to speak; release to send. AI responds, user holds
 * again to reply. Fully push-to-talk — no silence detection.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, X, CheckCircle2, Loader2,
  Calendar, Clock, Users, FileText, Volume2, VolumeX,
  ChevronRight, RotateCcw, ArrowRightLeft,
} from 'lucide-react';
import { PushToTalkMic } from '../common/PushToTalkMic';
import { api } from '../../../api';
import type { WorkOrder, Staff } from '../../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Extracted {
  completionDate: string | null;
  hours: number | null;
  collaborators: string[];
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

// ─── Main component ───────────────────────────────────────────────────────────

export const CompletionChat: React.FC<Props> = ({
  wo, staffList, onComplete, onClose, endOfDayMode = false, onSkip, onPassOn,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const staffNames = staffList.filter(s => s.active).map(s => s.name);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const geminiHistory = useRef<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);

  const [extracted, setExtracted] = useState<Extracted>({
    completionDate: null, hours: null, collaborators: [], completionRemark: null,
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
  const [countdown, setCountdown] = useState<number | null>(null);
  const pendingExtracted = useRef<Extracted | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll chat to bottom (messages + live transcript) ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveRawTranscript, isRecording]);

  // ── Countdown auto-submit ──
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      const ext = pendingExtracted.current;
      if (ext) handleSubmit(ext);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c !== null ? c - 1 : null), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

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
        staffNames,
        todayDate: today,
      });

      const merged: Extracted = {
        completionDate: result.extracted.completionDate ?? extracted.completionDate,
        hours: result.extracted.hours ?? extracted.hours,
        collaborators: result.extracted.collaborators?.length
          ? result.extracted.collaborators
          : extracted.collaborators,
        completionRemark: result.extracted.completionRemark ?? extracted.completionRemark,
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
        pendingExtracted.current = merged;
        setPhase('speaking');
        speak(replyText, () => {
          setPhase('done');
          setCountdown(3);
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
  }, [extracted, wo, staffNames, today, muted, onSkip]);

  // ── Opening greeting on mount ──
  useEffect(() => {
    const desc = wo.requestDescription || wo.equipmentRaw || '';
    const greeting = `What are your completion remarks for work order ${desc || wo.workOrderNumber}? Just tell me what happened — date, hours, who you worked with, and what you found.`;

    setMessages([{ role: 'ai', text: greeting }]);
    geminiHistory.current = [{ role: 'model', parts: [{ text: greeting }] }];

    setPhase('speaking');
    speak(greeting, () => { setPhase('idle'); }, muted);

    return () => { window.speechSynthesis?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit completion ──
  const handleSubmit = async (ext: Extracted = extracted) => {
    const date = ext.completionDate || today;
    const remark = ext.completionRemark || '';
    if (!remark) {
      sendToAI('(user attempted submit without completion remark — please ask for it)');
      return;
    }
    setSubmitting(true);
    setPhase('done');
    try {
      await onComplete({
        completionDate: date,
        hours: ext.hours,
        collaborators: ext.collaborators,
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

        {/* ── Extracted fields strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b border-slate-100 shrink-0">
          <FieldCard icon={Calendar} label="Date" value={fmtDate(extracted.completionDate)}
            colour="bg-blue-50 border-blue-200 text-blue-700" />
          <FieldCard icon={Clock} label="Hours" value={extracted.hours !== null ? `${extracted.hours}h` : null}
            colour="bg-emerald-50 border-emerald-200 text-emerald-700" />
          <FieldCard icon={Users} label="With"
            value={extracted.collaborators.length ? extracted.collaborators.join(', ') : null}
            colour="bg-violet-50 border-violet-200 text-violet-700" />
          <FieldCard icon={FileText} label="Remark"
            value={extracted.completionRemark}
            colour="bg-amber-50 border-amber-200 text-amber-700" />
        </div>

        {/* ── Chat messages ── */}
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

        {/* ── Bottom controls ── */}
        <div className="shrink-0 border-t border-slate-100 px-4 sm:px-5 pt-3 pb-4 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>

          {/* Status line */}
          <div className="flex items-center justify-center gap-2 h-5">
            {countdown !== null ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-emerald-600">
                  Submitting in {countdown}…
                </span>
                <button
                  onClick={() => { setCountdown(null); pendingExtracted.current = null; setPhase('idle'); }}
                  className="text-xs text-slate-400 hover:text-red-500 underline underline-offset-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : phase === 'thinking' ? (
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
                    autoClean
                    onTranscript={handleVoiceTranscript}
                    onLiveTranscript={setLiveRawTranscript}
                    onRecordStart={() => { setIsRecording(true); setLiveRawTranscript(''); }}
                    onRecordEnd={() => { setIsRecording(false); }}
                    disabled={micDisabled}
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
                setExtracted({ completionDate: null, hours: null, collaborators: [], completionRemark: null });
                setPhase('idle');
                setError(null);
                const greeting = 'Let\'s start over. Tell me about this work order completion.';
                setMessages([{ role: 'ai', text: greeting }]);
                speak(greeting, () => { setPhase('idle'); }, muted);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
            >
              <RotateCcw size={10} /> Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
