'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Plus, UserRound, Users } from 'lucide-react';
import api from '@/lib/api-client';

interface ClientRecord {
  id: string;
  name: string;
  email: string | null;
  portalUser: { id: string; email: string; firstName: string; lastName: string; isActive: boolean } | null;
  _count: { projects: number };
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const response = (error as { response?: { data?: { message?: unknown } } }).response;
  return typeof response?.data?.message === 'string' ? response.data.message : fallback;
}

const blankClient = { name: '', email: '', phone: '', firstName: '', lastName: '', password: '' };
const blankAccount = { email: '', firstName: '', lastName: '', password: '' };

export default function ClientAccountsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankClient);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [account, setAccount] = useState(blankAccount);

  const clients = useQuery<ClientRecord[]>({
    queryKey: ['client-portal-clients'],
    queryFn: () => api.get<ClientRecord[]>('/client-portal/clients').then((response) => response.data),
  });
  const createClient = useMutation({
    mutationFn: () => api.post('/client-portal/clients', form),
    onSuccess: () => {
      setForm(blankClient);
      queryClient.invalidateQueries({ queryKey: ['client-portal-clients'] });
    },
  });
  const createAccount = useMutation({
    mutationFn: (input: { clientId: string; account: typeof blankAccount }) =>
      api.post(`/client-portal/clients/${input.clientId}/account`, input.account),
    onSuccess: () => {
      setAccount(blankAccount);
      setSelectedClient(null);
      queryClient.invalidateQueries({ queryKey: ['client-portal-clients'] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Client portal administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Client access</h1>
        <p className="mt-1 text-sm text-gray-500">Create portal accounts and share credentials with clients securely.</p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Add a client and portal account</h2>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createClient.mutate();
          }}
        >
          <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Company / client name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Login email" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input required maxLength={80} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} placeholder="Contact first name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input required maxLength={80} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} placeholder="Contact last name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone (optional)" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input required type="password" minLength={12} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Temporary password (12+ characters)" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <div className="sm:col-span-2">
            <button type="submit" disabled={createClient.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createClient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
              Create client access
            </button>
            <p className="mt-2 text-xs text-gray-500">Passwords are hashed and cannot be viewed again. Share the temporary password directly with the client.</p>
            {createClient.isError && <p role="alert" className="mt-2 text-sm text-rose-600">{apiErrorMessage(createClient.error, 'Could not create this client account.')}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Users className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Existing clients</h2>
        </div>
        {clients.isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : clients.isError ? (
          <p className="p-5 text-sm text-rose-600">Client accounts could not be loaded.</p>
        ) : (clients.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No clients have been added yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(clients.data ?? []).map((client) => (
              <div key={client.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">{client.name}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {client.portalUser ? client.portalUser.email : client.email || 'No portal login'} · {client._count.projects} project{client._count.projects === 1 ? '' : 's'}
                  </p>
                  {client.portalUser && (
                    <p className={`mt-1 text-xs ${client.portalUser.isActive ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Portal account {client.portalUser.isActive ? 'active' : 'inactive'}
                    </p>
                  )}
                </div>
                {!client.portalUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(client);
                      setAccount({ ...blankAccount, email: client.email || '' });
                    }}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <KeyRound className="h-4 w-4" /> Create portal login
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4" onClick={() => setSelectedClient(null)}>
          <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900">Create access for {selectedClient.name}</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (selectedClient) {
                  createAccount.mutate({ clientId: selectedClient.id, account });
                }
              }}
            >
              <input required type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} placeholder="Login email" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input required value={account.firstName} onChange={(event) => setAccount({ ...account, firstName: event.target.value })} placeholder="First name" className="min-w-0 rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <input required value={account.lastName} onChange={(event) => setAccount({ ...account, lastName: event.target.value })} placeholder="Last name" className="min-w-0 rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              </div>
              <input required type="password" minLength={12} autoComplete="new-password" value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} placeholder="Temporary password (12+ characters)" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              {createAccount.isError && <p role="alert" className="text-sm text-rose-600">{apiErrorMessage(createAccount.error, 'Could not create this account.')}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSelectedClient(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">Cancel</button>
                <button type="submit" disabled={createAccount.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {createAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create account
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
