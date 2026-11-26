'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LooplyLogo } from '@/components/LooplyLogo';
import { ZohoIcon } from '@/components/zoho-icon';
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
  // Real inbox verification via Firebase Auth
  const [fbSent, setFbSent] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbMsg, setFbMsg] = useState('');
  const [emailProof, setEmailProof] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [zohoLoading, setZohoLoading] = useState(false);
  const fbUser = useRef<any>(null);

  const [googleVerified, setGoogleVerified] = useState(false);
  const [zohoVerified, setZohoVerified] = useState(false);

  const resetEmailVerification = () => {
    setFbSent(false); setFbLoading(false); setFbMsg('');
    setEmailProof(''); setEmailLocked(false); setGoogleVerified(false); setZohoVerified(false);
    fbUser.current = null;
  };

  const fbError = async (err: unknown, fallback: string) =>
    (await import('@/lib/firebase')).firebaseErrorMessage(err, fallback);

  const set = (k: string) => (e: any) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === 'email') resetEmailVerification();
  };

  const sendVerificationEmail = async () => {
    setFbMsg(''); setFbLoading(true);
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFbMsg('Enter a valid email first'); return; }
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
      const { auth } = await import('@/lib/firebase');
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      } catch (e: any) {
        if (e?.code === 'auth/email-already-in-use') {
          cred = await signInWithEmailAndPassword(auth, form.email, form.password);
        } else {
          throw e;
        }
      }
      fbUser.current = cred.user;
      if (!cred.user.emailVerified) await sendEmailVerification(cred.user);
      setFbSent(true);
      setFbMsg('Verification link sent to your email inbox. Please open your email, click the verification link, and then click "I have verified" to continue.');
    } catch (err: unknown) {
      setFbMsg(await fbError(err, 'Could not send verification email.'));
    } finally {
      setFbLoading(false);
    }
  };

  // Reloads the Firebase user and unlocks signup once the inbox link was clicked
  const checkVerified = async () => {
    const user = fbUser.current;
    if (!user) return false;
    await user.reload();
    if (!user.emailVerified) return false;
    const token = await user.getIdToken(true);
    setEmailProof(token);
    setEmailLocked(true);
    setFbSent(false);
    setFbMsg('');
    return true;
  };

  const confirmVerified = async () => {
    setFbMsg(''); setFbLoading(true);
    try {
      if (!fbUser.current) { setFbMsg('Request a verification email first'); return; }
      if (!(await checkVerified())) setFbMsg('Not verified yet — open the email, click the link, then try again.');
    } catch (err: unknown) {
      setFbMsg(await fbError(err, 'Could not confirm verification.'));
    } finally {
      setFbLoading(false);
    }
  };

  // Auto-check every 4 seconds while waiting for the inbox link to be clicked
  useEffect(() => {
    if (!fbSent || emailProof) return;
    const id = setInterval(() => { void checkVerified().catch(() => {}); }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbSent, emailProof]);

  // Pick up a verified OAuth profile handed off from /login ("No account found")
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('looply_oauth_prefill');
      if (!raw) return;
      sessionStorage.removeItem('looply_oauth_prefill');
      const p = JSON.parse(raw);
      if (!p?.email) return;
      setForm((f) => ({ ...f, email: p.email, fullName: f.fullName || p.fullName || '' }));
      if (p.idToken) {
        setEmailProof(p.idToken);
        setEmailLocked(true);
      }
      if (p.provider === 'zoho') setZohoVerified(true);
      else setGoogleVerified(true);
    } catch { /* ignore malformed prefill */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyGoogleCred = (cred: any) => {
    void (async () => {
      const idToken = await cred.user.getIdToken();
      setEmailProof(idToken);
      setEmailLocked(true);
      setGoogleVerified(true);
      setFbSent(false);
      setFbMsg('');
      setForm((f) => ({
        ...f,
        email: cred.user.email ?? f.email,
        fullName: f.fullName || cred.user.displayName || '',
      }));
    })();
  };

  useEffect(() => {
    (async () => {
      try {
        const { getRedirectResult } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        const cred = await getRedirectResult(auth);
        if (cred?.user) {
          const pid = cred.user.providerData?.[0]?.providerId ?? '';
          if (pid.includes('zoho')) applyZohoCred(cred);
          else applyGoogleCred(cred);
        }
      } catch (err: unknown) {
        if ((err as { code?: string })?.code) setError(await fbError(err, 'Sign-in failed.'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    setError(''); setGoogleLoading(true);
    try {
      const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');
      const { auth, googleProvider } = await import('@/lib/firebase');
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        applyGoogleCred(cred);
      } catch (popupErr: any) {
        const code = popupErr?.code ?? 'unknown';
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          setError(await fbError(popupErr, 'Google sign-in failed — please try again or use email verification below.'));
        }
      }
    } catch (err: unknown) {
      setError(await fbError(err, 'Google sign-in failed.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Zoho OAuth success → verified email + locked signup fields
  const applyZohoCred = (cred: any) => {
    void (async () => {
      const idToken = await cred.user.getIdToken();
      setEmailProof(idToken);
      setEmailLocked(true);
      setZohoVerified(true);
      setGoogleVerified(false);
      setFbSent(false);
      setFbMsg('');
      setForm((f) => ({
        ...f,
        email: cred.user.email ?? f.email,
        fullName: f.fullName || cred.user.displayName || '',
      }));
    })();
  };

  // "Verify & Sign up with Zoho" — clean Zoho OIDC popup (redirect fallback).
  const signInWithZoho = async () => {
    setError(''); setZohoLoading(true);
    try {
      const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');
      const { auth, zohoProvider } = await import('@/lib/firebase');
      try {
        const cred = await signInWithPopup(auth, zohoProvider);
        applyZohoCred(cred);
      } catch (popupErr: any) {
        const code = popupErr?.code ?? 'unknown';
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
          await signInWithRedirect(auth, zohoProvider);
          return;
        }
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          setError(await fbError(popupErr, 'Zoho sign-in failed — please try again.'));
        }
      }
    } catch (err: unknown) {
      setError(await fbError(err, 'Zoho sign-in failed. Please try again.'));
    } finally {
      setZohoLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strong.test(form.password)) { setError('Password must be 8+ characters with upper, lower case and a number'); return; }
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(form.phone)) { setError('Enter a valid phone number'); return; }
    if (form.accountType === 'client' && !form.companyName.trim()) { setError('Company name is required for client accounts'); return; }
    if (!emailProof) { setError('Please verify your email via the link sent to your inbox first'); return; }
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
      fd.append('firebaseIdToken', emailProof);
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
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-white px-4 py-8 pb-20">
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

  const pwScore = (() => {
    const p = form.password;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^a-zA-Z0-9]/.test(p) || p.length >= 12) s++;
    return s;
  })();
  const pwColor = ['bg-rose-400', 'bg-amber-400', 'bg-lime-400', 'bg-emerald-500'][pwScore];
  const pwLabel = ['Weak', 'Fair', 'Strong', 'Enterprise Strong'][pwScore];

  const inputCls =
    'h-11 w-full rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-2.5 text-base sm:text-sm text-slate-900 shadow-sm transition-all focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10';

  return (
    <div className="relative grid min-h-[100dvh] w-full grid-cols-1 overflow-x-hidden bg-[#F6F8FA] lg:grid-cols-12">
      {/* soft emerald radial mesh + dot grid */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.10),transparent)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(rgba(100,116,139,0.14) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Brand showcase panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-[130px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
            <LooplyLogo animate={true} size="sm" theme="dark" />
          </span>
          <span className="text-sm font-bold tracking-wide text-white">LOOPLY</span>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.75rem]">
            Automate your agency delivery
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">from Day 1 to Day 24.</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300/80">
            Role-matched task routing, live sprint velocity, and enterprise SSO — one workspace for your whole agency.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              { t: 'Role-Based Smart Task Engine', d: 'Every task auto-routed to the right specialist by role & workload' },
              { t: 'Real-Time Sprint Velocity Analytics', d: 'Live progress, burndown and delivery metrics across every project' },
              { t: 'Zoho & Google Enterprise SSO', d: 'One-click verified sign-in for your whole team' },
            ].map((f) => (
              <li key={f.t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition hover:border-emerald-400/30 hover:bg-white/[0.08]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-white">{f.t}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{f.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            99.9% On-Time Delivery • Instant Role Routing
          </span>
          <p className="mt-4 text-xs text-slate-500">© 2026 Looply — trusted by modern agencies</p>
        </div>
      </aside>

      {/* Form side */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 lg:col-span-7 lg:py-12">
        {/* Compact mobile header */}
        <div className="mb-6 flex w-full max-w-[540px] items-center gap-3 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <LooplyLogo animate={true} size="sm" theme="light" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">LOOPLY</p>
            <p className="text-[11px] text-slate-500">Create your account</p>
          </div>
        </div>

        <div className="w-full max-w-[540px] animate-fade-in-blur rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <div className="mb-6 hidden lg:block">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-emerald-700">
              ✨ ENTERPRISE WORKSPACE
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
            <p className="mt-1 text-sm text-slate-500">Join the LOOPLY workspace — instant SSO &amp; role-based onboarding</p>
          </div>
          <div className="mb-6 lg:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-emerald-700">
              ✨ ENTERPRISE WORKSPACE
            </span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-white hover:border-emerald-400/60 hover:shadow-sm disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                )}
                {googleLoading ? 'Connecting…' : 'Continue with Google'}
              </button>
              <button
                type="button"
                onClick={signInWithZoho}
                disabled={zohoLoading}
                className="flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-white hover:border-emerald-400/60 hover:shadow-sm disabled:opacity-60"
              >
                {zohoLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ZohoIcon />
                )}
                {zohoLoading ? 'Connecting…' : 'Continue with Zoho'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-medium text-slate-400">or register with work details</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-[13px] font-medium text-rose-700">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">Full name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required value={form.fullName} onChange={set('fullName')} placeholder="First and last name" className={`${inputCls} pl-10`} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">Agency / workspace</label>
                <input value={form.agencyName} onChange={set('agencyName')} placeholder="e.g. Acme Digital" className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">Account type</label>
                <select value={form.accountType} onChange={set('accountType')} className={inputCls}>
                  <option value="employee">Employee</option>
                  <option value="client">Client</option>
                  <option value="hr">HR Manager</option>
                  <option value="manager">Manager</option>
                </select>
                <p className="text-[11px] text-slate-400">Activates after HR &amp; admin approval.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" className={`${inputCls} pl-10`} />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[13px] font-medium text-slate-700">Work email</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input required type="email" value={form.email} onChange={(e) => { if (emailLocked) return; set('email')(e); }} readOnly={emailLocked} placeholder="you@company.com" className={`${inputCls} pl-10 ${emailLocked ? 'bg-emerald-50/60 text-slate-600' : ''}`} />
                  </div>
                  {!emailProof ? (
                    <button type="button" onClick={sendVerificationEmail} disabled={fbLoading} className="flex h-11 shrink-0 items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-[12px] font-semibold text-emerald-700 transition-all hover:bg-emerald-500/20 disabled:opacity-50">
                      {fbLoading ? '…' : fbSent ? 'Resend' : 'Verify Email'}
                    </button>
                  ) : (
                    <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-[12px] font-bold text-white shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {googleVerified ? 'Google Verified' : zohoVerified ? 'Zoho Verified' : 'Verified'} ✓
                    </span>
                  )}
                </div>
                {fbSent && !emailProof && (
                  <button
                    type="button"
                    onClick={confirmVerified}
                    disabled={fbLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {fbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    I&apos;ve Verified — Check Status
                  </button>
                )}
                {fbMsg && <p className="text-[11px] text-emerald-700">{fbMsg}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="text-[13px] font-medium text-slate-700">Profile photo <span className="font-normal text-slate-400">(optional)</span></label>
                <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Preview" className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-200" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70"><Camera className="h-4.5 w-4.5 text-slate-400" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-600">{photo ? photo.name : 'Upload profile photo'}</p>
                    <p className="text-[10px] text-slate-400">JPG/PNG • max 5MB</p>
                  </div>
                  <label className="shrink-0 cursor-pointer rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                    {photo ? 'Change' : 'Upload'}
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
                  {photo && (
                    <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(''); }} className="shrink-0 text-[11px] font-medium text-rose-500 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input required type={showPw ? 'text' : 'password'} minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" className={`${inputCls} pl-10 pr-10`} />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Toggle password visibility">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwScore ? pwColor : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400">{pwLabel} • 8+ chars, upper, lower &amp; number</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700">Confirm</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input required type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" className={`${inputCls} pl-10 pr-10`} />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Toggle password visibility">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !emailProof}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.45)] transition-all hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Creating account…' : emailProof ? 'Create Account →' : 'Verify email to continue →'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
              🔒 Protected by Firebase &amp; Zoho Enterprise SSO
            </p>
          </form>

          <p className="mt-5 text-center text-[13px] text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-emerald-600 transition hover:text-emerald-700 hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
