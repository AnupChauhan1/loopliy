'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mail, Lock, User, Phone, AlertCircle, CheckCircle2, Loader2, Camera, Eye, EyeOff } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export default function SignupPage() {
  const [form, setForm] = useState({ fullName: '', agencyName: '', email: '', password: '', confirm: '', phone: '', accountType: 'employee', companyName: '' });
  const [showPw, setShowPw] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const set = (k: string) => (e: any) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === 'email') { setOtpSent(false); setOtpVerified(false); setOtpToken(''); }
  };

  const sendOtp = async () => {
    setOtpMsg(''); setOtpLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not send code');
      setOtpSent(true); setOtpVerified(false); setOtpToken(''); setOtpCode('');
      setDevOtp(data.devOtp ?? '');
      setOtpMsg('6-digit code sent to your email (valid 10 minutes)');
      setResendIn(30);
    } catch (err: any) {
      setOtpMsg(err.message || 'Could not send code');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    setOtpMsg(''); setOtpLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      setOtpToken(data.otpToken);
      setOtpVerified(true);
      setOtpMsg('');
    } catch (err: any) {
      setOtpMsg(err.message || 'Verification failed');
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strong.test(form.password)) { setError('Password must be 8+ characters with upper, lower case and a number'); return; }
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(form.phone)) { setError('Enter a valid phone number'); return; }
    if (form.accountType === 'client' && !form.companyName.trim()) { setError('Company name is required for client accounts'); return; }
    if (!otpVerified || !otpToken) { setError('Please verify your email with the OTP code first'); return; }
    const nameParts = form.fullName.trim().split(/\s+/);
    if (nameParts.length < 2) { setError('Please enter your full name (first and last name)'); return; }
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName', firstName);
      fd.append('lastName', lastName);
      fd.append('email', form.email);
      fd.append('password', form.password);
      fd.append('phone', form.phone);
      fd.append('accountType', form.accountType);
      fd.append('companyName', form.accountType === 'client' ? (form.companyName || form.agencyName) : form.agencyName);
      fd.append('otpToken', otpToken);
      if (photo) fd.append('photo', photo);
      const res = await fetch(`${API_URL}/api/v1/auth/signup`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Registration failed');
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
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Registration submitted</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your email <span className="font-medium text-gray-700">{form.email}</span> is verified.
            HR and an admin will review your account — you&apos;ll be able to sign in once approved.
          </p>
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

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Full name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input required value={form.fullName} onChange={set('fullName')} placeholder="First and last name" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Agency / workspace name</label>
            <input value={form.agencyName} onChange={set('agencyName')} placeholder="e.g. Acme Digital" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Account type</label>
            <select value={form.accountType} onChange={set('accountType')} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
              <option value="employee">Employee</option>
              <option value="client">Client</option>
              <option value="hr">HR Manager</option>
              <option value="manager">Manager</option>
            </select>
            <p className="text-[11px] text-gray-400">Your account activates after HR and admin approval.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Work email</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
              {!otpVerified ? (
                <button type="button" onClick={sendOtp} disabled={otpLoading || resendIn > 0} className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                  {otpLoading ? '...' : otpSent ? (resendIn > 0 ? `Resend (${resendIn}s)` : 'Resend OTP') : 'Send OTP'}
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 ring-1 ring-brand-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                </span>
              )}
            </div>
            {otpSent && !otpVerified && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  className="w-32 rounded-xl border border-gray-200 bg-white px-3 py-2 text-center text-sm font-semibold tracking-[0.3em] shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <button type="button" onClick={verifyOtp} disabled={otpLoading || otpCode.length !== 6} className="rounded-xl bg-brand-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  {otpLoading ? '...' : 'Verify Code'}
                </button>
              </div>
            )}
            {otpMsg && <p className={`text-[11px] ${otpMsg.includes('sent') ? 'text-brand-600' : 'text-rose-600'}`}>{otpMsg}</p>}
            {devOtp && !otpVerified && (
              <p className="text-[11px] text-amber-600">Dev mode — your code is <span className="font-mono font-bold">{devOtp}</span></p>
            )}
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
                <input required type={showPw ? 'text' : 'password'} minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Toggle password visibility">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400">8+ chars with uppercase, lowercase and a number</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-gray-700">Confirm</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Toggle password visibility">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading || !otpVerified} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25 disabled:opacity-60">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : otpVerified ? 'Create Account' : 'Verify email to continue'}
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
