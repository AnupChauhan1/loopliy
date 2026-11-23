'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

function VerifyInner() {
  const params = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const email = params.get('email');
    const token = params.get('token');
    if (!email || !token) { setState('error'); setMessage('Invalid verification link.'); return; }
    fetch(`${API_URL}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) { setState('ok'); setMessage(d.message); }
        else { setState('error'); setMessage(d.message || 'Verification failed'); }
      })
      .catch(() => { setState('error'); setMessage('Could not reach the server.'); });
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center animate-fade-in-blur">
        {state === 'loading' && <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-500" />}
        {state === 'ok' && <CheckCircle2 className="mx-auto h-12 w-12 text-brand-500" />}
        {state === 'error' && <XCircle className="mx-auto h-12 w-12 text-rose-500" />}
        <h1 className="mt-5 text-2xl font-semibold text-gray-900">
          {state === 'loading' ? 'Verifying...' : state === 'ok' ? 'Email verified' : 'Verification failed'}
        </h1>
        {message && <p className="mt-2 text-sm text-gray-500">{message}</p>}
        {state !== 'loading' && (
          <Link href="/login" className="mt-6 inline-block rounded-xl gradient-brand-btn px-6 py-2.5 text-sm font-medium text-white">
            Go to sign in
          </Link>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}>
      <VerifyInner />
    </Suspense>
  );
}
