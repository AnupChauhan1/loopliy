'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LooplyLogo } from '@/components/LooplyLogo';
import { ZohoIcon } from '@/components/zoho-icon';
import { Mail, Lock, User, Phone, AlertCircle, CheckCircle2, Loader2, Camera, Eye, EyeOff } from 'lucide-react';
import { sendZohoVerificationLink, pollZohoVerification, handleZohoEmailLinkLanding } from '@/lib/zoho-verify';

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
  const [zohoSent, setZohoSent] = useState(false);
  const [zohoDone, setZohoDone] = useState(false);
  const [otpProof, setOtpProof] = useState('');
  const fbUser = useRef<any>(null);

  const [googleVerified, setGoogleVerified] = useState(false);
  const [zohoVerified, setZohoVerified] = useState(false);

  const resetEmailVerification = () => {
    setFbSent(false); setFbLoading(false); setFbMsg('');
    setEmailProof(''); setEmailLocked(false); setGoogleVerified(false); setZohoVerified(false);
    setZohoSent(false); setZohoDone(false); setOtpProof(''); fbUser.current = null;
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
      setOtpProof('');
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
      setOtpProof('');
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

  // "Verify & Sign up with Zoho" — passwordless: emails a Firebase sign-in link
  // to the Zoho Mail inbox; approving on the phone unlocks this form in real time.
  const signInWithZoho = async () => {
    setError(''); setZohoLoading(true); setFbMsg('');
    try {
      const email = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter your Zoho work email above first (e.g. name@zohomail.in) — no password needed.');
        return;
      }
      try {
        await sendZohoVerificationLink(email, '/signup');
        setZohoSent(true);
        setFbMsg(`Verification link sent to ${email} — open Zoho Mail on your phone and tap the link to approve.`);
      } catch (linkErr: any) {
        // Fallback: email-link sign-in disabled → classic password + verification email
        if (!form.password) {
          setError(await fbError(linkErr, 'Could not send the Zoho verification link — enter a password and use "Verify Email" instead.'));
          return;
        }
        const { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, form.password);
        } catch (e: any) {
          if (e?.code === 'auth/email-already-in-use') cred = await signInWithEmailAndPassword(auth, email, form.password);
          else throw e;
        }
        fbUser.current = cred.user;
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user, { url: `${window.location.origin}/signup?zohoVerify=1&email=${encodeURIComponent(email)}`, handleCodeInApp: false });
        }
        setFbSent(true);
        setFbMsg(`Verification email sent to ${email} — open Zoho Mail on your phone and tap the link.`);
      }
    } catch (err: unknown) {
      setError(await fbError(err, 'Could not send Zoho verification. Please try again.'));
    } finally {
      setZohoLoading(false);
    }
  };

  // Phone-side landing: completes signInWithEmailLink and unlocks this form.
  useEffect(() => {
    void handleZohoEmailLinkLanding(async (user) => {
      setZohoDone(true);
      setZohoSent(false);
      const idToken = await user.getIdToken();
      setEmailProof(idToken);
      setOtpProof('');
      setEmailLocked(true);
      setZohoVerified(true);
      const email = user.email ?? '';
      setForm((f) => ({ ...f, email, fullName: f.fullName || user.displayName || '' }));
    }, (msg) => setError(msg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop-side poll: the exact second the phone approves, unlock this form.
  useEffect(() => {
    if (!zohoSent || emailProof || otpProof) return;
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    const id = setInterval(async () => {
      const token = await pollZohoVerification(email);
      if (token) {
        setOtpProof(token);
        setEmailProof('');
        setEmailLocked(true);
        setZohoVerified(true);
        setZohoSent(false);
        setFbMsg('');
      }
    }, 3000);
    return () => clearInterval(id);
  }, [zohoSent, emailProof, otpProof, form.email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strong.test(form.password)) { setError('Password must be 8+ characters with upper, lower case and a number'); return; }
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(form.phone)) { setError('Enter a valid phone number'); return; }
    if (form.accountType === 'client' && !form.companyName.trim()) { setError('Company name is required for client accounts'); return; }
    if (!emailProof && !otpProof) { setError('Please verify your email via the link sent to your inbox first'); return; }
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
      if (otpProof) fd.append('otpToken', otpProof);
      else fd.append('firebaseIdToken', emailProof);
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

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-start overflow-y-auto overflow-x-hidden bg-white px-4 py-8 pb-20 lg:justify-center">
      <div className="w-full max-w-md animate-fade-in-blur">
        <div className="mb-8 text-center">
          <LooplyLogo animate={true} size="md" theme="light" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-900 tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-500">Join the LOOPLY workspace — your admin will approve your access</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={googleLoading}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            )}
            {googleLoading ? 'Connecting to Google...' : 'Verify & Sign up with Google'}
          </button>
          <button
            type="button"
            onClick={signInWithZoho}
            disabled={zohoLoading}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {zohoLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ZohoIcon />
            )}
            {zohoLoading ? 'Sending Zoho verification...' : 'Verify & Sign up with Zoho'}
          </button>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-medium text-gray-400">or use email</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

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
                <input required type="email" value={form.email} onChange={(e) => { if (emailLocked) return; set('email')(e); }} readOnly={emailLocked} placeholder="you@company.com" className={`w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${emailLocked ? 'bg-brand-50/50 text-gray-600' : ''}`} />
              </div>
              {!emailProof && !otpProof ? (
                <button type="button" onClick={sendVerificationEmail} disabled={fbLoading} className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                  {fbLoading ? '...' : fbSent ? 'Resend email' : 'Verify Email'}
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {googleVerified ? 'Google Email Verified ✓' : zohoVerified ? 'Zoho Mail Verified ✓' : 'Verified'}
                </span>
              )}
            </div>
            {zohoSent && !otpProof && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                <p className="text-[12px] font-medium text-emerald-800">
                  Verification link sent — open <span className="font-semibold">Zoho Mail</span> on your phone and tap the link to approve. This form unlocks automatically.
                </p>
              </div>
            )}
            {zohoDone && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-[12px] font-semibold text-emerald-800">Approved! Zoho Mail Verified ✓ — set your password below to finish.</p>
              </div>
            )}
            {fbSent && !emailProof && !otpProof && (
              <button
                type="button"
                onClick={confirmVerified}
                disabled={fbLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand-btn px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-brand-500/25 disabled:opacity-50"
              >
                {fbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                I&apos;ve Verified — Check Status
              </button>
            )}
            {fbMsg && <p className="text-[11px] text-brand-700">{fbMsg}</p>}
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

          <Button type="submit" disabled={loading || !emailProof} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25 disabled:opacity-60">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : emailProof ? 'Create Account' : 'Verify email to continue'}
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
