'use client';

// Silicon Streets — procedural sound effects. No audio assets: every cue is
// synthesized with the Web Audio API, so it ships zero bytes and stays on-brand.
// Driven by the authoritative event log — each new transition (seq change) is
// scanned for keywords and the matching cues are played, lightly staggered.

import { useCallback, useEffect, useRef, useState } from 'react';

type Cue = 'dice' | 'land' | 'buy' | 'cash' | 'tax' | 'jail' | 'bust' | 'gavel' | 'build' | 'win';

export interface UseSound {
  enabled: boolean;
  toggle: () => void;
}

interface SoundInput {
  seq: number;
  events: string[];
  /** True once the game has ended, for the victory sting. */
  over?: boolean;
}

/** Map a single event line to the cues it should trigger. */
function cuesFor(line: string): Cue[] {
  const e = line.toLowerCase();
  const out: Cue[] = [];
  if (e.includes('rolled')) out.push('dice');
  if (e.includes('rent')) out.push('cash');
  if (e.includes('acquired') || e.includes('won ')) out.push('buy');
  if (e.includes('passed reboot')) out.push('cash');
  if (e.includes('audit') || e.includes('surcharge') || e.includes('bail')) out.push('tax');
  if (e.includes('auction')) out.push('gavel');
  if (e.includes('quarantine')) out.push('jail');
  if (e.includes('bankrupt')) out.push('bust');
  if (e.includes('upgraded')) out.push('build');
  if (e.includes('unclaimed') || e.includes('drew')) out.push('land');
  return out;
}

function dedupe(events: string[]): Cue[] {
  const seen = new Set<Cue>();
  const order: Cue[] = [];
  for (const line of events) {
    for (const cue of cuesFor(line)) {
      if (!seen.has(cue)) {
        seen.add(cue);
        order.push(cue);
      }
    }
  }
  return order;
}

export function useSound(input: SoundInput | null): UseSound {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const ctxRef = useRef<AudioContext | null>(null);
  const lastSeq = useRef<number>(-1);
  const wasOver = useRef(false);

  const audioCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  /** One enveloped oscillator note. */
  const note = useCallback(
    (c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.16) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    },
    [],
  );

  /** A short filtered-noise burst (dice rattle, gavel knock). */
  const noise = useCallback((c: AudioContext, at: number, dur: number, peak = 0.12) => {
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(gain).connect(c.destination);
    src.start(at);
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      const c = audioCtx();
      if (!c) return;
      const t = c.currentTime;
      switch (cue) {
        case 'dice':
          noise(c, t, 0.09, 0.14);
          noise(c, t + 0.11, 0.08, 0.1);
          break;
        case 'land':
          note(c, 320, t, 0.08, 'triangle', 0.12);
          break;
        case 'buy':
          note(c, 523, t, 0.12, 'triangle');
          note(c, 784, t + 0.1, 0.16, 'triangle');
          break;
        case 'cash':
          note(c, 988, t, 0.07, 'square', 0.1);
          note(c, 1319, t + 0.07, 0.1, 'square', 0.1);
          break;
        case 'tax':
          note(c, 180, t, 0.22, 'sawtooth', 0.14);
          break;
        case 'jail':
          note(c, 300, t, 0.16, 'sawtooth', 0.13);
          note(c, 200, t + 0.14, 0.22, 'sawtooth', 0.13);
          break;
        case 'bust':
          note(c, 440, t, 0.18, 'sawtooth', 0.14);
          note(c, 330, t + 0.16, 0.18, 'sawtooth', 0.14);
          note(c, 220, t + 0.32, 0.3, 'sawtooth', 0.14);
          break;
        case 'gavel':
          noise(c, t, 0.06, 0.16);
          noise(c, t + 0.13, 0.06, 0.16);
          break;
        case 'build':
          note(c, 659, t, 0.1, 'triangle', 0.12);
          break;
        case 'win':
          note(c, 523, t, 0.14, 'triangle');
          note(c, 659, t + 0.12, 0.14, 'triangle');
          note(c, 784, t + 0.24, 0.16, 'triangle');
          note(c, 1047, t + 0.38, 0.3, 'triangle');
          break;
      }
    },
    [audioCtx, note, noise],
  );

  useEffect(() => {
    if (!input) return;
    if (input.seq === lastSeq.current) return;
    const firstObservation = lastSeq.current === -1;
    lastSeq.current = input.seq;
    if (firstObservation || !enabledRef.current) return; // never blast on initial load

    const cues = dedupe(input.events);
    if (input.over && !wasOver.current) {
      wasOver.current = true;
      cues.push('win');
    }
    cues.forEach((cue, i) => window.setTimeout(() => play(cue), i * 90));
  }, [input, play]);

  const toggle = useCallback(() => {
    setEnabled((e) => !e);
    audioCtx(); // resume/unlock the context on the user gesture
  }, [audioCtx]);

  return { enabled, toggle };
}
