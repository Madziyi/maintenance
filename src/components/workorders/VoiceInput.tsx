/**
 * VoiceInput — records a voice note via the Web Speech API,
 * then optionally sends the raw transcript to the Gemini-powered
 * cleanup endpoint to improve grammar and produce a summary.
 *
 * Note: Completion workflows primarily use PushToTalkMic + CompletionChat.
 * This component is retained as a secondary/manual input path.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, RotateCcw, Check, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../../../api';

// Web Speech API — not in standard TS DOM types; use any to avoid type errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

interface VoiceInputProps {
  /** Called whenever the committed text changes (raw while recording, cleaned after AI) */
  onChange: (raw: string, cleaned: string, summary: string) => void;
  disabled?: boolean;
}

type Phase = 'idle' | 'recording' | 'recorded' | 'cleaning' | 'cleaned';

export const VoiceInput: React.FC<VoiceInputProps> = ({ onChange, disabled }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [liveText, setLiveText] = useState('');      // grows while recording
  const [rawText, setRawText] = useState('');         // locked after stop
  const [cleanedText, setCleanedText] = useState('');
  const [summary, setSummary] = useState('');
  const [cleanError, setCleanError] = useState<string | null>(null);
  const [manualEdit, setManualEdit] = useState('');   // lets user edit cleaned text
  const [useManual, setUseManual] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const finalRef = useRef(''); // accumulates finalised segments

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionClass: AnySpeechRecognition =
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null;

  const supported = !!SpeechRecognitionClass;

  // Notify parent when committed text changes
  useEffect(() => {
    const active = useManual ? manualEdit : cleanedText;
    if (phase === 'cleaned') onChange(rawText, active, summary);
  }, [cleanedText, manualEdit, useManual, summary, rawText, phase]);

  // Also notify when raw changes (so parent always has latest)
  useEffect(() => {
    if (phase === 'recorded') onChange(rawText, rawText, '');
  }, [rawText, phase]);

  function startRecording() {
    if (!SpeechRecognitionClass) return;
    finalRef.current = '';
    setLiveText('');
    setRawText('');
    setCleanedText('');
    setSummary('');
    setCleanError(null);
    setManualEdit('');
    setUseManual(false);

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-CA';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalRef.current += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setLiveText((finalRef.current + interim).trim());
    };

    rec.onend = () => {
      const final = finalRef.current.trim();
      if (final) {
        setRawText(final);
        setPhase('recorded');
      } else {
        setPhase('idle');
      }
    };

    rec.onerror = () => {
      setPhase(finalRef.current.trim() ? 'recorded' : 'idle');
    };

    recognitionRef.current = rec;
    rec.start();
    setPhase('recording');
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    // onend handler moves phase to 'recorded'
  }

  async function cleanUp() {
    setPhase('cleaning');
    setCleanError(null);
    try {
      const { cleaned, summary: s } = await api.cleanTranscript(rawText);
      setCleanedText(cleaned);
      setManualEdit(cleaned);
      setSummary(s);
      setPhase('cleaned');
    } catch (err) {
      setCleanError(err instanceof Error ? err.message : 'Cleanup failed');
      setPhase('recorded');
    }
  }

  function reset() {
    recognitionRef.current?.stop();
    setPhase('idle');
    setLiveText('');
    setRawText('');
    setCleanedText('');
    setSummary('');
    setCleanError(null);
    setManualEdit('');
    setUseManual(false);
    onChange('', '', '');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
        <AlertTriangle size={15} />
        Voice input is not supported in this browser. Use Chrome or Edge, or type your notes below.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Recording control */}
      <div className="flex items-center gap-3">
        {phase === 'recording' ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <MicOff size={15} />
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || phase === 'cleaning'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Mic size={15} />
            {phase === 'idle' ? 'Start recording' : 'Record again'}
          </button>
        )}

        {(phase === 'recorded' || phase === 'cleaned') && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
          >
            <RotateCcw size={13} />
            Clear
          </button>
        )}
      </div>

      {/* Live transcript while recording */}
      {phase === 'recording' && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 min-h-[60px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-indigo-600 font-medium">Listening…</span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {liveText || <span className="text-slate-400 italic">Speak now…</span>}
          </p>
        </div>
      )}

      {/* Raw transcript after recording */}
      {(phase === 'recorded' || phase === 'cleaning') && (
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Raw transcript</p>
            <p className="text-sm text-slate-700 leading-relaxed">{rawText}</p>
          </div>

          {cleanError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={12} /> {cleanError}
            </p>
          )}

          <button
            type="button"
            onClick={cleanUp}
            disabled={phase === 'cleaning'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {phase === 'cleaning' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {phase === 'cleaning' ? 'Cleaning up…' : 'Clean up with AI'}
          </button>
        </div>
      )}

      {/* AI-cleaned result */}
      {phase === 'cleaned' && (
        <div className="space-y-3">
          {summary && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="text-xs font-medium text-violet-600 uppercase tracking-wide mb-1">Key points</p>
              <p className="text-sm text-violet-900 leading-relaxed">{summary}</p>
            </div>
          )}

          <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <Check size={12} className="text-emerald-500" />
                Cleaned notes
                {useManual && <span className="text-indigo-500">(edited)</span>}
              </p>
              <button
                type="button"
                onClick={() => setUseManual(v => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {useManual ? 'Show AI version' : 'Edit'}
              </button>
            </div>
            {useManual ? (
              <textarea
                rows={4}
                value={manualEdit}
                onChange={e => setManualEdit(e.target.value)}
                className="w-full text-sm text-slate-700 leading-relaxed border-0 outline-none resize-none bg-transparent"
              />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed">{cleanedText}</p>
            )}
          </div>

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-600 select-none">View raw transcript</summary>
            <p className="mt-1 pl-2 italic leading-relaxed">{rawText}</p>
          </details>
        </div>
      )}
    </div>
  );
};
