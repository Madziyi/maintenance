/**
 * PushToTalkMic — hold to record, release to send.
 *
 * Green open mic while recording, red slashed mic when idle.
 * Optionally calls the HVAC-aware transcript cleaner before firing onTranscript.
 */
import React, { useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { api } from '../../../api';

type Size = 'sm' | 'md' | 'lg';

export interface TranscriptContext {
  equipmentName?: string;
  buildingCode?: string;
  roomNumber?: string;
}

interface Props {
  onTranscript: (cleaned: string, raw: string) => void;
  onLiveTranscript?: (rawInterim: string) => void;
  onRecordStart?: () => void;
  onRecordEnd?: (rawFinal: string) => void;
  disabled?: boolean;
  size?: Size;
  autoClean?: boolean;   // run HVAC-aware cleaner before firing onTranscript
  transcriptContext?: TranscriptContext; // WO context for smarter cleaning
  className?: string;
}

// ─── Deterministic pre-normalization ──────────────────────────────────────────
// Runs before Gemini — catches definite mishearings instantly, free, no latency.
// Rules are ordered: most specific / context-sensitive first.
const HVAC_RULES: [RegExp, string][] = [
  // AHU — mishears as "age you", "a-h-u", "AEHU"
  [/\bage\s+you\b/gi, 'AHU'],
  [/\ba[-\s]h[-\s]u\b/gi, 'AHU'],
  [/\baehu\b/gi, 'AHU'],
  // RTU — mishears as "our two you", "are-tee-you", "R-T-U"
  [/\bour\s+two\s+you\b/gi, 'RTU'],
  [/\bare[-\s]?t(?:ee|wo)?[-\s]?(?:you|u)\b/gi, 'RTU'],
  [/\br[-\s]t[-\s]u\b/gi, 'RTU'],
  // VAV — mishears as "V-A-V"; "vague" only near known VAV context words
  [/\bv[-\s]a[-\s]v\b/gi, 'VAV'],
  [/\bvague\b(?=\s+(?:box|damper|unit|terminal|valve))/gi, 'VAV'],
  // FCU — "F-C-U"
  [/\bf[-\s]c[-\s]u\b/gi, 'FCU'],
  // MAU — "mae you", "M-A-U"
  [/\bmae\s+you\b/gi, 'MAU'],
  [/\bm[-\s]a[-\s]u\b/gi, 'MAU'],
  // HRU — "H-R-U"
  [/\bh[-\s]r[-\s]u\b/gi, 'HRU'],
  // ERV — "E-R-V"
  [/\be[-\s]r[-\s]v\b/gi, 'ERV'],
  // VFD — "V-F-D"
  [/\bv[-\s]f[-\s]d\b/gi, 'VFD'],
  // BAS — "B-A-S"; "baz" only near system/control context
  [/\bb[-\s]a[-\s]s\b/gi, 'BAS'],
  [/\bbaz\b(?=\s+(?:system|sensor|point|control|alarm))/gi, 'BAS'],
  // BMS — "B-M-S"
  [/\bb[-\s]m[-\s]s\b/gi, 'BMS'],
  // DDC — "D-D-C"
  [/\bd[-\s]d[-\s]c\b/gi, 'DDC'],
  // Units of measure
  [/\bp[-\s]s[-\s]i\b/gi, 'PSI'],
  [/\bg[-\s]p[-\s]m\b/gi, 'GPM'],
  [/\bc[-\s]f[-\s]m\b/gi, 'CFM'],
  [/\bb[-\s]t[-\s]u\b/gi, 'BTU'],
];

function normalizeTranscript(raw: string): string {
  return HVAC_RULES.reduce((text, [pattern, replacement]) =>
    text.replace(pattern, replacement), raw);
}

const AnySpeechRecognition: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
};

const ICON_SIZE: Record<Size, number> = { sm: 16, md: 20, lg: 28 };

export const PushToTalkMic: React.FC<Props> = ({
  onTranscript,
  onLiveTranscript,
  onRecordStart,
  onRecordEnd,
  disabled = false,
  size = 'md',
  autoClean = true,
  transcriptContext,
  className = '',
}) => {
  const [recording, setRecording] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const recogRef = useRef<any>(null);
  const finalRef  = useRef('');
  const lastLiveRef = useRef('');
  const isDownRef = useRef(false);

  const startRecording = useCallback(() => {
    if (!AnySpeechRecognition || disabled || recording) return;
    finalRef.current = '';
    lastLiveRef.current = '';
    const recog = new AnySpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-CA';
    recogRef.current = recog;

    recog.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      const live = `${finalRef.current}${interim}`.trim();
      lastLiveRef.current = live;
      onLiveTranscript?.(live);
    };

    recog.onerror = (e: any) => {
      // 'aborted' fires when we call recog.stop() ourselves — not a real error
      if (e.error === 'aborted') return;
      setRecording(false);
      onLiveTranscript?.('');
    };

    // continuous=true sessions can still end silently (network hiccup, browser silence
    // timeout). Restart automatically while the button is still held.
    recog.onend = () => {
      if (isDownRef.current) {
        try { recog.start(); } catch { /* already starting */ }
      }
    };

    recog.start();
    setRecording(true);
  }, [disabled, onLiveTranscript, recording]);

  const stopRecording = useCallback(async () => {
    if (!isDownRef.current) return;
    isDownRef.current = false;
    recogRef.current?.stop();
    recogRef.current = null;
    setRecording(false);

    const raw = (finalRef.current.trim() || lastLiveRef.current.trim());
    onLiveTranscript?.('');
    onRecordEnd?.(raw);
    if (!raw) return;

    // Always run deterministic normalization first — free, instant, no network
    const preNormalized = normalizeTranscript(raw);

    if (autoClean) {
      setCleaning(true);
      try {
        const { cleaned } = await api.cleanTranscript(preNormalized, transcriptContext);
        onTranscript(cleaned || preNormalized, raw);
      } catch {
        onTranscript(preNormalized, raw); // fall back to pre-normalized on error
      } finally {
        setCleaning(false);
      }
    } else {
      onTranscript(preNormalized, raw);
    }
  }, [autoClean, onLiveTranscript, onRecordEnd, onTranscript]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || cleaning) return;
    isDownRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onLiveTranscript?.('');
    onRecordStart?.();
    startRecording();
  };

  const handlePointerUp = () => {
    stopRecording();
  };

  const handlePointerCancel = () => {
    stopRecording();
  };

  const sizeClass = SIZE_CLASSES[size];
  const iconSize  = ICON_SIZE[size];

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      disabled={disabled || cleaning}
      style={{ touchAction: 'none', userSelect: 'none' }}
      className={`
        ${sizeClass} rounded-full flex items-center justify-center
        shadow-lg transition-all duration-150 select-none
        ${cleaning
          ? 'bg-slate-200 cursor-wait'
          : recording
          ? 'bg-emerald-500 hover:bg-emerald-600 scale-110 shadow-emerald-200 shadow-xl ring-4 ring-emerald-200 animate-pulse'
          : disabled
          ? 'bg-slate-200 cursor-not-allowed opacity-50'
          : 'bg-red-500 hover:bg-red-600 hover:scale-105 shadow-red-200'
        }
        ${className}
      `}
      title={recording ? 'Release to send' : 'Hold to speak'}
    >
      {cleaning
        ? <Loader2 size={iconSize} className="text-white animate-spin" />
        : recording
        ? <Mic     size={iconSize} className="text-white" />
        : <MicOff  size={iconSize} className="text-white" />
      }
    </button>
  );
};
