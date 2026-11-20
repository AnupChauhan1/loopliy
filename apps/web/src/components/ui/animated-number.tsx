'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

/** Counts up from 0 (on first view) and tweens smoothly whenever `value` changes. */
export function AnimatedNumber({
  value,
  duration = 1.4,
  className,
  format = defaultFormat,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    const to = Number.isFinite(value) ? value : 0;
    if (reduce) {
      current.current = to;
      node.textContent = format(to);
      return;
    }
    const controls = animate(current.current, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        current.current = v;
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, duration, reduce, format]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
