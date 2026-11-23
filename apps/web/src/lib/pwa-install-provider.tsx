'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share, PlusSquare, Download, X, MonitorSmartphone, Compass, Copy, Check } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallContextValue {
  canInstall: boolean;
  isIos: boolean;
  installApp: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectIos() {
  if (typeof navigator === 'undefined') return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone;
}

function isNonSafariIos() {
  return /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(navigator.userAgent);
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );
  const [isIos, setIsIos] = useState(false);
  const [modal, setModal] = useState<'ios' | 'generic' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsIos(detectIos());
    const displayMode = window.matchMedia('(display-mode: standalone)');

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    const handleDisplayModeChange = (event: MediaQueryListEvent) => setIsInstalled(event.matches);

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener('change', handleDisplayModeChange);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        console.error('Could not register the LOOPLY service worker.', error);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const installApp = async () => {
    if (isIos) {
      setModal('ios');
      return;
    }
    if (!installPrompt) {
      setModal('generic');
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setIsInstalled(true);
  };

  // Always offer install unless the app is already running standalone
  const canInstall = !isInstalled;

  const modalNode = modal && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="relative z-[10000] w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModal(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {modal === 'ios' ? (
              isNonSafariIos() ? (
                <>
                  <div className="flex items-center gap-3 pr-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/icon-192.png" alt="LOOPLY" className="h-12 w-12 rounded-2xl shadow-md" />
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Open in Safari to Install on iPhone</h3>
                      <p className="text-xs text-gray-500">iOS only allows installing web apps from Safari</p>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.origin);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      } catch {
                        setCopied(false);
                      }
                    }}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-brand-btn text-sm font-semibold text-white shadow-md shadow-brand-500/25"
                  >
                    {copied ? <><Check className="h-4 w-4" /> Copied! Now paste in Safari</> : <><Copy className="h-4 w-4" /> Copy App Link</>}
                  </button>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                        <Compass className="h-5 w-5" />
                      </span>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Step 1:</span> Open <span className="font-semibold">Safari</span> (blue compass icon) and paste the copied link
                      </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                        <Share className="h-5 w-5" />
                      </span>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Step 2:</span> Tap the <span className="font-semibold">Share</span> icon at the bottom → <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span> → <span className="font-semibold">Add</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setModal(null)}
                    className="mt-5 h-10 w-full rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Close
                  </button>
                </>
              ) : (
              <>
                <div className="flex items-center gap-3 pr-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/icon-192.png" alt="LOOPLY" className="h-12 w-12 rounded-2xl shadow-md" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Install LOOPLY on your iPhone</h3>
                    <p className="text-xs text-gray-500">Add it to your Home Screen for the full app experience</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                      <Share className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Step 1:</span> Tap the <span className="font-semibold">Share</span> icon <Share className="mx-0.5 inline h-3.5 w-3.5 text-brand-600" /> at the bottom center of Safari
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                      <PlusSquare className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Step 2:</span> Scroll down and tap <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                      <Download className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Step 3:</span> Tap <span className="font-semibold">Add</span> in the top-right corner to install LOOPLY
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setModal(null)}
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-brand-btn text-sm font-semibold text-white shadow-md shadow-brand-500/25"
                >
                  <Download className="h-4 w-4" /> Got it
                </button>
              </>
              )
            ) : (
              <>
                <div className="flex items-center gap-3 pr-8">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <MonitorSmartphone className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Install LOOPLY</h3>
                    <p className="text-xs text-gray-500">Add LOOPLY to your device for quick access</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-600">
                  Your browser hasn&apos;t offered the install prompt yet. Look for the{' '}
                  <span className="font-semibold">install icon in the address bar</span> (desktop) or{' '}
                  <span className="font-semibold">browser menu → Install app / Add to Home screen</span> (mobile).
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => { setModal(null); void installApp(); }}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl gradient-brand-btn text-sm font-semibold text-white shadow-md shadow-brand-500/25"
                  >
                    <Download className="h-4 w-4" /> Install Now
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="h-11 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <PwaInstallContext.Provider value={{ canInstall, isIos, installApp }}>
      {children}
      {modalNode}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error('usePwaInstall must be used within a PwaInstallProvider');
  return context;
}
