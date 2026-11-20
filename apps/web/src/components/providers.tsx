'use client';

import { MotionConfig } from 'motion/react';
import { ToastProvider } from '@/components/ui/toast';

export function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
