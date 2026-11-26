'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileImage,
  History,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ClipboardPaste,
  Upload,
  X,
} from 'lucide-react';
import api from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fmtDate, fmtDateTime, fullName } from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STATUSES: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-gray-100 text-gray-700 ring-gray-200' },
  submitted_strategy: { label: 'Submitted for Strategy Approval', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  strategy_changes_requested: { label: 'Strategy Changes Requested', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  strategy_rejected: { label: 'Strategy Rejected', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  pending_manager: { label: 'Pending Manager Approval', tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
  manager_changes_requested: { label: 'Manager Changes Requested', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
  manager_rejected: { label: 'Manager Rejected', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  final_approved: { label: 'Final Approved', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  delivered: { label: 'Delivered', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

const TABS = [
  { key: 'all', label: 'All Creatives' },
  { key: 'submitted_strategy', label: 'Pending Strategy' },
  { key: 'pending_manager', label: 'Pending Manager' },
  { key: 'changes_requested', label: 'Changes Requested' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'approved', label: 'Approved' },
];

interface CreativePerson {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  department?: { name: string } | null;
}

interface CreativeVersion {
  id: string;
  requestId: string;
  version: number;
  fileUrl?: string | null;
  externalUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  status: string;
  notes?: string | null;
  feedback?: string | null;
  createdAt: string;
}

interface CreativeApprovalEvent {
  id: string;
  stage: string;
  action: string;
  message?: string | null;
  actorName?: string | null;
  actor?: CreativePerson | null;
  version?: { version: number } | null;
  createdAt: string;
}

interface CreativeItem {
  id: string;
  title: string;
  status: string;
  creativeType: string;
  brief?: string | null;
  campaign?: string | null;
  deadline?: string | null;
  updatedAt: string;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string; clientId?: string | null } | null;
  versions?: CreativeVersion[];
  _count?: { versions: number; approvalEvents: number };
}

interface CreativeDetail extends CreativeItem {
  createdById: string;
  assigneeId?: string | null;
  strategyApproverId?: string | null;
  managerApproverId?: string | null;
  sourceLink?: string | null;
  requirements?: string | null;
  submissionNotes?: string | null;
  createdBy?: CreativePerson | null;
  assignee?: CreativePerson | null;
  strategyApprover?: CreativePerson | null;
  managerApprover?: CreativePerson | null;
  approvalEvents?: CreativeApprovalEvent[];
}

interface CreativeDashboard {
  total: number;
  pendingStrategy: number;
  pendingManager: number;
  changesRequested: number;
  rejected: number;
  finalApproved: number;
}

interface CreativeListResponse {
  items: CreativeItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface CreativeApprovers {
  strategyApprovers: CreativePerson[];
  managerApprovers: CreativePerson[];
}

interface CreativeResources {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId?: string | null }>;
  assignees: CreativePerson[];
}

interface ApiErrorShape {
  response?: { data?: { message?: unknown } };
}

function isApiError(error: unknown): error is ApiErrorShape {
  return typeof error === 'object' && error !== null && 'response' in error;
}

function errorMessage(error: unknown, fallback: string) {
  const message = isApiError(error) ? error.response?.data?.message : undefined;
  return typeof message === 'string' ? message : fallback;
}

const STATUS_STEPS = ['Submitted', 'Strategy Review', 'Manager Review', 'Final Approved'];

function StatusPill({ status }: { status: string }) {
  const config = STATUSES[status] ?? { label: status.replace(/_/g, ' '), tone: 'bg-gray-100 text-gray-600 ring-gray-200' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${config.tone}`}>{config.label}</span>;
}

function WorkflowSteps({ status }: { status: string }) {
  const submitted = status !== 'draft';
  const strategyDone = status === 'pending_manager' || status.startsWith('manager_') || ['final_approved', 'delivered'].includes(status);
  const managerDone = status === 'final_approved' || status === 'delivered';
  const complete = [submitted, strategyDone, managerDone, managerDone];
  const active = status === 'submitted_strategy' || status.startsWith('strategy_')
    ? 1
    : status === 'pending_manager' || status.startsWith('manager_')
      ? 2
      : -1;
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Creative approval progress">
      {STATUS_STEPS.map((step, index) => {
        const done = complete[index];
        const isActive = active === index;
        return (
          <div key={step} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done ? 'bg-brand-500' : isActive ? 'bg-amber-400' : 'bg-gray-100'}`} />
            <p className={`mt-2 truncate text-[10px] font-medium ${done ? 'text-brand-700' : isActive ? 'text-amber-700' : 'text-gray-400'}`}>{step}</p>
          </div>
        );
      })}
    </div>
  );
}

function fileUrl(version?: CreativeVersion) {
  if (!version) return undefined;
  if (version?.fileUrl?.startsWith('private:')) return undefined;
  if (version.fileUrl?.startsWith('http')) return version.fileUrl;
  return version.fileUrl ? `${API_BASE}${version.fileUrl}` : version.externalUrl;
}

function useCreativeFileUrl(version?: CreativeVersion, enabled = true) {
  const isPrivateFile = version?.fileUrl?.startsWith('private:') ?? false;
  const { data: fileBlob, isLoading, isError } = useQuery<Blob>({
    queryKey: ['creative-file-preview', version?.requestId, version?.id],
    queryFn: () => api.get(
      `/creatives/${version?.requestId}/versions/${version?.id}/file`,
      { responseType: 'blob' },
    ).then((response) => response.data),
    enabled: enabled && isPrivateFile && !!version?.requestId,
    staleTime: 60_000,
  });
  const privateUrl = useMemo(() => fileBlob ? URL.createObjectURL(fileBlob) : null, [fileBlob]);
  useEffect(() => () => {
    if (privateUrl) URL.revokeObjectURL(privateUrl);
  }, [privateUrl]);
  return { url: isPrivateFile ? privateUrl : fileUrl(version), isLoading, isError };
}

function CreativePreview({ version, title }: { version?: CreativeVersion; title: string }) {
  const { url: src, isLoading, isError } = useCreativeFileUrl(version);
  if (!version) {
    return <div className="flex h-52 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">No preview uploaded</div>;
  }
  if (!src) {
    return <div className="flex h-52 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">{isLoading ? 'Loading preview…' : isError ? 'Preview unavailable' : 'No preview uploaded'}</div>;
  }
  if (src && (version.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(src))) {
    return <Image src={src} alt={title} width={1200} height={800} unoptimized className="max-h-[420px] w-full rounded-xl bg-gray-50 object-contain" />;
  }
  if (version.mimeType?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(src ?? '')) {
    return <video src={src} controls playsInline className="max-h-[420px] w-full rounded-xl bg-gray-950" />;
  }
  if (/\.pdf($|\?)/i.test(src ?? '') || version.mimeType === 'application/pdf') {
    return <iframe src={src} title={`${title} preview`} className="h-[420px] w-full rounded-xl border border-gray-100" />;
  }
  if (src) {
    return <a href={src} target="_blank" rel="noreferrer" className="flex h-52 items-center justify-center gap-2 rounded-xl bg-gray-50 text-sm font-medium text-brand-700"><ExternalLink className="h-4 w-4" />Open creative link</a>;
  }
  return <div className="flex h-52 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">No preview uploaded</div>;
}

const SUPPORTED_CREATIVE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.webm', '.pdf']);

function isSupportedCreativeFile(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return SUPPORTED_CREATIVE_EXTENSIONS.has(extension);
}

function SelectedCreativeFile({ file, previewUrl, onRemove, pasted }: { file: File; previewUrl: string; onRemove: () => void; pasted?: boolean }) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const image = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension);
  const video = file.type.startsWith('video/') || ['.mp4', '.mov', '.webm'].includes(extension);
  const sizeKb = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {image ? (
        <Image src={previewUrl} alt={file.name} width={1200} height={800} unoptimized className="max-h-56 w-full bg-gray-50 object-contain" />
      ) : video ? (
        <video src={previewUrl} controls playsInline className="max-h-56 w-full bg-gray-950" />
      ) : (
        <div className="flex h-24 items-center justify-center text-sm text-gray-500">{file.name}</div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-gray-700">{file.name}</span>
          <span className="shrink-0 text-[10px] text-gray-400">{sizeKb}</span>
          {pasted && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-300">Pasted via Ctrl+V ✓</span>
          )}
        </span>
        <button type="button" onClick={onRemove} className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700">Remove</button>
      </div>
    </div>
  );
}

function PersonLine({ label, person }: { label: string; person?: Pick<CreativePerson, 'firstName' | 'lastName'> | null }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="truncate font-medium text-gray-800">{person ? fullName(person) : 'Not assigned'}</span>
    </div>
  );
}

function CreativeCard({ item, onOpen }: { item: CreativeItem; onOpen: (id: string) => void }) {
  const previewContainer = useRef<HTMLDivElement>(null);
  const [loadPreview, setLoadPreview] = useState(false);
  const version = item.versions?.[0];
  const { url: preview } = useCreativeFileUrl(version, loadPreview);

  useEffect(() => {
    const node = previewContainer.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadPreview(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const image = version?.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(preview ?? version?.fileName ?? '');
  const video = version?.mimeType?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(preview ?? version?.fileName ?? '');
  return (
    <button onClick={() => onOpen(item.id)} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <div ref={previewContainer} className="relative flex h-40 items-center justify-center overflow-hidden bg-gray-50">
        {image && preview && <Image src={preview} alt={item.title} width={640} height={360} unoptimized className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />}
        {video && preview && <video src={preview} muted className="h-full w-full object-cover" />}
        {(!image && !video) || !preview ? <FileImage className="h-8 w-8 text-gray-300" /> : null}
        <span className="absolute right-3 top-3"><StatusPill status={item.status} /></span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1 truncate text-xs text-gray-500">{item.client?.name ?? item.project?.name ?? item.campaign ?? 'No client or campaign'}</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </div>
        <div className="mt-4"><WorkflowSteps status={item.status} /></div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
          <span className="capitalize">{item.creativeType?.replace('_', ' ') ?? 'Graphic'}</span>
          <span>{item._count?.versions ?? 0} version{item._count?.versions === 1 ? '' : 's'}</span>
        </div>
      </div>
    </button>
  );
}

export function CreativeApprovalBoard() {
  const { user, role, hasRole } = useAuth();
  const manager = isManager(role);
  const strategyRole = hasRole('Strategy Approver', 'Super Admin', 'Admin');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'changes' | null>(null);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [submissionPreview, setSubmissionPreview] = useState<string | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<string | null>(null);
  const submissionPreviewRef = useRef<string | null>(null);
  const revisionPreviewRef = useRef<string | null>(null);
  const [submissionDragOver, setSubmissionDragOver] = useState(false);
  const [revisionDragOver, setRevisionDragOver] = useState(false);
  const [pastedKind, setPastedKind] = useState<'submission' | 'revision' | null>(null);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [revisionUploadProgress, setRevisionUploadProgress] = useState(0);
  const [revisionLink, setRevisionLink] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [form, setForm] = useState({
    title: '',
    brief: '',
    clientId: '',
    projectId: '',
    campaign: '',
    creativeType: 'graphic',
    sourceLink: '',
    strategyApproverId: '',
    managerApproverId: '',
    assigneeId: '',
    submissionNotes: '',
  });
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => () => {
    if (submissionPreviewRef.current) URL.revokeObjectURL(submissionPreviewRef.current);
    if (revisionPreviewRef.current) URL.revokeObjectURL(revisionPreviewRef.current);
  }, []);

  const selectFile = (file: File | null, revision = false, viaPaste = false) => {
    if (file && !isSupportedCreativeFile(file)) {
      setFormError('Choose a JPG, PNG, WebP, GIF, MP4, MOV, WebM, or PDF file.');
      return;
    }
    setFormError('');
    setPastedKind(viaPaste ? (revision ? 'revision' : 'submission') : null);
    const previewRef = revision ? revisionPreviewRef : submissionPreviewRef;
    const setPreview = revision ? setRevisionPreview : setSubmissionPreview;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const previewUrl = file ? URL.createObjectURL(file) : null;
    previewRef.current = previewUrl;
    setPreview(previewUrl);
    if (revision) setRevisionFile(file);
    else setSubmissionFile(file);
  };

  // Extract an image/file blob from a ClipboardEvent or ClipboardItemList
  const fileFromClipboardItems = (items: any): File | null => {
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const f = item.getAsFile?.() ?? (item instanceof File ? item : null);
      if (!f) continue;
      const mime = f.type || 'image/png';
      const ext = mime.includes('/') ? mime.split('/')[1].replace('jpeg', 'jpg') : 'png';
      const name = f.name && /\.[a-z0-9]+$/i.test(f.name) ? f.name : `pasted-${Date.now()}.${ext}`;
      return new File([f], name, { type: mime });
    }
    return null;
  };

  const handleClipboardPaste = (file: File | null) => {
    if (!file) return;
    if (showCreate) {
      selectFile(file, false, true);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 3000);
    } else if (selectedId) {
      selectFile(file, true, true);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 3000);
    }
  };

  const pasteFromClipboardButton = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            handleClipboardPaste(new File([blob], `pasted-${Date.now()}.${type.split('/')[1]}`, { type }));
            return;
          }
        }
      }
      setFormError('No image found on the clipboard — copy a screenshot first (Win+Shift+S).');
    } catch {
      setFormError('Clipboard access was blocked — press Ctrl+V inside this window instead.');
    }
  };

  // Global Ctrl+V listener: active whenever the submission modal or detail drawer is open
  useEffect(() => {
    if (!showCreate && !selectedId) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = fileFromClipboardItems(e.clipboardData?.items) ?? fileFromClipboardItems(e.clipboardData?.files);
      if (!file) return; // let normal text pasting through untouched
      e.preventDefault();
      handleClipboardPaste(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, selectedId]);

  const { data: dashboard } = useQuery<CreativeDashboard>({
    queryKey: ['creative-approval-dashboard'],
    queryFn: () => api.get('/creatives/dashboard').then((response) => response.data),
    staleTime: 15_000,
  });

  const { data, isLoading } = useQuery<CreativeListResponse>({
    queryKey: ['creative-approval-list', tab, searchQuery],
    queryFn: () => api.get('/creatives', { params: { status: tab, search: searchQuery || undefined, limit: 50 } }).then((response) => response.data),
    placeholderData: (previous) => previous,
  });
  const { data: detail, isFetching: detailLoading } = useQuery<CreativeDetail>({
    queryKey: ['creative-approval-detail', selectedId],
    queryFn: () => api.get(`/creatives/${selectedId}`).then((response) => response.data),
    enabled: !!selectedId,
  });
  const { data: approvers } = useQuery<CreativeApprovers>({
    queryKey: ['creative-approval-approvers'],
    queryFn: () => api.get('/creatives/approvers').then((response) => response.data),
    enabled: showCreate || (!!selectedId && manager),
    staleTime: 60_000,
  });
  const { data: resources } = useQuery<CreativeResources>({
    queryKey: ['creative-approval-resources'],
    queryFn: () => api.get('/creatives/resources').then((response) => response.data),
    enabled: showCreate || (!!selectedId && manager),
    staleTime: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['creative-approval-list'] });
    queryClient.invalidateQueries({ queryKey: ['creative-approval-dashboard'] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ['creative-approval-detail', selectedId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateAssignments = useMutation({
    mutationFn: (updates: Record<string, string>) => api.put(`/creatives/${selectedId}`, updates),
    onSuccess: () => { refresh(); setFormError(''); },
    onError: (error) => setFormError(errorMessage(error, 'Could not update creative assignments.')),
  });

  const createCreative = useMutation<CreativeDetail, unknown>({
    mutationFn: async () => {
      setUploadProgress(0);
      const payload = new FormData();
      const values: Record<string, string> = {
        title: form.title.trim(),
        brief: form.brief,
        clientId: form.clientId,
        projectId: form.projectId,
        campaign: form.campaign,
        creativeType: form.creativeType,
        sourceLink: form.sourceLink.trim(),
        strategyApproverId: form.strategyApproverId,
        managerApproverId: form.managerApproverId,
        assigneeId: form.assigneeId || user?.id || '',
        submissionNotes: form.submissionNotes.trim(),
      };
      Object.entries(values).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      if (submissionFile) payload.append('file', submissionFile);
      const response = await api.post<CreativeDetail>('/creatives', payload, {
        onUploadProgress: (event) => {
          if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
        }
      });
      return response.data;
    },
    onSuccess: (item) => {
      refresh();
      setShowCreate(false);
      setSelectedId(item.id);
      setFormError('');
      setUploadProgress(0);
      setForm({
        title: '', brief: '', clientId: '', projectId: '', campaign: '', creativeType: 'graphic',
        sourceLink: '', strategyApproverId: '', managerApproverId: '', assigneeId: user?.id ?? '', submissionNotes: '',
      });
      selectFile(null);
    },
    onError: (error) => setFormError(errorMessage(error, 'Could not create the creative request.')),
  });

  const uploadRevision = useMutation({
    mutationFn: async () => {
      setRevisionUploadProgress(0);
      const payload = new FormData();
      if (revisionFile) payload.append('file', revisionFile);
      if (revisionLink.trim()) payload.append('externalUrl', revisionLink.trim());
      if (revisionNotes.trim()) payload.append('notes', revisionNotes.trim());
      return api.post(`/creatives/${selectedId}/versions`, payload, {
        onUploadProgress: (event) => {
          if (event.total) setRevisionUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
        },
      });
    },
    onSuccess: () => {
      refresh();
      selectFile(null, true);
      setRevisionLink('');
      setRevisionNotes('');
      setRevisionUploadProgress(0);
      setFormError('');
    },
    onError: (error) => setFormError(errorMessage(error, 'Could not submit the revised version.')),
  });

  const review = useMutation({
    mutationFn: () => {
      const versionId = detail?.versions?.[0]?.id;
      if (!selectedId || !versionId) throw new Error('No current creative version is available for review.');
      return api.post(`/creatives/${selectedId}/versions/${versionId}/review`, { action, message });
    },
    onSuccess: () => {
      refresh();
      setAction(null);
      setMessage('');
      setFormError('');
    },
    onError: (error) => setFormError(errorMessage(error, 'Approval action failed.')),
  });

  const items = data?.items ?? [];
  const latest = detail?.versions?.[0];
  const canEditCreative = !!detail && (
    manager || detail.createdById === user?.id || detail.assigneeId === user?.id
  );
  const canUploadRevision = canEditCreative && detail && [
    'draft', 'strategy_changes_requested', 'strategy_rejected', 'manager_changes_requested',
    'manager_rejected', 'final_approved', 'delivered',
  ].includes(detail.status);
  const isPrivileged = hasRole('Super Admin', 'Admin');
  const isOwnCreative = detail && (detail.createdById === user?.id || detail.assigneeId === user?.id);
  const canReviewStrategy = detail?.status === 'submitted_strategy' &&
    detail.strategyApproverId === user?.id && strategyRole && (!isOwnCreative || isPrivileged);
  const canReviewManager = detail?.status === 'pending_manager' &&
    detail.managerApproverId === user?.id && manager && (!isOwnCreative || isPrivileged);
  const canReview = canReviewStrategy || canReviewManager;
  const terminalStatuses = ['strategy_changes_requested', 'strategy_rejected', 'manager_changes_requested', 'manager_rejected'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Creative studio</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-gray-900">Creative Approval</h1>
          <p className="mt-1 text-sm text-gray-500">A clear strategy review followed by manager approval.</p>
        </div>
        <Button onClick={() => { setFormError(''); setShowCreate(true); }} className="gradient-brand-btn text-white">
          <Plus className="h-4 w-4" /> New creative
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Creatives', value: dashboard?.total ?? '—', color: 'text-gray-900', icon: FileImage },
          { label: 'Pending Strategy', value: dashboard?.pendingStrategy ?? '—', color: 'text-sky-700', icon: Clock3 },
          { label: 'Pending Manager', value: dashboard?.pendingManager ?? '—', color: 'text-violet-700', icon: BriefcaseBusiness },
          { label: 'Changes Requested', value: dashboard?.changesRequested ?? '—', color: 'text-amber-700', icon: RotateCcw },
          { label: 'Rejected', value: dashboard?.rejected ?? '—', color: 'text-rose-700', icon: Ban },
          { label: 'Final Approved', value: dashboard?.finalApproved ?? '—', color: 'text-emerald-700', icon: CheckCircle2 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="card-premium">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-500"><Icon className="h-4 w-4" /></span>
                  <span className={`text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</span>
                </div>
                <p className="mt-3 text-[11px] font-medium text-gray-500">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="card-premium overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${tab === item.key ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, client or campaign" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100" />
          </label>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500" /></div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <FileImage className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-semibold text-gray-700">No creatives found</p>
            <p className="mt-1 text-xs text-gray-400">Create a request to begin its approval journey.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => <CreativeCard key={item.id} item={item} onOpen={(id) => { setFormError(''); setSelectedId(id); }} />)}
          </div>
        )}
      </Card>

      {showCreate && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div><h2 className="text-lg font-semibold text-gray-900">Submit a creative</h2><p className="mt-1 text-xs text-gray-500">Assign both approvers before the first version enters review.</p></div>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-600">Creative name *</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" placeholder="Campaign launch banner" /></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Creative type</span><select value={form.creativeType} onChange={(event) => setForm({ ...form, creativeType: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="graphic">Graphic</option><option value="video">Video</option><option value="banner">Banner</option><option value="ad">Ad</option><option value="social_media">Social media post</option><option value="other">Other</option></select></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Client</span><select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value, projectId: '' })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">No client</option>{(resources?.clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Campaign / project</span><select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">No project</option>{(resources?.projects ?? []).filter((project) => !form.clientId || project.clientId === form.clientId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Campaign name</span><input value={form.campaign} onChange={(event) => setForm({ ...form, campaign: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" placeholder="Summer product launch" /></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Strategy approver *</span><select required value={form.strategyApproverId} onChange={(event) => setForm({ ...form, strategyApproverId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">Select strategy approver</option>{(approvers?.strategyApprovers ?? []).map((approver) => <option key={approver.id} value={approver.id} disabled={approver.id === form.managerApproverId}>{fullName(approver)}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Manager approver *</span><select required value={form.managerApproverId} onChange={(event) => setForm({ ...form, managerApproverId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">Select manager</option>{(approvers?.managerApprovers ?? []).map((approver) => <option key={approver.id} value={approver.id} disabled={approver.id === form.strategyApproverId}>{fullName(approver)}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Creative team member</span><select value={form.assigneeId || user?.id || ''} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm">{(resources?.assignees ?? []).map((assignee) => <option key={assignee.id} value={assignee.id}>{fullName(assignee)}{assignee.department?.name ? ` · ${assignee.department.name}` : ''}</option>)}</select></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-600">Creative link (optional)</span><input type="url" value={form.sourceLink} onChange={(event) => setForm({ ...form, sourceLink: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" placeholder="https://…" /></label>
                <div className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600">File or preview (optional)</span>
                  <div
                    onDragOver={(event) => { event.preventDefault(); setSubmissionDragOver(true); }}
                    onDragLeave={() => setSubmissionDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setSubmissionDragOver(false);
                      selectFile(event.dataTransfer.files[0] ?? null);
                    }}
                    onPaste={(event) => {
                      const file = fileFromClipboardItems(event.clipboardData?.items) ?? fileFromClipboardItems(event.clipboardData?.files);
                      if (file) { event.preventDefault(); handleClipboardPaste(file); }
                    }}
                    className={`rounded-xl border border-dashed p-3 transition ${submissionDragOver ? 'border-brand-400 bg-brand-50' : 'border-gray-300 bg-gray-50/60'}`}
                  >
                    <input
                      id="creative-submission-file"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.pdf"
                      className="sr-only"
                      onChange={(event) => {
                        selectFile(event.currentTarget.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                    {submissionFile && submissionPreview ? (
                      <div className="space-y-2">
                        <SelectedCreativeFile file={submissionFile} previewUrl={submissionPreview} pasted={pastedKind === 'submission'} onRemove={() => selectFile(null)} />
                        <div className="flex items-center justify-between">
                          <label htmlFor="creative-submission-file" className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700"><Upload className="h-3.5 w-3.5" />Replace file</label>
                          {pasteFlash && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-300">Pasted via Ctrl+V ✓</span>}
                        </div>
                      </div>
                    ) : (
                      <label htmlFor="creative-submission-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 py-5 text-center">
                        <Upload className="h-5 w-5 text-gray-400" />
                        <span className="text-xs font-medium text-gray-700">Drop a file here, click to browse, or press <kbd className="rounded border border-gray-300 bg-white px-1 py-px font-mono text-[10px]">Ctrl</kbd>+<kbd className="rounded border border-gray-300 bg-white px-1 py-px font-mono text-[10px]">V</kbd> to paste screenshot</span>
                        <span className="text-[10px] text-gray-400">JPG, JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF</span>
                        <button
                          type="button"
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); void pasteFromClipboardButton(); }}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <ClipboardPaste className="h-3.5 w-3.5" /> Paste from Clipboard
                        </button>
                        {pasteFlash && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-300">Pasted via Ctrl+V ✓</span>}
                      </label>
                    )}
                  </div>
                </div>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-600">Submission notes</span><textarea rows={3} value={form.submissionNotes} onChange={(event) => setForm({ ...form, submissionNotes: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" placeholder="Include context and what the approvers should review." /></label>
              </div>
              {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}
              {createCreative.isPending && submissionFile && (
                <div aria-live="polite">
                  <div className="mb-1 flex justify-between text-[11px] text-gray-500"><span>Uploading {submissionFile.name}</span><span>{uploadProgress}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => { setFormError(''); createCreative.mutate(); }} disabled={createCreative.isPending || !form.title.trim() || !form.strategyApproverId || !form.managerApproverId || form.strategyApproverId === form.managerApproverId} className="gradient-brand-btn text-white">{createCreative.isPending ? submissionFile ? `Uploading ${uploadProgress}%` : 'Saving…' : submissionFile || form.sourceLink.trim() ? 'Create & submit' : 'Save draft'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )}

      {selectedId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={() => { setSelectedId(null); setFormError(''); }}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-gray-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {detailLoading && !detail ? (
              <div className="flex h-full items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500" /></div>
            ) : detail ? (
              <div className="min-h-full">
                <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
                  <div className="min-w-0"><h2 className="truncate text-lg font-semibold text-gray-900">{detail.title}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={detail.status} /><span className="text-[11px] capitalize text-gray-400">{detail.creativeType?.replace('_', ' ')}</span><span className="text-[11px] text-gray-400">Updated {fmtDate(detail.updatedAt)}</span></div></div>
                  <button onClick={() => { setSelectedId(null); setFormError(''); }} className="ml-3 rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close details"><X className="h-5 w-5" /></button>
                </div>

                <div className="space-y-4 p-4 sm:p-6">
                  <Card className="card-premium">
                    <CardContent className="p-4 sm:p-5">
                      <WorkflowSteps status={detail.status} />
                      {manager ? (
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <label><span className="mb-1 block text-[10px] font-medium text-gray-500">Strategy approver</span><select value={detail.strategyApproverId ?? ''} disabled={updateAssignments.isPending} onChange={(event) => updateAssignments.mutate({ strategyApproverId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"><option value="">Unassigned</option>{(approvers?.strategyApprovers ?? []).map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}</select></label>
                          <label><span className="mb-1 block text-[10px] font-medium text-gray-500">Manager approver</span><select value={detail.managerApproverId ?? ''} disabled={updateAssignments.isPending} onChange={(event) => updateAssignments.mutate({ managerApproverId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"><option value="">Unassigned</option>{(approvers?.managerApprovers ?? []).map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}</select></label>
                          <label><span className="mb-1 block text-[10px] font-medium text-gray-500">Creative team</span><select value={detail.assigneeId ?? ''} disabled={updateAssignments.isPending} onChange={(event) => updateAssignments.mutate({ assigneeId: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"><option value="">Unassigned</option>{(resources?.assignees ?? []).map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}</select></label>
                        </div>
                      ) : (
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          <PersonLine label="Strategy approver" person={detail.strategyApprover} />
                          <PersonLine label="Manager approver" person={detail.managerApprover} />
                          <PersonLine label="Creative team" person={detail.assignee} />
                        </div>
                      )}
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <PersonLine label="Submitted by" person={detail.createdBy} />
                      </div>
                      {updateAssignments.isError && <p className="mt-3 text-xs text-rose-600">{formError}</p>}
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                    <Card className="card-premium overflow-hidden">
                      <CardContent className="p-4">
                        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">Current version · v{latest?.version ?? '—'}</h3>{latest && <span className="text-[11px] text-gray-400">{fmtDate(latest.createdAt)}</span>}</div>
                        <CreativePreview version={latest} title={detail.title} />
                        {latest?.notes && <p className="mt-3 text-xs text-gray-600">{latest.notes}</p>}
                      </CardContent>
                    </Card>
                    <Card className="card-premium">
                      <CardContent className="space-y-3 p-4">
                        <h3 className="text-sm font-semibold text-gray-900">Creative details</h3>
                        <div className="space-y-2 text-xs">
                          <PersonLine label="Client" person={detail.client ? { firstName: detail.client.name, lastName: '' } : null} />
                          <PersonLine label="Project" person={detail.project ? { firstName: detail.project.name, lastName: '' } : null} />
                          <PersonLine label="Campaign" person={detail.campaign ? { firstName: detail.campaign, lastName: '' } : null} />
                          <div className="flex justify-between gap-3"><span className="text-gray-500">Deadline</span><span className="font-medium text-gray-800">{fmtDate(detail.deadline)}</span></div>
                        </div>
                        {detail.brief && <div className="border-t border-gray-100 pt-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Brief</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">{detail.brief}</p></div>}
                        {detail.requirements && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Requirements</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">{detail.requirements}</p></div>}
                        {detail.submissionNotes && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Submission notes</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">{detail.submissionNotes}</p></div>}
                        {detail.sourceLink && <a href={detail.sourceLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700"><ExternalLink className="h-3.5 w-3.5" />Open creative link</a>}
                      </CardContent>
                    </Card>
                  </div>

                  {canReview && (
                    <Card className="border-brand-100 bg-brand-50/60">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="text-sm font-semibold text-gray-900">Your {canReviewStrategy ? 'strategy' : 'manager'} review is pending</p><p className="mt-1 text-xs text-gray-500">Record a decision and message for version {latest?.version}.</p></div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => setAction('approve')} className="gradient-brand-btn text-white"><Check className="h-3.5 w-3.5" />Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => setAction('changes')}><RotateCcw className="h-3.5 w-3.5" />Request changes</Button>
                          <Button size="sm" variant="outline" onClick={() => setAction('reject')} className="border-rose-200 text-rose-700"><Ban className="h-3.5 w-3.5" />Reject</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {canUploadRevision && (
                    <Card className="card-premium">
                      <CardContent className="space-y-3 p-4">
                        <div><h3 className="text-sm font-semibold text-gray-900">Upload a revised version</h3><p className="mt-1 text-xs text-gray-500">{terminalStatuses.includes(detail.status) ? 'Resubmitting a revision restarts Strategy review, then Manager review.' : 'The first submitted version enters Strategy review.'}</p></div>
                        <div
                          onDragOver={(event) => { event.preventDefault(); setRevisionDragOver(true); }}
                          onDragLeave={() => setRevisionDragOver(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setRevisionDragOver(false);
                            selectFile(event.dataTransfer.files[0] ?? null, true);
                          }}
                          onPaste={(event) => {
                            const file = fileFromClipboardItems(event.clipboardData?.items) ?? fileFromClipboardItems(event.clipboardData?.files);
                            if (file) { event.preventDefault(); handleClipboardPaste(file); }
                          }}
                          className={`rounded-xl border border-dashed p-3 transition ${revisionDragOver ? 'border-brand-400 bg-brand-50' : 'border-gray-300 bg-gray-50/60'}`}
                        >
                          <input
                            id="creative-revision-file"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.pdf"
                            className="sr-only"
                            onChange={(event) => {
                              selectFile(event.currentTarget.files?.[0] ?? null, true);
                              event.currentTarget.value = '';
                            }}
                          />
                          {revisionFile && revisionPreview ? (
                            <div className="space-y-2">
                              <SelectedCreativeFile file={revisionFile} previewUrl={revisionPreview} pasted={pastedKind === 'revision'} onRemove={() => selectFile(null, true)} />
                              <div className="flex items-center justify-between">
                                <label htmlFor="creative-revision-file" className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700"><Upload className="h-3.5 w-3.5" />Replace file</label>
                                {pasteFlash && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-300">Pasted via Ctrl+V ✓</span>}
                              </div>
                            </div>
                          ) : (
                            <label htmlFor="creative-revision-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 py-4 text-center">
                              <Upload className="h-5 w-5 text-gray-400" />
                              <span className="text-xs font-medium text-gray-700">Drop the revised file here, click to browse, or press Ctrl+V to paste screenshot</span>
                              <span className="text-[10px] text-gray-400">JPG, JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF</span>
                              <button
                                type="button"
                                onClick={(event) => { event.preventDefault(); event.stopPropagation(); void pasteFromClipboardButton(); }}
                                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                <ClipboardPaste className="h-3.5 w-3.5" /> Paste from Clipboard
                              </button>
                            </label>
                          )}
                        </div>
                        <input type="url" value={revisionLink} onChange={(event) => setRevisionLink(event.target.value)} placeholder="or paste creative link" className="rounded-lg border border-gray-200 px-3 py-2 text-xs" />
                        {uploadRevision.isPending && revisionFile && (
                          <div className="sm:col-span-2" aria-live="polite">
                            <div className="mb-1 flex justify-between text-[11px] text-gray-500"><span>Uploading {revisionFile.name}</span><span>{revisionUploadProgress}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${revisionUploadProgress}%` }} /></div>
                          </div>
                        )}
                        <input value={revisionNotes} onChange={(event) => setRevisionNotes(event.target.value)} placeholder="Revision notes" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" />
                        {formError && <p className="text-xs text-rose-600">{formError}</p>}
                        <Button size="sm" onClick={() => { setFormError(''); uploadRevision.mutate(); }} disabled={uploadRevision.isPending || (!revisionFile && !revisionLink.trim())} className="gradient-brand-btn text-white">{uploadRevision.isPending ? 'Submitting…' : 'Submit revised version'}</Button>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="card-premium">
                      <CardContent className="p-4">
                        <div className="mb-4 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-semibold text-gray-900">Approval timeline</h3></div>
                        <div className="space-y-4">
                          {(detail.approvalEvents ?? []).map((event) => (
                            <div key={event.id} className="relative border-l border-gray-200 pl-4">
                              <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
                              <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold capitalize text-gray-800">{event.stage.replace(/_/g, ' ')} · {event.action.replace(/_/g, ' ')}</p><time className="shrink-0 text-[10px] text-gray-400">{fmtDateTime(event.createdAt)}</time></div>
                              <p className="mt-1 text-[11px] text-gray-500">{event.actor?.firstName ? fullName(event.actor) : event.actorName ?? 'Former user'}{event.version ? ` · v${event.version.version}` : ''}</p>
                              {event.message && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-700">{event.message}</p>}
                            </div>
                          ))}
                          {!detail.approvalEvents?.length && <p className="text-xs text-gray-400">No approval activity yet.</p>}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="card-premium">
                      <CardContent className="p-4">
                        <div className="mb-4 flex items-center gap-2"><History className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-semibold text-gray-900">Previous versions</h3></div>
                        <div className="space-y-2">
                          {(detail.versions ?? []).map((version) => (
                            <div key={version.id} className={`rounded-xl border p-3 ${version.id === latest?.id ? 'border-brand-200 bg-brand-50/50' : 'border-gray-100 bg-white'}`}>
                              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-800">Version {version.version}{version.id === latest?.id ? ' · current' : ''}</p><span className="text-[10px] capitalize text-gray-500">{version.status.replace(/_/g, ' ')}</span></div>
                              <p className="mt-1 text-[10px] text-gray-400">{fmtDateTime(version.createdAt)}{version.fileName ? ` · ${version.fileName}` : ''}</p>
                              {version.notes && <p className="mt-2 text-[11px] text-gray-600">{version.notes}</p>}
                              {version.feedback && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">{version.feedback}</p>}
                            </div>
                          ))}
                          {!detail.versions?.length && <p className="text-xs text-gray-400">No creative versions yet.</p>}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  {formError && !canUploadRevision && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      )}

      {action && detail && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => { setAction(null); setMessage(''); }}>
          <Card className="w-full max-w-md shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between px-5 pt-5">
              <div><h2 className="text-base font-semibold text-gray-900 capitalize">{action === 'changes' ? 'Request changes' : action === 'approve' ? 'Approve creative' : 'Reject creative'}</h2><p className="mt-1 text-xs text-gray-500">{canReviewStrategy ? 'Strategy approval' : 'Manager approval'} · version {latest?.version}</p></div>
              <button onClick={() => { setAction(null); setMessage(''); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <CardContent className="space-y-3 p-5">
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-600">Message {action === 'approve' ? '(optional)' : '*'}</span><textarea autoFocus rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={action === 'approve' ? 'Add an approval note…' : 'Explain what needs to change or why this is rejected…'} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100" /></label>
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setAction(null); setMessage(''); }}>Cancel</Button>
                <Button onClick={() => { setFormError(''); review.mutate(); }} disabled={review.isPending || (action !== 'approve' && !message.trim())} className={action === 'reject' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'gradient-brand-btn text-white'}>{review.isPending ? 'Saving…' : 'Confirm action'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )}
    </div>
  );
}
