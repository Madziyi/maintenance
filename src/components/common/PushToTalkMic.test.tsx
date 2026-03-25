import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

let activeRecognition: any = null;

class FakeSpeechRecognition {
  public continuous = false;
  public interimResults = false;
  public lang = 'en-CA';
  public onresult: ((e: any) => void) | null = null;
  public onerror: (() => void) | null = null;

  start() {
    activeRecognition = this;
  }

  stop() {}
}

describe('PushToTalkMic', () => {
  beforeEach(() => {
    vi.resetModules();
    activeRecognition = null;
    (window as any).SpeechRecognition = FakeSpeechRecognition;
    (window as any).webkitSpeechRecognition = undefined;
    (HTMLElement.prototype as any).setPointerCapture = vi.fn();
  });

  it('emits live transcript and final raw transcript', async () => {
    const onTranscript = vi.fn();
    const onLiveTranscript = vi.fn();
    const onRecordStart = vi.fn();
    const onRecordEnd = vi.fn();

    const { PushToTalkMic } = await import('./PushToTalkMic');

    const { getByRole } = render(
      <PushToTalkMic
        autoClean={false}
        onTranscript={onTranscript}
        onLiveTranscript={onLiveTranscript}
        onRecordStart={onRecordStart}
        onRecordEnd={onRecordEnd}
      />
    );

    const button = getByRole('button');
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(onRecordStart).toHaveBeenCalledTimes(1);

    activeRecognition.onresult?.({
      resultIndex: 0,
      results: [
        { 0: { transcript: 'hello' }, isFinal: true },
        { 0: { transcript: 'there' }, isFinal: false },
      ],
    });

    expect(onLiveTranscript).toHaveBeenCalledWith('hello there');

    fireEvent.pointerUp(button);

    await waitFor(() => {
      expect(onRecordEnd).toHaveBeenCalledWith('hello');
      expect(onTranscript).toHaveBeenCalledWith('hello', 'hello');
      expect(onLiveTranscript).toHaveBeenLastCalledWith('');
    });
  });

  it('falls back to latest live transcript when no final chunk exists', async () => {
    const onTranscript = vi.fn();
    const onLiveTranscript = vi.fn();

    const { PushToTalkMic } = await import('./PushToTalkMic');

    const { getByRole } = render(
      <PushToTalkMic
        autoClean={false}
        onTranscript={onTranscript}
        onLiveTranscript={onLiveTranscript}
      />
    );

    const button = getByRole('button');
    fireEvent.pointerDown(button, { pointerId: 1 });

    activeRecognition.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: 'interim only words' }, isFinal: false }],
    });

    fireEvent.pointerUp(button);

    await waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith('interim only words', 'interim only words');
      expect(onLiveTranscript).toHaveBeenLastCalledWith('');
    });
  });
});
