'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

const CloseCtx = createContext<() => void>(() => {});

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <div onClick={() => setIsOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
            style={{ transformOrigin: align === 'right' ? 'top right' : 'top left' }}
            className={cn(
              'absolute z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-[0_24px_60px_-20px_rgba(17,24,39,0.35)] ring-1 ring-gray-900/5 backdrop-blur-xl',
              align === 'right' ? 'right-0' : 'left-0',
              className,
            )}
            role="menu"
          >
            <CloseCtx.Provider value={() => setIsOpen(false)}>
              <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }}>
                {children}
              </motion.div>
            </CloseCtx.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
}

export function DropdownMenuItem({ onClick, children, danger = false }: DropdownMenuItemProps) {
  const close = useContext(CloseCtx);
  return (
    <motion.button
      variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
      onClick={() => {
        close();
        onClick?.();
      }}
      className={cn(
        'group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-150',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-900',
      )}
      role="menuitem"
    >
      <span className="flex items-center transition-transform duration-200 group-hover:translate-x-0.5">{children}</span>
    </motion.button>
  );
}
