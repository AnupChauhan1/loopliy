'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { panelRoleOf } from '@/lib/roles';
import { Loader2, Lock, Mail } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export default function ClientLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');
      const role = panelRoleOf(data.user.roles, data.user.primaryRole);
      if (role !== 'client') {
        throw new Error('This portal is for client accounts only. Team members should use the staff login.');
      }
      await login(data.token, data.user);
      router.push('/client');
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
    <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-4 py-10">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-brand-400/10 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-3xl font-bold tracking-tight text-white">LOOPLY</p>
          <p className="mt-1 text-sm text-gray-400">Client Portal — sign in to your workspace</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-lg font-semibold text-gray-900">Client sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Use the email and password provided by your LOOPLY team.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="you@company.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="••••••••"
                />
              </div>
            </div>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-500">
            Team member?{' '}
            <a href="/login" className="font-medium text-brand-600 hover:underline">Use the staff login</a>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">LOOPLY Client Portal · Secure access</p>
      </div>
    </div>
  );
}
