'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/** Portal tooltip positioned next to its trigger (escapes overflow containers). */
export function Tooltip({
  content,
  side = 'right',
  disabled = false,
  children,
}: {
  content: React.ReactNode;
  side?: 'right' | 'top' | 'bottom';
  disabled?: boolean;
  children: React.ReactElement;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const show = () => {
    if (disabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (side === 'right') setPos({ x: r.right + 12, y: r.top + r.height / 2 });
    else if (side === 'top') setPos({ x: r.left + r.width / 2, y: r.top - 10 });
    else setPos({ x: r.left + r.width / 2, y: r.bottom + 10 });
  };
  const hide = () => setPos(null);

  const anchor = side === 'right' ? { x: '0%', y: '-50%' } : side === 'top' ? { x: '-50%', y: '-100%' } : { x: '-50%', y: '0%' };
  const offset = side === 'right' ? { x: -6 } : { y: side === 'top' ? 6 : -6 };

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className="block">
      {children}
      {ready &&
        createPortal(
          <AnimatePresence>
            {pos && !disabled && (
              <motion.div
                className="pointer-events-none fixed z-[120]"
                style={{ left: pos.x, top: pos.y, ...anchor }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, ...offset }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="whitespace-nowrap rounded-lg bg-gray-900/95 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl shadow-gray-900/30 ring-1 ring-white/10 backdrop-blur"
                >
                  {content}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
