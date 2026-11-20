'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtDateTime, fullName } from '@/lib/format';
import { Search, ScrollText } from 'lucide-react';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [resource, setResource] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', { search: debouncedSearch, resource, page }],
    queryFn: () => api.get('/audit-logs', { params: { ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(resource !== 'all' ? { resource } : {}), page, limit: 40 } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-1">Every administrative action, recorded</p>
      </div>

      <Card className="card-premium">
        <CardContent className="p-3.5 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search actions..." className="w-full rounded-lg border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>
          <select value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="all">All resources</option>
            <option value="task">Tasks</option>
            <option value="project">Projects</option>
            <option value="user">Users</option>
            <option value="department">Departments</option>
            <option value="module">Modules</option>
            <option value="settings">Settings</option>
          </select>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] stagger-rows">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">When</th>
                  <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">User</th>
                  <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Action</th>
                  <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Resource</th>
                  <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">ID</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400"><ScrollText className="mx-auto mb-2 h-6 w-6 opacity-40" />No audit entries</td></tr>
                ) : (
                  logs.map((l: any) => (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 text-xs text-gray-500">{fmtDateTime(l.createdAt)}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{l.user ? fullName(l.user) : 'system'}</td>
                      <td className="py-3 px-4"><span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">{l.action}</span></td>
                      <td className="py-3 px-4 text-sm text-gray-600">{l.resource}</td>
                      <td className="py-3 px-4 text-[11px] font-mono text-gray-400">{l.resourceId?.slice(0, 8)}—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data?.pagination?.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} entries)</p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-95 disabled:opacity-40">Prev</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-95 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
