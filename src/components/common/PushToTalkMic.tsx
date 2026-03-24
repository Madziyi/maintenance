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

interface Props {
  onTranscript: (cleaned: string, raw: string) => void;
  onLiveTranscript?: (rawInterim: string) => void;
  onRecordStart?: () => void;
  onRecordEnd?: (rawFinal: string) => void;
  disabled?: boolean;
  size?: Size;
  autoClean?: boolean;   // run HVAC-aware cleaner before firing onTranscript
  className?: string;
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

    recog.onerror = () => {
      setRecording(false);
      onLiveTranscript?.('');
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

    if (autoClean) {
      setCleaning(true);
      try {
        const { cleaned } = await api.cleanTranscript(raw);
        onTranscript(cleaned || raw, raw);
      } catch {
        onTranscript(raw, raw); // fall back to raw on error
      } finally {
        setCleaning(false);
      }
    } else {
      onTranscript(raw, raw);
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
