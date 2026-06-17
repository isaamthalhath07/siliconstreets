'use client';

// Silicon Streets — "Sponsored System Update". Per the monetization design, ads
// are framed as in-world system events rather than pop-ups. This renders a live
// Google AdSense unit when NEXT_PUBLIC_ADSENSE_CLIENT (+ a slot id) is set, and
// an on-brand placeholder otherwise so the layout is identical in dev.

import { useEffect, useRef } from 'react';

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

interface AdSlotProps {
  slot?: string;          // AdSense ad unit id
  label?: string;
  className?: string;
}

export default function AdSlot({ slot, label = 'Sponsored System Update', className = '' }: AdSlotProps) {
  const ref = useRef<HTMLModElement>(null);
  const live = Boolean(CLIENT && slot);

  useEffect(() => {
    if (!live) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      /* adblock or script not yet ready — placeholder styling remains */
    }
  }, [live]);

  return (
    <div className={`glass overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyber">
          ◈ {label}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-term-dim">Paid bandwidth</span>
      </div>

      {live ? (
        <ins
          ref={ref}
          className="adsbygoogle block"
          style={{ display: 'block', minHeight: 90 }}
          data-ad-client={CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div className="relative flex h-[90px] items-center justify-center px-4">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'linear-gradient(110deg, transparent 30%, rgba(0,212,255,0.25) 50%, transparent 70%)',
              backgroundSize: '200% 100%',
            }}
          />
          <p className="relative text-center text-xs text-term-dim">
            <span className="text-term-text">Optimizing your bandwidth…</span>
            <br />
            <span className="text-[10px]">Your ad could fund this datacenter.</span>
          </p>
        </div>
      )}
    </div>
  );
}
