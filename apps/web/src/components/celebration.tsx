'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { ActiveCelebration } from '@/lib/celebration-context';

interface CelebrationProps {
  celebration: ActiveCelebration | null;
  onComplete?: () => void;
}

const VISIBLE_MS = 2600;
const EMOJIS = ['🥳', '🎉', '🔥', '🚀', '🤩'];
const COLORS = ['#00A878', '#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#F38181', '#FB923C'];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function makeParticles(reduced: boolean) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const reach = Math.min(w, h);
  const confetti = Array.from({ length: reduced ? 16 : w < 640 ? 36 : 60 }, () => {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(0.25, 0.6) * reach;
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - reach * 0.15,
      fall: rand(0.35, 0.6) * h,
      spin: rand(-900, 900),
      color: pick(COLORS),
      w: rand(6, 11),
      h: rand(8, 16),
      round: Math.random() > 0.65,
      delay: rand(0, 0.15),
    };
  });
  const emojis = Array.from({ length: reduced ? 4 : w < 640 ? 7 : 11 }, (_, i) => ({
    emoji: EMOJIS[i % EMOJIS.length],
    left: rand(6, 94),
    rise: rand(0.35, 0.7) * h,
    bounce: rand(0.05, 0.1) * h,
    drift: rand(-60, 60),
    spin: pick([-360, 360, 720, -720]),
    size: rand(0.85, 1.25),
    delay: rand(0, 0.45),
  }));
  return { confetti, emojis };
}

function Burst({ celebration, reduced }: { celebration: ActiveCelebration; reduced: boolean }) {
  const [{ confetti, emojis }] = useState(() => makeParticles(reduced));
  const duration = VISIBLE_MS / 1000;
  const title = celebration.kind === 'completed' ? 'Task Complete!' : 'Submitted!';

  return (
    <motion.div
      className="fixed inset-0 z-[10000] overflow-hidden pointer-events-none"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      aria-live="polite"
      role="status"
    >
      {/* Confetti burst from the centre, then gravity */}
      {confetti.map((c, i) => (
        <motion.span
          key={`c-${i}`}
          className="absolute left-1/2 top-[42%]"
          style={{ width: c.w, height: c.round ? c.w : c.h, backgroundColor: c.color, borderRadius: c.round ? '50%' : 2 }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{
            x: [0, c.dx, c.dx * 1.15],
            y: [0, c.dy, c.dy + c.fall],
            opacity: [1, 1, 0],
            rotate: reduced ? 0 : c.spin,
            scale: 1,
          }}
          transition={{ duration, delay: c.delay, times: [0, 0.3, 1], ease: 'easeOut' }}
        />
      ))}

      {/* Emojis jump up from the bottom, bounce, spin and fade */}
      {emojis.map((e, i) => (
        <motion.span
          key={`e-${i}`}
          className="absolute top-full select-none leading-none"
          style={{ left: `${e.left}%`, fontSize: `calc(clamp(2rem, 9vw, 3.5rem) * ${e.size})`, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))' }}
          initial={{ y: 0, x: '-50%', opacity: 0, scale: 0.3, rotate: 0 }}
          animate={{
            y: [0, -e.rise, -e.rise + e.bounce, -e.rise - e.bounce * 0.4, -e.rise + e.bounce * 0.6],
            x: ['-50%', `calc(-50% + ${e.drift}px)`],
            opacity: [0, 1, 1, 1, 0],
            scale: [0.3, 1.3, 0.95, 1.1, 0.8],
            rotate: reduced ? 0 : [0, 20, -20, e.spin],
          }}
          transition={{ duration: duration - e.delay, delay: e.delay, ease: 'easeOut' }}
        >
          {e.emoji}
        </motion.span>
      ))}

      {/* Dialogue card */}
      <div className="absolute inset-x-0 top-[38%] flex justify-center px-4">
        <motion.div
          className="max-w-[min(92vw,34rem)] rounded-3xl border border-white/60 bg-white/85 px-5 py-4 text-center shadow-2xl shadow-brand-500/20 backdrop-blur-md sm:px-8 sm:py-5 dark:border-white/10 dark:bg-gray-900/85"
          initial={{ opacity: 0, scale: 0.3, y: 40 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.12, 1, 0.92], y: [40, 0, 0, -20] }}
          transition={{ duration, times: [0, 0.18, 0.82, 1], ease: 'easeOut' }}
        >
          <motion.div
            className="text-[clamp(1.6rem,7vw,2.6rem)] font-extrabold leading-tight tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #00A878 0%, #00C896 45%, #FFB800 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
            animate={reduced ? undefined : { rotate: [0, -4, 4, -3, 3, 0] }}
            transition={{ duration: 0.6, delay: 0.3, repeat: 1, repeatDelay: 0.25 }}
          >
            {celebration.kind === 'completed' ? '🎉 ' : '📨 '}
            <span>{title}</span>
            {celebration.kind === 'completed' ? ' 🎉' : ''}
          </motion.div>
          <p className="mt-1.5 text-[clamp(0.95rem,3.8vw,1.2rem)] font-semibold text-gray-700 break-words dark:text-gray-200">
            {celebration.kind === 'submitted' ? 'Sent for review — fingers crossed! 🤞' : 'Ek aur task done! 🥳🔥'}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Shown when a task completes but no celebration recording has been uploaded yet. */
function MissingVoiceNotice({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-x-3 bottom-4 z-[10001] mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xl sm:bottom-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>🎙️</span>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-amber-900">No celebration recording yet</p>
          <p className="mt-0.5 text-amber-800">Record or upload your own voice so it plays every time you complete a task.</p>
          <Link href="/settings#my-voice" onClick={onClose} className="mt-2 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            Upload / Record My Voice
          </Link>
        </div>
        <button onClick={onClose} className="text-amber-700 hover:text-amber-900" aria-label="Dismiss">✕</button>
      </div>
    </motion.div>
  );
}

export default function Celebration({ celebration, onComplete }: CelebrationProps) {
  const reduced = !!useReducedMotion();
  const [noticeFor, setNoticeFor] = useState<number | null>(null);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => onComplete?.(), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [celebration, onComplete]);

  // The notice outlives the 2.6s animation so there is time to read it and click through
  const notice = celebration?.missingVoice ? celebration.id : noticeFor;
  useEffect(() => {
    if (!celebration?.missingVoice) return;
    const id = celebration.id;
    const show = setTimeout(() => setNoticeFor(id), 0);
    const hide = setTimeout(() => setNoticeFor((cur) => (cur === id ? null : cur)), 9000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [celebration]);

  return (
    <>
      <AnimatePresence>
        {celebration && <Burst key={celebration.id} celebration={celebration} reduced={reduced} />}
      </AnimatePresence>
      <AnimatePresence>
        {notice !== null && <MissingVoiceNotice key={`notice-${notice}`} onClose={() => setNoticeFor(null)} />}
      </AnimatePresence>
    </>
  );
}
