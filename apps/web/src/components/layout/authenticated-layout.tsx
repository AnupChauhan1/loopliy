'use client';

import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { TimeTrackerProvider } from '@/lib/time-tracker';
import { ClientPortalLayout } from './client-portal-layout';

function AuroraBackground() {
  return <div className="aurora" aria-hidden />;
}

/** Feeds the cursor position to the hovered .card-premium for its spotlight effect. */
function useCardSpotlight() {
  useEffect(() => {
    let raf = 0;
    let activeCard: HTMLElement | null = null;
    const cardFor = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest('.card-premium') as HTMLElement | null) : null;
    const onOver = (e: PointerEvent) => {
      activeCard = cardFor(e.target);
    };
    const onOut = (e: PointerEvent) => {
      const nextCard = cardFor(e.relatedTarget);
      if (nextCard !== activeCard) activeCard = nextCard;
    };
    const onMove = (e: PointerEvent) => {
      const card = activeCard;
      if (!card) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!card.isConnected) {
          activeCard = null;
          return;
        }
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
}

function BootScreen() {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-2">
      <AuroraBackground />
      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="h-28 w-28 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"
          role="status"
          aria-label="Loading workspace"
        />
        <p className="mt-1 text-lg font-bold tracking-tight text-gray-900">
          LOOPLY <span className="gradient-text-animated">Workspace</span>
        </p>
        <motion.p
          className="mt-1 text-sm text-gray-500"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          Preparing your dashboard…
        </motion.p>
      </motion.div>
    </div>
  );
}

const COLLAPSE_KEY = 'sidebar_collapsed';

/** Scrollable content area with a scroll-progress bar (mounted only with the app shell). */
function MainArea({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container: mainRef });
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return (
    <>
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-16 z-30 h-[2px] origin-left bg-gradient-to-r from-brand-400 via-brand-400 to-brand-500"
        style={{ scaleX: progress }}
      />
      <main ref={mainRef} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full min-w-0 max-w-[1600px] p-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-4 md:p-6"
        >
          {children}
        </motion.div>
      </main>
    </>
  );
}

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useCardSpotlight();

  // Check if user is on login page
  const isLoginPage = pathname === '/login' || pathname === '/client-login';

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });

  // Close sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileSidebarOpen(false);
    };
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileSidebarOpen(false);
    };
    const previousOverflow = document.body.style.overflow;

    if (!desktopQuery.matches) document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    desktopQuery.addEventListener('change', closeOnDesktop);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      desktopQuery.removeEventListener('change', closeOnDesktop);
    };
  }, [isMobileSidebarOpen]);

  // Redirect to login if not authenticated and not on login page
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      window.location.href = '/login';
    }
  }, [isAuthenticated, isLoading, isLoginPage]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || isLoginPage) return;
    const isClientArea = pathname === '/client' || pathname.startsWith('/client/');
    if (role === 'client' && !isClientArea && !isLoginPage) router.replace('/client');
    if (role !== 'client' && isClientArea) router.replace('/');
    if (isAuthenticated && pathname === '/client-login') router.replace(role === 'client' ? '/client' : '/');
  }, [isAuthenticated, isLoading, isLoginPage, pathname, role, router]);

  // Show loading state
  if (isLoading) return <BootScreen />;

  // If on login page, show only children (the login page itself)
  if (isLoginPage) {
    return <>{children}</>;
  }

  // If not authenticated, show nothing (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  if (role === 'client') {
    const isClientArea = pathname === '/client' || pathname.startsWith('/client/');
    return isClientArea ? <ClientPortalLayout>{children}</ClientPortalLayout> : null;
  }

  // If authenticated, show the main layout
  return (
    <TimeTrackerProvider>
    <div className="relative flex h-dvh min-h-0">
      <AuroraBackground />

      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 cursor-default bg-gray-950/50 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <Sidebar
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      {/* Main content */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header isMobileSidebarOpen={isMobileSidebarOpen} setIsMobileSidebarOpen={setIsMobileSidebarOpen} />
        <MainArea pathname={pathname}>{children}</MainArea>
      </div>
    </div>
    </TimeTrackerProvider>
  );
}
