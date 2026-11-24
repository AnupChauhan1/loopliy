'use client';

import { useEffect, useState } from 'react';
import { LooplyLogo } from './LooplyLogo';

/**
 * GIF-style 1.6s brand reveal shown once per full page load.
 * Links spring in from opposite sides (0–0.6s), wordmark reveals
 * left→right with an emerald shimmer (0.5–1.0s), then the whole
 * overlay fades out into the app (1.2–1.6s).
 */
export function LooplySplashIntro() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1700);
    return () => clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div className="lk-splash fixed inset-0 z-[300] flex items-center justify-center bg-white">
      <style>{`
        @keyframes lk-out {
          0%, 72% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.96); }
        }
        @keyframes lk-black-in {
          0% { transform: translateX(-34px); opacity: 0; }
          55% { transform: translateX(7px); opacity: 1; }
          78% { transform: translateX(-3px); }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes lk-green-in {
          0% { transform: translateX(34px); opacity: 0; }
          55% { transform: translateX(-7px); opacity: 1; }
          78% { transform: translateX(3px); }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes lk-word {
          0%, 30% { clip-path: inset(0 100% 0 0); opacity: 0; transform: translateX(-10px); }
          62%, 100% { clip-path: inset(0 0 0 0); opacity: 1; transform: translateX(0); }
        }
        @keyframes lk-shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .lk-splash { animation: lk-out 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .lk-black { animation: lk-black-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-origin: center; }
        .lk-green { animation: lk-green-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-origin: center; }
        .lk-word { animation: lk-word 0.7s ease-out 0.5s both; }
        .lk-green circle { animation: lk-shimmer 0.9s ease-in-out 0.5s 2; }
      `}</style>
      <svg viewBox="0 0 220 64" className="h-20 w-auto sm:h-24" role="img" aria-label="LOOPLY">
        <g className="lk-black">
          <circle cx="24" cy="36" r="15" stroke="#0B0F19" strokeWidth="9" strokeLinecap="round" strokeDasharray="70.7 23.6" transform="rotate(45 24 36)" fill="none" />
        </g>
        <g className="lk-green">
          <circle cx="40" cy="28" r="15" stroke="#10B981" strokeWidth="9" strokeLinecap="round" strokeDasharray="70.7 23.6" transform="rotate(225 40 28)" fill="none" />
        </g>
        <text
          x="70" y="45"
          className="lk-word"
          fontFamily="'Roboto Slab', 'Arvo', Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="36"
          letterSpacing="-1"
          fill="#0B0F19"
        >
          Looply
        </text>
      </svg>
    </div>
  );
}
