'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Bell,
  FolderKanban,
  Images,
  LogOut,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';

const NAV = [
  { href: '/client', label: 'Dashboard', icon: FolderKanban, exact: true },
  { href: '/client/chat', label: 'Messages', icon: MessageCircle },
  { href: '/client/approvals', label: 'Approvals', icon: ShieldCheck },
  { href: '/client/files', label: 'Files & Media', icon: Images },
  { href: '/client/calls', label: 'Calls', icon: Phone },
  { href: '/client/notifications', label: 'Notifications', icon: Bell },
  { href: '/client/profile', label: 'My Profile', icon: User },
];

export function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <div className="flex min-h-dvh bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-100 px-5 py-5">
          <p className="text-xl font-bold tracking-tight text-gray-900">LOOPLY</p>
          <p className="text-xs text-gray-500">Client Portal</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(isActive(item.href, item.exact))}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <p className="truncate px-3 pb-2 text-xs text-gray-400">
            {user?.firstName} {user?.lastName}
          </p>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 md:hidden">
            <div>
              <p className="text-base font-bold text-gray-900">LOOPLY</p>
              <p className="text-[11px] text-gray-500">Client Portal</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Sign out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  isActive(item.href, item.exact) ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
