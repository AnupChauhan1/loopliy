'use client';

import { Bell, Search, Plus, Menu, Command, CheckCheck, Clock, LogOut, Settings, User as UserIcon, ChevronDown, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { fullName, initials, timeAgo, avatarSrc } from '@/lib/format';
import { notificationMeta } from '@/lib/notification-meta';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast, errorMessage } from '@/components/ui/toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TimeTrackerButton } from '@/components/time-tracker';
import { usePwaInstall } from '@/lib/pwa-install-provider';
import { LooplyLogo } from '@/components/LooplyLogo';

interface HeaderProps {
  setIsMobileSidebarOpen?: (open: boolean) => void;
  isMobileSidebarOpen?: boolean;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

const popover = {
  initial: { opacity: 0, y: -10, scale: 0.95, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
  exit: { opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.16 } },
  transition: { type: 'spring' as const, stiffness: 420, damping: 32 },
};

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const bell = useAnimationControls();
  const prevUnread = useRef<number | undefined>(undefined);
  useClickOutside(ref, () => setOpen(false));

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count as number),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60000 : false,
  });
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get('/notifications').then((r) => r.data as any[]),
    enabled: open,
  });

  // Ring the bell when new notifications arrive
  useEffect(() => {
    if (unread !== undefined && prevUnread.current !== undefined && unread > prevUnread.current) {
      bell.start({ rotate: [0, 18, -16, 12, -8, 4, 0], transition: { duration: 0.9 } });
    }
    prevUnread.current = unread;
  }, [unread, bell]);

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('All caught up', 'Every notification was marked as read.');
    },
    onError: (e) => toast.error('Could not mark as read', errorMessage(e)),
  });

  const openNotification = async (n: any) => {
    setOpen(false);
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (n.data?.link) router.push(n.data.link);
  };

  const list = (notifications ?? []).filter((n) => tab === 'all' || !n.read);
  const unreadCount = unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onHoverStart={() => bell.start({ rotate: [0, 14, -10, 6, 0], transition: { duration: 0.6 } })}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800',
          open && 'bg-gray-100 text-gray-800',
        )}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <motion.span animate={bell} style={{ originX: 0.5, originY: 0.1 }} className="flex">
          <Bell className="h-5 w-5" />
        </motion.span>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 15 }}
              className="absolute right-1 top-1"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-50" />
              <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...popover}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_30px_70px_-25px_rgba(17,24,39,0.45)] ring-1 ring-gray-900/5 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Notifications</p>
                <p className="text-[11px] text-gray-500">{unreadCount} unread</p>
              </div>
              <Segmented
                size="sm"
                value={tab}
                onChange={setTab}
                options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unreadCount }]}
              />
            </div>
            <div className="max-h-[24rem] overflow-y-auto p-1.5">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}
                </div>
              ) : list.length === 0 ? (
                <EmptyState animation="bell" compact size={100} title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
              ) : (
                <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
                  {list.map((n) => {
                    const meta = notificationMeta(n.type);
                    const Icon = meta.icon;
                    return (
                      <motion.button
                        key={n.id}
                        variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                        onClick={() => openNotification(n)}
                        className={cn('group relative flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-gray-50', !n.read && 'bg-brand-50/50')}
                      >
                        {!n.read && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-gradient-to-b from-brand-400 to-brand-400" />}
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6', meta.tile)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-[13px]', n.read ? 'font-medium text-gray-600' : 'font-semibold text-gray-900')}>{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.message}</p>
                          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-gray-400"><Clock className="h-3 w-3" /> {timeAgo(n.createdAt)}</p>
                        </div>
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(0,168,120,0.8)]" />}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
              <button
                onClick={() => markAll.mutate()}
                disabled={!unreadCount || markAll.isPending}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 transition hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-600 hover:text-gray-900">
                View all →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { canInstall, installApp } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="group flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-gray-100/80">
        <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white shadow-[0_6px_14px_-4px_rgba(0,168,120,0.7)] transition-transform group-hover:scale-105">
          {avatarSrc(user?.avatar) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc(user?.avatar)!} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(user?.firstName, user?.lastName)
          )}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-brand-400 ring-2 ring-white" />
        </span>
        <span className="hidden text-left md:block">
          <span className="block text-[13px] font-bold leading-tight text-gray-900">{fullName(user)}</span>
          <span className="block text-[11px] leading-tight text-gray-500">{user?.primaryRole}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="hidden md:block">
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popover} style={{ transformOrigin: 'top right' }} className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-[0_30px_70px_-25px_rgba(17,24,39,0.45)] ring-1 ring-gray-900/5 backdrop-blur-xl">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-bold text-gray-900">{fullName(user)}</p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-gray-100" />
            <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:pl-4">
              <Settings className="h-4 w-4" /> Settings
            </Link>
            <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:pl-4">
              <UserIcon className="h-4 w-4" /> Notifications
            </Link>
            {canInstall && (
              <button
                onClick={() => {
                  setOpen(false);
                  void installApp().catch((error: unknown) => console.error('Could not install LOOPLY.', error));
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50 hover:pl-4"
              >
                <Download className="h-4 w-4" /> Install app
              </button>
            )}
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 hover:pl-4">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header({ setIsMobileSidebarOpen, isMobileSidebarOpen = false }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { role } = useAuth();
  const router = useRouter();

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-gray-200/70 bg-white/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:gap-3 sm:px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsMobileSidebarOpen?.(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 lg:hidden"
          aria-label="Open menu"
          aria-controls="primary-navigation"
          aria-expanded={isMobileSidebarOpen}
        >
          <Menu className="h-5 w-5" />
        </motion.button>
        <Link href="/" className="flex shrink-0 items-center overflow-hidden lg:hidden" aria-label="Looply home">
          <LooplyLogo animate={false} size="sm" theme="light" />
        </Link>
        <div className="group relative hidden min-w-0 w-full max-w-[22rem] transition-[max-width] duration-300 focus-within:max-w-[28rem] sm:block">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand-500" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search CRM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchQuery && router.push(`/tasks?search=${encodeURIComponent(searchQuery)}`)}
            className="w-full rounded-xl border border-gray-200/80 bg-gray-50/80 py-2.5 pl-10 pr-14 text-sm text-gray-900 placeholder-gray-400 transition-all duration-300 focus:border-brand-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,168,120,0.12),0_8px_20px_-10px_rgba(0,168,120,0.4)] focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-5 -translate-y-1/2 items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 text-[10px] font-semibold text-gray-400 md:inline-flex">
            <Command className="h-3 w-3" />K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-3">
        {(role === 'admin' || role === 'manager') && (
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/tasks?create=1')}
            className="group gradient-brand-btn hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold lg:inline-flex lg:px-4"
          >
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
            <span className="hidden lg:inline">New Task</span>
          </motion.button>
        )}
        <TimeTrackerButton />
        <NotificationsMenu />
        <div className="hidden h-7 w-px bg-gray-200 sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
