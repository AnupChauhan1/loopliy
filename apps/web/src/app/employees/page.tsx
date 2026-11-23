'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmtDate, fullName, initials } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { Search, Plus, X, Pencil, UserX, UserCheck, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export default function EmployeesPage() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'hr';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', password: '', departmentId: '', teamId: '',
    designation: '', reportingManager: '', phone: '', roleNames: ['Employee'] as string[],
    dateOfJoining: '', employmentStatus: 'active', leaveBalance: '20', emergencyContact: '', address: '',
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', { search: debouncedSearch, deptFilter, stageFilter }],
    queryFn: () => api.get('/users', { params: { ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(deptFilter !== 'all' ? { departmentId: deptFilter } : {}), ...(stageFilter !== 'all' ? { stage: stageFilter } : {}) } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data) });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/users/roles').then((r) => r.data) });
  const { data: regStats } = useQuery({
    queryKey: ['registration-stats'],
    queryFn: () => api.get('/users/registration-stats').then((r) => r.data),
    enabled: canManage,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['registration-stats'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        profile: {
          designation: form.designation, reportingManager: form.reportingManager, phone: form.phone,
          dateOfJoining: form.dateOfJoining || undefined, employmentStatus: form.employmentStatus,
          leaveBalance: form.leaveBalance ? Number(form.leaveBalance) : undefined,
          emergencyContact: form.emergencyContact, address: form.address,
        },
      };
      delete payload.designation; delete payload.reportingManager; delete payload.phone;
      delete payload.dateOfJoining; delete payload.employmentStatus; delete payload.leaveBalance;
      delete payload.emergencyContact; delete payload.address;
      if (!payload.password) delete payload.password;
      return editing ? api.put(`/users/${editing.id}`, payload) : api.post('/users', payload);
    },
    onSuccess: () => { invalidate(); setShowForm(false); setEditing(null); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to save'),
  });

  const toggleActive = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/deactivate`),
    onSuccess: invalidate,
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Could not delete user'),
  });

  const hrApprove = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/hr-approve`), onSuccess: invalidate });
  const adminApprove = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/admin-approve`), onSuccess: invalidate });
  const hrReject = useMutation({ mutationFn: ({ id, reason }: any) => api.post(`/users/${id}/hr-reject`, { reason }), onSuccess: invalidate });
  const adminReject = useMutation({ mutationFn: ({ id, reason }: any) => api.post(`/users/${id}/admin-reject`, { reason }), onSuccess: invalidate });

  const stageOf = (u: any) =>
    u.rejectedAt ? 'rejected'
    : u.approvedAt ? 'approved'
    : !u.hrApprovedAt ? 'hr_pending'
    : 'admin_pending';

  const review = (kind: 'hr' | 'admin', u: any, approve: boolean) => {
    const name = fullName(u);
    if (approve) {
      if (!window.confirm(`${kind === 'hr' ? 'HR' : 'Admin'} approve ${name}?`)) return;
      (kind === 'hr' ? hrApprove : adminApprove).mutate(u.id);
      return;
    }
    const reason = window.prompt(`Reason for rejecting ${name}'s registration (visible to the employee):`);
    if (reason === null) return;
    (kind === 'hr' ? hrReject : adminReject).mutate({ id: u.id, reason: reason || undefined });
  };

  const confirmDelete = (u: any) => {
    if (window.confirm(`Permanently delete ${fullName(u)} (${u.email})? This cannot be undone. For safety, prefer deactivating the account.`)) {
      removeUser.mutate(u.id);
    }
  };

  const openEdit = (u: any) => {
    setEditing(u);
    setForm({
      email: u.email, firstName: u.firstName, lastName: u.lastName, password: '',
      departmentId: u.departmentId ?? '', teamId: u.teamId ?? '', designation: u.employeeProfile?.designation ?? '',
      reportingManager: u.employeeProfile?.reportingManager ?? '', phone: u.employeeProfile?.phone ?? '',
      roleNames: u.roleNames ?? ['Employee'], dateOfJoining: u.employeeProfile?.dateOfJoining?.slice(0, 10) ?? '',
      employmentStatus: u.employeeProfile?.employmentStatus ?? 'active',
      leaveBalance: String(u.employeeProfile?.leaveBalance ?? 20),
      emergencyContact: u.employeeProfile?.emergencyContact ?? '', address: u.employeeProfile?.address ?? '',
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">{users?.length ?? 0} people</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setForm({ email: '', firstName: '', lastName: '', password: '', departmentId: '', teamId: '', designation: '', reportingManager: '', phone: '', roleNames: ['Employee'], dateOfJoining: '', employmentStatus: 'active', leaveBalance: '20', emergencyContact: '', address: '' }); setShowForm(true); }} className="gradient-brand-btn text-white border-0 rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> Add Employee
          </Button>
        )}
      </div>

      <Card className="card-premium">
        <CardContent className="p-3.5 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people..." className="w-full rounded-lg border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="all">All departments</option>
            {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="hr_pending">Pending HR review</option>
            <option value="admin_pending">Pending admin approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </CardContent>
      </Card>

      {canManage && regStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 stagger">
          {[
            { label: 'Total', value: regStats.total, cls: 'text-gray-900' },
            { label: 'Pending HR', value: regStats.pendingHR, cls: 'text-amber-600' },
            { label: 'Pending Admin', value: regStats.pendingAdmin, cls: 'text-sky-600' },
            { label: 'Approved', value: regStats.approved, cls: 'text-brand-600' },
            { label: 'Rejected', value: regStats.rejected, cls: 'text-rose-600' },
          ].map((s) => (
            <Card key={s.label} className="card-premium">
              <CardContent className="p-3.5 text-center">
                <p className={`text-xl font-semibold ${s.cls}`}>{s.value}</p>
                <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {(users ?? []).map((u: any) => (
            <Card key={u.id} className={`card-premium group ${!u.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar} alt="" className="h-11 w-11 rounded-full object-cover shadow-md ring-2 ring-brand-100" />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full gradient-brand text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition-transform duration-300 group-hover:scale-110">{initials(u.firstName, u.lastName)}</span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{fullName(u)}</p>
                      <p className="text-xs text-gray-500">{u.employeeProfile?.designation ?? '—'}</p>
                      <p className="text-[11px] font-mono text-gray-400">{u.employeeProfile?.employeeId}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => toggleActive.mutate(u.id)} title={u.isActive ? 'Deactivate' : 'Reactivate'} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110">
                        {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      {role === 'admin' && u.id !== undefined && (
                        <button onClick={() => confirmDelete(u)} title="Delete permanently" className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-all duration-150 hover:scale-110"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(u.roleNames ?? []).map((r: string) => (
                    <span key={r} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{r}</span>
                  ))}
                  {stageOf(u) !== 'approved' && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      stageOf(u) === 'hr_pending' ? 'bg-amber-100 text-amber-700'
                      : stageOf(u) === 'admin_pending' ? 'bg-sky-100 text-sky-700'
                      : 'bg-rose-100 text-rose-700'
                    }`}>
                      {stageOf(u) === 'hr_pending' ? 'Pending HR review' : stageOf(u) === 'admin_pending' ? 'Pending admin' : 'Rejected'}
                    </span>
                  )}
                </div>
                {stageOf(u) === 'hr_pending' && canManage && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => review('hr', u, true)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-50 px-2 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100">
                      <CheckCircle2 className="h-3.5 w-3.5" /> HR Approve
                    </button>
                    <button onClick={() => review('hr', u, false)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100">
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
                {stageOf(u) === 'admin_pending' && (
                  role === 'admin' ? (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => review('admin', u, true)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-50 px-2 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Admin Approve
                      </button>
                      <button onClick={() => review('admin', u, false)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100">
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] font-medium text-sky-600">Awaiting admin approval</p>
                  )
                )}
                {stageOf(u) === 'rejected' && u.rejectionReason && (
                  <p className="mt-2 text-[11px] text-rose-600">Reason: {u.rejectionReason}</p>
                )}
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>{u.email}</p>
                  <p>{u.department?.name ?? 'No department'} · Joined {fmtDate(u.employeeProfile?.dateOfJoining)}</p>
                  <p>Manager: {u.employeeProfile?.reportingManager ?? '—'} · Leave balance: {u.employeeProfile?.leaveBalance ?? '—'}</p>
                  {!u.isActive && <p className="font-medium text-rose-600">Account deactivated</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">{editing ? 'Edit employee' : 'Add employee'}</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                </div>
                <input required type="email" disabled={!!editing} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm disabled:bg-gray-50" />
                {!editing && <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Temporary password" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />}
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Designation" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input value={form.reportingManager} onChange={(e) => setForm({ ...form, reportingManager: e.target.value })} placeholder="Reporting manager" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, teamId: '' })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <option value="">No department</option>
                    {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <option value="">No team</option>
                    {((departments ?? []).find((d: any) => d.id === form.departmentId)?.teams ?? []).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Emergency contact" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Roles</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(roles ?? []).map((r: any) => {
                      const selected = form.roleNames.includes(r.name);
                      return (
                        <button key={r.id} type="button" onClick={() => setForm({ ...form, roleNames: selected ? form.roleNames.filter((n) => n !== r.name) : [...form.roleNames, r.name] })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={save.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">{save.isPending ? 'Saving...' : 'Save'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
