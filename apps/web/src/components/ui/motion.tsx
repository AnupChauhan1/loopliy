'use client';

import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';

export const spring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 220, damping: 26 } as const;
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.98, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.6, ease: easeOutExpo }, transitionEnd: { filter: 'none' } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

export const staggerContainer = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Container that cascades its <StaggerItem> children in on mount. */
export function Stagger({
  className,
  stagger = 0.06,
  delay = 0,
  children,
  ...rest
}: HTMLMotionProps<'div'> & { stagger?: number; delay?: number }) {
  return (
    <motion.div className={className} variants={staggerContainer(stagger, delay)} initial="hidden" animate="show" {...rest}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div className={className} variants={fadeUp} {...rest}>
      {children}
    </motion.div>
  );
}

/** Scroll-triggered reveal. */
export function Reveal({ className, delay = 0, children, ...rest }: HTMLMotionProps<'div'> & { delay?: number }) {
  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 28, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: easeOutExpo }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
