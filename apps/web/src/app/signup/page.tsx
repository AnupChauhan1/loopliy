'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mail, Lock, User, Phone, AlertCircle, CheckCircle2, Loader2, Camera } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export default function SignupPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '', phone: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(form.phone)) { setError('Enter a valid phone number'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName', form.firstName);
      fd.append('lastName', form.lastName);
      fd.append('email', form.email);
      fd.append('password', form.password);
      fd.append('phone', form.phone);
      if (photo) fd.append('photo', photo);
      const res = await fetch(`${API_URL}/api/v1/auth/signup`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Registration failed');
      setDevToken(data.devVerifyToken ?? '');
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md animate-fade-in-blur text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-brand-500/25">
            <CheckCircle2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Check your email</h1>
          <p className="mt-2 text-sm text-gray-500">
            We sent a verification link to <span className="font-medium text-gray-700">{form.email}</span>.
            Verify your email, then an admin will approve your account.
          </p>
          {devToken && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
              <p className="text-xs font-semibold text-amber-800">Dev mode — no SMTP configured</p>
              <Link href={`/verify-email?email=${encodeURIComponent(form.email)}&token=${devToken}`} className="mt-1 block text-xs font-medium text-brand-700 underline">
                Verify email now
              </Link>
            </div>
          )}
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md animate-fade-in-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-brand-500/25">
            <span className="text-sm font-bold text-white">LO</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900 tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-500">Join the LOOPLY workspace — your admin will approve your access</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[13px] font-medium text-rose-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">First name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required value={form.firstName} onChange={set('firstName')} placeholder="First name" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Last name</label>
              <input required value={form.lastName} onChange={set('lastName')} placeholder="Last name" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Work email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input required type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Phone number</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input required type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 234 567 890" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Profile photo <span className="font-normal text-gray-400">(optional)</span></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-3 transition-colors hover:border-brand-400">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Preview" className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-200" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100"><Camera className="h-5 w-5 text-gray-400" /></span>
              )}
              <span className="text-xs text-gray-500">
                {photo ? photo.name : 'Click to upload a photo (JPG/PNG, max 5MB)'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.type.startsWith('image/')) { setError('Please choose an image file'); return; }
                  if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
                  setError('');
                  setPhoto(f);
                  setPhotoPreview(URL.createObjectURL(f));
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="password" minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Confirm</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : 'Create Account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
