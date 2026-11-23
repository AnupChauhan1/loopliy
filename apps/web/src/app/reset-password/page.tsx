'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <div>
          <XCircleIcon />
          <p className="mt-4 text-sm text-gray-600">This reset link is invalid or incomplete.</p>
          <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md animate-fade-in-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-brand-500/25">
            <span className="text-sm font-bold text-white">LO</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900 tracking-tight">Choose a new password</h1>
        </div>
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-brand-500" />
            <p className="mt-3 text-sm text-gray-600">Your password has been updated.</p>
            <Link href="/login" className="mt-5 inline-block rounded-xl gradient-brand-btn px-6 py-2.5 text-sm font-medium text-white">Sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-[13px] font-medium text-rose-700">{error}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">New password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function XCircleIcon() {
  return <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}>
      <ResetInner />
    </Suspense>
  );
}
