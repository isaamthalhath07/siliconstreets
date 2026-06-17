'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiceRoll } from '@/engine/types';

// 3x3 pip grid (cells 0-8) lit per face value.
const PIPS: Record<number, ReadonlySet<number>> = {
  1: new Set([4]),
  2: new Set([0, 8]),
  3: new Set([0, 4, 8]),
  4: new Set([0, 2, 6, 8]),
  5: new Set([0, 2, 4, 6, 8]),
  6: new Set([0, 2, 3, 5, 6, 8]),
};

// Cube rotation (deg) that brings each face value to the front.
const SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

interface DiceProps {
  roll: DiceRoll | null;
  size?: number; // px
}

/** Two 3D dice that tumble (CSS transition through extra full spins) to the
 *  authoritative face whenever the roll changes. */
export default function Dice({ roll, size = 56 }: DiceProps) {
  const [faces, setFaces] = useState<[number, number]>([roll?.d1 ?? 1, roll?.d2 ?? 1]);
  const [spin, setSpin] = useState(0);
  const [rolling, setRolling] = useState(false);
  const prev = useRef('');

  useEffect(() => {
    if (!roll) return;
    const key = `${roll.d1}-${roll.d2}`;
    if (key === prev.current) return; // same result (or non-roll action) — no replay
    prev.current = key;
    setRolling(true);
    setSpin((s) => s + 3); // three extra tumbles before settling
    setFaces([roll.d1, roll.d2]);
    const id = window.setTimeout(() => setRolling(false), 700);
    return () => window.clearTimeout(id);
  }, [roll?.d1, roll?.d2]);

  return (
    <div className="flex items-center gap-4">
      <Die value={faces[0]} size={size} spin={spin} rolling={rolling} tint="#00FF41" />
      <Die value={faces[1]} size={size} spin={spin} rolling={rolling} tint="#00D4FF" />
    </div>
  );
}

function Die({
  value,
  size,
  spin,
  rolling,
  tint,
}: {
  value: number;
  size: number;
  spin: number;
  rolling: boolean;
  tint: string;
}) {
  const h = size / 2;
  const place: Record<number, string> = {
    1: `translateZ(${h}px)`,
    6: `rotateY(180deg) translateZ(${h}px)`,
    2: `rotateY(90deg) translateZ(${h}px)`,
    5: `rotateY(-90deg) translateZ(${h}px)`,
    3: `rotateX(90deg) translateZ(${h}px)`,
    4: `rotateX(-90deg) translateZ(${h}px)`,
  };
  const show = SHOW[value] ?? SHOW[1];
  const transform = `rotateX(${show.x + spin * 360}deg) rotateY(${show.y + spin * 360}deg)`;

  return (
    <div className="dice-scene" style={{ width: size, height: size }}>
      <div
        className={`die3d ${rolling ? 'rolling' : ''}`}
        style={{ width: size, height: size, transform, filter: `drop-shadow(0 8px 9px ${tint}55)` }}
      >
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className="die-face" style={{ transform: place[f] }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="grid place-items-center">
                {PIPS[f].has(i) && <span className="pip" />}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
