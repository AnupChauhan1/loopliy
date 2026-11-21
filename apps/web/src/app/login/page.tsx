'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Mail, Lock, AlertCircle, CheckCircle2, Loader2, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { panelRoleOf, homeFor } from '@/lib/roles';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

const features = [
  'Projects, tasks & approvals in one workspace',
  'CRM, invoicing & finance built for agencies',
  'Real-time collaboration with your team & clients',
];

// Public workspace credentials — these accounts are provisioned on the
// backend via the BOOTSTRAP_*_PASSWORD env vars and verified against the
// live auth endpoint. Temporary testing credentials for the designated
// bootstrap accounts only; set NEXT_PUBLIC_SHOW_LOGIN_CREDENTIALS=false
// (or remove this panel) before real production go-live.
const SHOW_CREDENTIALS = process.env.NEXT_PUBLIC_SHOW_LOGIN_CREDENTIALS !== 'false';
const loginCredentials: { role: string; email: string; password: string }[] = SHOW_CREDENTIALS ? [
  { role: 'Admin', email: 'admin@epatang.com', password: 'Admin@Looply2026' },
  { role: 'Manager', email: 'pm@epatang.com', password: 'Manager@Looply2026' },
  { role: 'HR', email: 'hr@epatang.com', password: 'HR@Looply2026' },
  { role: 'Employee', email: 'employee@epatang.com', password: 'Employee@Looply2026' },
  { role: 'Client', email: 'client1795252750436@acme-test.com', password: 'Client@Portal2026' },
] : [];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const [loading, setLoading] = useState(false);

  const copyCredential = async (key: string, value: string) => {
    setCopyError('');
    if (!navigator.clipboard?.writeText) {
      setCopyError('Clipboard access is unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setCopyError('Could not copy this credential. Please select and copy it manually.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      await login(data.token, data.user);
      router.push(homeFor(panelRoleOf(data.user.roles, data.user.primaryRole)));
    } catch (err: unknown) {
      setError(
        err instanceof TypeError
          ? `Unable to reach the API at ${API_URL}. Check that the API server is running, then try again.`
          : err instanceof Error
            ? err.message || 'Login failed. Please try again.'
            : 'Login failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative flex-col justify-between overflow-hidden bg-[#0b1220] p-12">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px] animate-float-slow" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-brand-400/10 blur-[140px] animate-float-slower" />
        <div className="pointer-events-none absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-brand-400/10 blur-[100px] animate-float-slow" style={{ animationDelay: '-4s' }} />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(156,163,175,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(156,163,175,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative flex items-center gap-3 animate-rotate-in">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-brand-500/25 animate-glow-pulse smooth-transition hover:scale-110 cursor-pointer">
            <span className="text-sm font-bold text-white">LO</span>
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">LOOPLY</span>
        </div>

        <div className="relative max-w-md animate-slide-up">
          <h2 className="text-4xl font-semibold text-white leading-[1.15] tracking-tight">
            Run your agency,
            <br />
            <span className="gradient-text-animated">beautifully organized.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-400">
            The all-in-one operating system for digital agencies — from first proposal to final invoice.
          </p>
          <ul className="mt-8 space-y-3.5 stagger">
            {features.map((feature, idx) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-gray-300 smooth-transition hover:text-white hover:translate-x-1" style={{ animationDelay: `${idx * 100}ms` }}>
                <CheckCircle2 className="h-[18px] w-[18px] text-brand-400 shrink-0 animate-icon-pop" style={{ animationDelay: `${idx * 100 + 200}ms` }} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-4 text-xs text-gray-500">
          <span>© 2026 Looply</span>
          <span className="h-1 w-1 rounded-full bg-gray-600" />
          <span>Trusted by modern agencies</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[400px] animate-fade-in-blur">
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center animate-rotate-in">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-brand-500/25 smooth-transition hover:scale-110 cursor-pointer">
              <span className="text-sm font-bold text-white">LO</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 tracking-tight">LOOPLY</span>
          </div>

          <div className="mb-8 animate-fade-in-up">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-500">Sign in to your workspace to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 animate-fade-in">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 animate-icon-pop" />
                <p className="text-[13px] font-medium text-rose-700">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[13px] font-medium text-gray-700">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 smooth-transition" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@epatang.com"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition-all smooth-transition hover:border-brand-300"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[13px] font-medium text-gray-700">
                  Password
                </label>
                <a href="#" className="text-[13px] font-medium text-brand-600 hover:text-brand-700 smooth-transition hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 smooth-transition" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition-all smooth-transition hover:border-brand-300"
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer smooth-transition hover:translate-x-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500/40 smooth-transition"
              />
              <span className="text-[13px] text-gray-600">Keep me signed in</span>
            </label>

            <Button
              type="submit"
              className="w-full h-11 gradient-brand-btn text-white font-medium shadow-md shadow-brand-500/25 border-0 rounded-xl btn-micro"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {loginCredentials.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center">
              Login Credentials
            </p>
            <div className="mt-1.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {loginCredentials.map((account) => {
                const compact = account.role === 'Client';
                return (
                <div key={account.role} className={`rounded-lg bg-white ring-1 ring-gray-100 ${compact ? 'px-2 py-1' : 'px-2 py-1.5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-gray-800`}>{account.role}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                      }}
                      className={`rounded font-semibold text-brand-700 ${compact ? 'bg-brand-50 px-1 py-px text-[8px] hover:bg-brand-100' : 'bg-brand-50 px-1.5 py-0.5 text-[9px] hover:bg-brand-100'}`}
                    >
                      Use
                    </button>
                  </div>
                  <div className={`${compact ? 'mt-0.5 space-y-px' : 'mt-1 space-y-0.5'}`}>
                    <div className="flex items-center gap-1">
                      <p className={`min-w-0 flex-1 truncate text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`} title={account.email}>{account.email}</p>
                      <button
                        type="button"
                        aria-label={`Copy ${account.role} email`}
                        title="Copy email"
                        onClick={() => copyCredential(`${account.role}-email`, account.email)}
                        className={`shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700 ${compact ? 'p-px' : 'p-0.5'}`}
                      >
                        {copied === `${account.role}-email` ? <Check className={compact ? 'h-2.5 w-2.5 text-brand-600' : 'h-3 w-3 text-brand-600'} /> : <Copy className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className={`min-w-0 flex-1 truncate font-mono text-gray-600 ${compact ? 'text-[9px]' : 'text-[10px]'}`} title={account.password}>{account.password}</p>
                      <button
                        type="button"
                        aria-label={`Copy ${account.role} password`}
                        title="Copy password"
                        onClick={() => copyCredential(`${account.role}-password`, account.password)}
                        className={`shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700 ${compact ? 'p-px' : 'p-0.5'}`}
                      >
                        {copied === `${account.role}-password` ? <Check className={compact ? 'h-2.5 w-2.5 text-brand-600' : 'h-3 w-3 text-brand-600'} /> : <Copy className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            {copyError && <p role="status" className="mt-1.5 text-center text-[10px] text-rose-600">{copyError}</p>}
          </div>
          )}

          {loginCredentials.length === 0 && (
            <p className="mt-6 text-center text-[12px] text-gray-500">
              Sign in with the account your administrator created for you.
            </p>
          )}

          <p className="mt-6 text-center text-[13px] text-gray-500">
            Don&apos;t have an account?{' '}
            <a href="#" className="font-medium text-brand-600 hover:text-brand-700 smooth-transition hover:underline">
              Contact your administrator
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
