'use client';

import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';

const DISMISS_KEY = 'looply_ios_banner_dismissed';

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
  return iOS && !standalone;
}

export function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (isIosSafari() && !localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-white/10 bg-gray-900/95 p-3.5 shadow-2xl backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="LOOPLY" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Install LOOPLY on your iPhone</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-300">
            Tap the
            <Share className="inline h-3.5 w-3.5 text-brand-400" />
            Share icon, then select <span className="font-medium text-white">&ldquo;Add to Home Screen&rdquo;</span>
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
            setVisible(false);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
