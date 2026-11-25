'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      setResetToken(data.devResetToken ?? '');
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center overflow-y-auto overflow-x-hidden bg-white px-4 py-8 pb-20">
      <div className="w-full max-w-md animate-fade-in-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-brand-500/25">
            <span className="text-sm font-bold text-white">LO</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900 tracking-tight">Reset password</h1>
          <p className="mt-1.5 text-sm text-gray-500">Enter your email and we&apos;ll send you a reset link</p>
        </div>

        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-brand-500" />
            <p className="mt-3 text-sm text-gray-600">Your password has been updated. You can now sign in.</p>
            <Link href="/login" className="mt-5 inline-block rounded-xl gradient-brand-btn px-6 py-2.5 text-sm font-medium text-white">Sign in</Link>
          </div>
        ) : sent && resetToken ? (
          <form onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            if (password !== confirm) { setError('Passwords do not match'); return; }
            if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
            setLoading(true);
            try {
              const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, newPassword: password }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.message || 'Reset failed');
              setDone(true);
            } catch (err: any) {
              setError(err.message || 'Reset failed');
            } finally {
              setLoading(false);
            }
          }} className="space-y-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
              Dev mode — no SMTP configured. Enter a new password below to finish the reset.
            </p>
            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-[13px] font-medium text-rose-700">{error}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">New password</label>
              <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Confirm new password</label>
              <input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update password'}
            </Button>
          </form>
        ) : sent ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-brand-500" />
            <p className="mt-3 text-sm text-gray-600">If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way.</p>
            <Link href="/login" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline">Back to sign in</Link>
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
              <label className="text-[13px] font-medium text-gray-700">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-[13px] text-gray-500">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
