'use client';

import { motion, AnimatePresence } from 'motion/react';

interface CelebrationBurstProps {
  active: boolean;
}

export function CelebrationBurst({ active }: CelebrationBurstProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2] }}
          exit={{ opacity: 0, scale: 2 }}
          transition={{ duration: 0.8 }}
          style={{
            position: 'absolute',
            inset: -50,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 1, scale: 0 }}
              animate={{
                opacity: [1, 0],
                scale: [0, 1],
                x: [0, Math.cos((i * 30 * Math.PI) / 180) * 100],
                y: [0, Math.sin((i * 30 * Math.PI) / 180) * 100],
              }}
              transition={{ duration: 0.6, delay: i * 0.02 }}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: ['#00A878', '#FFD700', '#FF6B6B', '#4ECDC4'][i % 4],
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
