'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, KeyRound, Loader2, User as UserIcon } from 'lucide-react';
import api from '@/lib/api-client';

interface Profile {
  client: { id: string; name: string; companyName: string; email: string | null; phone: string | null; address: string | null };
  account: { email: string; firstName: string; lastName: string; avatar: string | null; createdAt: string };
  projects: { id: string; name: string; status: string; progress: number; deadline: string | null }[];
}

export default function ClientProfilePage() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const profile = useQuery<Profile>({
    queryKey: ['client-portal-profile'],
    queryFn: () => api.get<Profile>('/client-portal/profile').then((r) => r.data),
  });

  const changePassword = useMutation({
    mutationFn: () => api.post('/client-portal/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setFormSuccess('Password updated successfully.');
      setFormError('');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    },
    onError: (e: any) => {
      setFormError(e?.response?.data?.message || 'Password could not be changed.');
      setFormSuccess('');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setFormSuccess('');
    if (newPassword !== confirmPassword) { setFormError('New passwords do not match.'); return; }
    if (newPassword.length < 8) { setFormError('New password must be at least 8 characters.'); return; }
    changePassword.mutate();
  };

  if (profile.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  if (profile.isError || !profile.data) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Profile could not be loaded.</div>;
  const { client, account, projects } = profile.data;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Company profile</h2>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Company name</dt><dd className="font-medium text-gray-900">{client.name}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Contact email</dt><dd className="font-medium text-gray-900">{client.email ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Phone</dt><dd className="font-medium text-gray-900">{client.phone ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Address</dt><dd className="text-right font-medium text-gray-900">{client.address ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Member since</dt><dd className="font-medium text-gray-900">{new Date(account.createdAt).toLocaleDateString()}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Your account</h2>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Name</dt><dd className="font-medium text-gray-900">{account.firstName} {account.lastName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Login ID</dt><dd className="font-medium text-gray-900">{account.email}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Phone</dt><dd className="font-medium text-gray-900">{client.phone ?? '—'}</dd></div>
        </dl>
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned projects</p>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-400">No projects assigned yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.progress}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Change password</h2>
        </div>
        {formError && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
        {formSuccess && <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{formSuccess}</p>}
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
          <input type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
          <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
          <div className="sm:col-span-3">
            <button type="submit" disabled={changePassword.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {changePassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
