'use client';

import type { LinkState, UseVoice } from '@/hooks/useVoice';

interface Peer {
  id: string;
  name: string;
}

interface VoiceBarProps {
  voice: UseVoice;
  peers: Peer[]; // everyone except me
}

const BARS: Record<string, { bars: number; color: string; pulse?: boolean }> = {
  connected: { bars: 3, color: '#00FF41' },
  completed: { bars: 3, color: '#00FF41' },
  connecting: { bars: 2, color: '#00D4FF', pulse: true },
  new: { bars: 1, color: '#00D4FF', pulse: true },
  checking: { bars: 2, color: '#00D4FF', pulse: true },
  disconnected: { bars: 1, color: '#FF4ECd' },
  failed: { bars: 1, color: '#FF4ECd' },
  closed: { bars: 0, color: '#8aa0b4' },
  idle: { bars: 0, color: '#8aa0b4' },
};

function Signal({ state, active }: { state: LinkState | undefined; active: boolean }) {
  if (!active) return <span className="text-[10px] text-term-dim">offline</span>;
  const cfg = BARS[state ?? 'idle'] ?? BARS.idle;
  return (
    <span className="flex items-end gap-0.5" title={`link: ${state ?? 'idle'}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cfg.pulse && i < cfg.bars ? 'animate-pulse' : ''}
          style={{
            width: 3,
            height: 5 + i * 4,
            borderRadius: 1,
            background: i < cfg.bars ? cfg.color : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </span>
  );
}

export default function VoiceBar({ voice, peers }: VoiceBarProps) {
  return (
    <div className="glass flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-term-dim">Voice Infrastructure</h2>
        <span
          className={`h-2 w-2 rounded-full ${voice.enabled ? 'animate-ring bg-matrix' : 'bg-term-dim'}`}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={voice.toggleVoice}
          className={`btn-glass flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider ${
            voice.enabled ? 'text-magenta' : 'text-matrix'
          }`}
        >
          {voice.enabled ? '⏻ Leave' : '🎙 Join Voice'}
        </button>
        {voice.enabled && (
          <button
            onClick={voice.toggleMute}
            className={`btn-glass rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider ${
              voice.muted ? 'text-magenta' : 'text-cyber'
            }`}
          >
            {voice.muted ? 'Unmute' : 'Mute'}
          </button>
        )}
      </div>

      {voice.error && <p className="text-[10px] text-magenta">⚠ {voice.error}</p>}

      <ul className="flex flex-col gap-1">
        {peers.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-xs text-term-text">
            <span className="flex items-center gap-1.5">
              {voice.remoteActive[p.id] && <span className="text-cyber">🔊</span>}
              {p.name}
            </span>
            <Signal state={voice.links[p.id]} active={Boolean(voice.remoteActive[p.id])} />
          </li>
        ))}
        {peers.length === 0 && <li className="text-[10px] text-term-dim">No other players connected.</li>}
      </ul>
    </div>
  );
}
