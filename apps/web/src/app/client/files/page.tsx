'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Film, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '@/lib/api-client';

interface PortalFile {
  id: string; name: string; mimeType: string | null; size: number | null;
  createdAt: string; project: { name: string }; downloadUrl: string;
}
interface Dashboard { files: PortalFile[] }

const fmtSize = (b?: number | null) =>
  !b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const iconFor = (mime?: string | null) =>
  mime?.startsWith('image/') ? ImageIcon : mime?.startsWith('video/') ? Film : FileText;

export default function ClientFilesPage() {
  const [error, setError] = useState('');
  const dashboard = useQuery<Dashboard>({
    queryKey: ['client-portal-dashboard'],
    queryFn: () => api.get<Dashboard>('/client-portal/dashboard').then((r) => r.data),
  });

  const download = async (url: string, name: string) => {
    setError('');
    try {
      const { data } = await api.get(url, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('This file could not be downloaded.');
    }
  };

  const files = dashboard.data?.files ?? [];
  const groups = files.reduce<Record<string, PortalFile[]>>((acc, f) => {
    (acc[f.project.name] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Files & media</h1>
        <p className="mt-1 text-sm text-gray-500">Documents and assets shared with you by your LOOPLY team.</p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {dashboard.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {!dashboard.isLoading && files.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No files shared yet. Files your team uploads to your projects will appear here.
        </div>
      )}
      {Object.entries(groups).map(([project, list]) => (
        <section key={project}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{project}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((f) => {
              const Icon = iconFor(f.mimeType);
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100"><Icon className="h-5 w-5 text-gray-500" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900" title={f.name}>{f.name}</p>
                    <p className="text-xs text-gray-400">{fmtSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => download(f.downloadUrl, f.name)}
                    title="Download"
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-brand-700"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
