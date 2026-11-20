'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { LOTTIE, type LottieName } from '@/lib/lottie/animations';
import { cn } from '@/lib/utils';

// lottie-web touches `document` at import time, so load it client-side only.
const LottieSvg = dynamic(() => import('lottie-react').then((m) => m.LottieSvg), { ssr: false });

export function LottieAnim({
  name,
  loop = true,
  className,
  size = 160,
  speed = 1,
}: {
  name: LottieName;
  loop?: boolean;
  className?: string;
  size?: number;
  speed?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '200px' });
  const reduce = useReducedMotion();
  // lottie-web mutates animation data; give every instance its own copy.
  const data = useMemo(() => structuredClone(LOTTIE[name]), [name]);
  // WCAG 2.2.2: decorative auto-playing motion stops within ~5s. Loaders are the
  // exception — they only exist while data is loading.
  const seconds = (data.op - data.ip) / data.fr;
  const repeats = name === 'loader' ? true : Math.max(0, Math.floor(5 / seconds) - 1);

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-none select-none', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {isInView && (
        <LottieSvg
          src={data}
          loop={reduce || !loop ? false : repeats}
          autoplay={!reduce}
          speed={speed}
          // Reduced motion: hold the final, fully-drawn frame instead of animating.
          segment={reduce ? [data.op - 1, data.op] : undefined}
          rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}
