'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import { homeFor } from '@/lib/roles';
import { fullName, initials } from '@/lib/format';
import { useDashboardNavStats } from '@/lib/hooks/dashboard';
import { Tooltip } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Users,
  CalendarOff,
  Palette,
  Clapperboard,
  Network,
  Megaphone,
  LayoutGrid,
  ScrollText,
  Settings,
  Clock,
  ChevronDown,
  ChevronsLeft,
  ChevronLeft,
  ClipboardCheck,
  LogOut,
  X,
  AlertCircle,
  Layers,
  MessageCircle,
  UserRoundCog,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: any;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function navFor(role: string): NavSection[] {
  switch (role) {
    case 'admin':
      return [
        {
          title: 'Main',
          items: [
            { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
            { name: 'Tasks', href: '/tasks', icon: CheckSquare },
            { name: 'Projects', href: '/projects', icon: FolderKanban },
            { name: 'Client access', href: '/client-accounts', icon: UserRoundCog },
            { name: 'Client messages', href: '/client-messages', icon: MessageCircle },
            { name: 'Issues', href: '/issues', icon: AlertCircle },
            { name: 'Templates', href: '/templates', icon: Layers },
          ],
        },
        {
          title: 'Approvals',
          items: [
            { name: 'Creative Approval', href: '/creative', icon: Palette },
            { name: 'Video', href: '/video', icon: Clapperboard },
          ],
        },
        {
          title: 'Organization',
          items: [
            { name: 'Departments', href: '/departments', icon: Network },
            { name: 'Employees', href: '/employees', icon: Users },
            { name: 'Leave', href: '/leave', icon: CalendarOff },
            { name: 'Attendance', href: '/attendance', icon: Clock },
            { name: 'Announcements', href: '/announcements', icon: Megaphone },
          ],
        },
        {
          title: 'System',
          items: [
            { name: 'Modules', href: '/modules', icon: LayoutGrid },
            { name: 'Audit Logs', href: '/audit', icon: ScrollText },
            { name: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    case 'manager':
      return [
        {
          title: 'Main',
          items: [
            { name: 'Dashboard', href: '/manager', icon: LayoutDashboard },
            { name: 'Tasks', href: '/tasks', icon: CheckSquare },
            { name: 'Projects', href: '/projects', icon: FolderKanban },
            { name: 'Client messages', href: '/client-messages', icon: MessageCircle },
            { name: 'Issues', href: '/issues', icon: AlertCircle },
            { name: 'Templates', href: '/templates', icon: Layers },
          ],
        },
        {
          title: 'Approvals',
          items: [
            { name: 'Creative Approval', href: '/creative', icon: Palette },
            { name: 'Video', href: '/video', icon: Clapperboard },
          ],
        },
        {
          title: 'Workspace',
          items: [
            { name: 'Leave', href: '/leave', icon: CalendarOff },
            { name: 'Attendance', href: '/attendance', icon: Clock },
            { name: 'Announcements', href: '/announcements', icon: Megaphone },
            { name: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    case 'hr':
      return [
        {
          title: 'Main',
          items: [
            { name: 'Dashboard', href: '/hr', icon: LayoutDashboard },
            { name: 'Employees', href: '/employees', icon: Users },
            { name: 'Departments', href: '/departments', icon: Network },
          ],
        },
        {
          title: 'Workforce',
          items: [
            { name: 'Leave', href: '/leave', icon: CalendarOff },
            { name: 'Attendance', href: '/attendance', icon: Clock },
            { name: 'Announcements', href: '/announcements', icon: Megaphone },
            { name: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    default:
      return [
        {
          title: 'My Work',
          items: [
            { name: 'Dashboard', href: '/employee', icon: LayoutDashboard },
            { name: 'My Tasks', href: '/tasks', icon: CheckSquare },
            { name: 'Issues', href: '/issues', icon: AlertCircle },
          ],
        },
        {
          title: 'Resources',
          items: [
            { name: 'Templates', href: '/templates', icon: Layers },
          ],
        },
        {
          title: 'Approvals',
          items: [
            { name: 'Creative Approval', href: '/creative', icon: Palette },
            { name: 'Video', href: '/video', icon: Clapperboard },
          ],
        },
        {
          title: 'Workspace',
          items: [
            { name: 'Leave', href: '/leave', icon: CalendarOff },
            { name: 'Attendance', href: '/attendance', icon: Clock },
            { name: 'Announcements', href: '/announcements', icon: Megaphone },
            { name: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
  }
}

function useIsDesktop() {
  // Sidebar only renders client-side (after auth resolves), so reading matchMedia here is safe.
  const [desktop, setDesktop] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

interface SidebarProps {
  isMobileSidebarOpen?: boolean;
  setIsMobileSidebarOpen?: (open: boolean) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const EXPANDED = 248;
const COLLAPSED = 84;

export function Sidebar({ isMobileSidebarOpen = false, setIsMobileSidebarOpen, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { logout, user, role } = useAuth();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const navigation = navFor(role);
  const home = homeFor(role);
  const desktop = useIsDesktop();
  const mini = collapsed && desktop;
  const { data: stats } = useDashboardNavStats();

  // Live counters from real dashboard stats (only shown when > 0)
  const badges: Record<string, number | undefined> = {
    '/tasks': role === 'admin' || role === 'manager' ? stats?.approvals?.inReview : undefined,
    '/creative': stats?.approvals?.pendingCreatives,
    '/video': stats?.approvals?.pendingVideos,
    '/leave': role === 'admin' || role === 'hr' ? stats?.hr?.pendingLeave : undefined,
  };

  const toggleSection = (title: string) =>
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <motion.aside
      initial={false}
      animate={{ width: desktop ? (mini ? COLLAPSED : EXPANDED) : EXPANDED, x: desktop || isMobileSidebarOpen ? 0 : -EXPANDED - 8 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      id="primary-navigation"
      aria-label="Primary navigation"
      aria-hidden={!desktop && !isMobileSidebarOpen}
      inert={!desktop && !isMobileSidebarOpen}
      className="fixed inset-y-0 left-0 z-50 flex max-h-dvh max-w-[88vw] flex-col overflow-hidden lg:relative"
    >
      {/* Navy background with soft ambient light */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0B1220_0%,#0B1220_50%,#0B1220_100%)]" />
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-brand-500/[0.12] blur-[90px] animate-float" />
      <div className="pointer-events-none absolute -right-24 top-1/2 h-64 w-64 rounded-full bg-brand-500/[0.08] blur-[90px] animate-float" style={{ animationDelay: '-3s' }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/[0.06]" />

      {/* Brand */}
      <div className={cn('relative flex h-[68px] shrink-0 items-center', mini ? 'justify-center px-0' : 'justify-between pl-4 pr-3')}>
        <Link href={home} className="group flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: -8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_8px_22px_-6px_rgba(0,168,120,0.75),inset_0_1px_0_rgba(255,255,255,0.3)]"
          >
            <ClipboardCheck className="h-5 w-5 text-white" strokeWidth={2.2} />
          </motion.div>
          <AnimatePresence initial={false}>
            {!mini && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <h1 className="text-[16px] font-extrabold leading-none tracking-wide text-white">LOOPLI</h1>
                <p className="mt-1 text-[11.5px] leading-none text-gray-400">{role === 'hr' ? 'HR' : role.charAt(0).toUpperCase() + role.slice(1)} Panel</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
        {!mini && (
          <motion.button
            onClick={onToggleCollapsed}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.9 }}
            className="hidden rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:block"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>
        )}
        <button
          onClick={() => setIsMobileSidebarOpen?.(false)}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <LayoutGroup id="sidebar">
        <nav className="sidebar-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {navigation.map((section, sIdx) => {
            const isCollapsed = !mini && collapsedSections[section.title];
            return (
              <div key={section.title} className="mb-3">
                {mini ? (
                  sIdx > 0 && <div className="mx-auto mb-2 h-px w-8 bg-white/10" />
                ) : (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="group flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500 transition-colors hover:text-gray-300"
                  >
                    <span>{section.title}</span>
                    <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                    </motion.span>
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 space-y-1">
                        {section.items.map((item, idx) => {
                          const isActive =
                            item.href === '/'
                              ? pathname === '/'
                              : pathname === item.href || pathname.startsWith(item.href + '/');
                          const Icon = item.icon;
                          const badge = badges[item.href];
                          return (
                            <Tooltip key={item.name} content={item.name} disabled={!mini}>
                              <motion.div
                                initial={{ opacity: 0, x: -14 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.04 * idx + 0.05 * sIdx, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <Link
                                  href={item.href}
                                  onClick={() => setIsMobileSidebarOpen?.(false)}
                                  className={cn(
                                    'group/item relative flex min-h-10 items-center gap-3 rounded-xl py-2.5 text-[13.5px] font-medium transition-colors duration-200',
                                    mini ? 'justify-center px-0' : 'px-3',
                                    isActive ? 'text-white' : 'text-gray-300/80 hover:text-white',
                                  )}
                                >
                                  {isActive && (
                                    <motion.span
                                      layoutId="sidebar-active"
                                      className="absolute inset-0 rounded-xl border border-brand-400/60 bg-[linear-gradient(90deg,rgba(0,168,120,0.32),rgba(0,168,120,0.14))] shadow-[0_0_0_1px_rgba(0,168,120,0.15),0_0_22px_-4px_rgba(0,168,120,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
                                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                    />
                                  )}
                                  {!isActive && <span className="absolute inset-0 rounded-xl bg-white/0 transition-colors duration-200 group-hover/item:bg-white/[0.06]" />}
                                  <motion.span
                                    className={cn(
                                      'relative flex h-6 w-6 shrink-0 items-center justify-center transition-colors duration-300',
                                      isActive ? 'text-brand-300' : 'text-gray-400 group-hover/item:text-brand-300',
                                    )}
                                    whileHover={{ rotate: -12, scale: 1.18 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 14 }}
                                  >
                                    <Icon className="h-[18px] w-[18px]" />
                                    {mini && !!badge && badge > 0 && (
                                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-[#0B1220]" />
                                    )}
                                  </motion.span>
                                  {!mini && <span className="relative flex-1 truncate">{item.name}</span>}
                                  {!mini && !!badge && badge > 0 && (
                                    <motion.span
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                      className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_12px_-2px_rgba(0,168,120,0.8)]"
                                    >
                                      {badge}
                                    </motion.span>
                                  )}
                                </Link>
                              </motion.div>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </LayoutGroup>

      {/* Expand toggle (collapsed desktop) */}
      {mini && (
        <Tooltip content="Expand sidebar">
          <motion.button
            onClick={onToggleCollapsed}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.9 }}
            className="relative mx-auto mb-2 hidden h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:flex"
            aria-label="Expand sidebar"
          >
            <ChevronsLeft className="h-4 w-4 rotate-180" />
          </motion.button>
        </Tooltip>
      )}

      {/* User card */}
      <div className="relative p-3">
        <div className={cn('group flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07] transition-all duration-300 hover:bg-white/[0.07] hover:ring-brand-400/20', mini && 'flex-col p-2')}>
          <div className="avatar relative h-9 w-9 shrink-0 text-xs">
            {initials(user?.firstName, user?.lastName)}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-brand-400 ring-2 ring-[#0B1220]">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-60" />
            </span>
          </div>
          {!mini && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-gray-100">{fullName(user)}</p>
              <p className="truncate text-[11px] text-gray-500">{user?.primaryRole ?? user?.email}</p>
            </div>
          )}
          <Tooltip content="Log out" disabled={!mini}>
            <motion.button
              onClick={logout}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </Tooltip>
        </div>
      </div>
    </motion.aside>
  );
}
