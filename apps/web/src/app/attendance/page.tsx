'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileClock,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Search,
  Settings2,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage, useToast } from '@/components/ui/toast';

const AttendanceCamera = dynamic(() => import('../attendance-camera'), { ssr: false });

type AttendanceSession = {
  id: string;
  checkIn: string;
  checkOut: string | null;
  checkInPhotoUrl: string | null;
  checkOutPhotoUrl: string | null;
  source: string;
};

type AttendanceRecord = {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number | null;
  status: string;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  halfDay: boolean;
  notes: string | null;
  user?: { id: string; firstName: string; lastName: string; department?: { name: string } | null };
  sessions: AttendanceSession[];
};

type AttendancePolicy = {
  officeStartTime: string;
  officeEndTime: string;
  gracePeriodMinutes: number;
  breakDeductionMinutes: number;
  fullDayMinimumMinutes: number;
  halfDayMinimumMinutes: number;
  halfDaysPerDeduction: number;
  weeklyOffDays: string[];
  firstSaturdayOff: boolean;
  belowHalfDayStatus: string;
  overtimeMode: string;
  trackEarlyDeparture: boolean;
  timeZone: string;
};

type AttendanceEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  department?: { name: string } | null;
};

type AttendanceReportRow = {
  user: AttendanceEmployee;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  onTimeDays: number;
  workingMinutes: number;
  completedMinutes: number;
  expectedMinutes: number;
  attendancePercentage: number;
  halfDayDeductionEquivalent: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  completedWorkingDays: number;
  averageDailyMinutes: number;
};

type AttendanceDashboard = {
  date: string;
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateArrivals: number;
  onTimeEmployees: number;
  halfDays: number;
  currentlyWorking: number;
  notPunchedIn: number;
  averageWorkingHours: number;
  monthly: AttendanceReportRow[];
  currentlyWorkingEmployees: { user: AttendanceEmployee; checkIn: string | null }[];
  lateEmployees: AttendanceEmployee[];
  absentEmployees: AttendanceEmployee[];
};

type AttendanceCorrection = {
  id: string;
  date: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  status: string;
  reviewNotes: string | null;
  user?: AttendanceEmployee;
  requestedBy?: AttendanceEmployee;
};

type AttendanceHoliday = { id: string; name: string; date: string };
type ReportTotals = { present: number; absent: number; half: number; late: number; onTime: number };

const STATUS_LABELS: Record<string, string> = {
  absent: 'Absent',
  on_time: 'On time',
  slightly_late: 'Slightly late',
  late: 'Late',
  half_day: 'Half day',
  present: 'Present',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_STYLES: Record<string, string> = {
  absent: 'bg-rose-50 text-rose-700 ring-rose-100',
  late: 'bg-rose-50 text-rose-700 ring-rose-100',
  slightly_late: 'bg-amber-50 text-amber-700 ring-amber-100',
  half_day: 'bg-orange-50 text-orange-700 ring-orange-100',
  on_time: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  present: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-100',
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatTime(value: string | null | undefined, timeZone: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string | Date | null | undefined, timeZone: string) {
  if (!value) return '—';
  const isDateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: isDateOnly ? 'UTC' : timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isDateOnly ? `${value}T00:00:00.000Z` : value));
}

function timeInputInZone(value: string | null, timeZone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.hour}:${fields.minute}`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
      {STATUS_LABELS[status] ?? status.replaceAll('_', ' ')}
    </span>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: ElementType;
  tone?: 'brand' | 'amber' | 'rose' | 'blue';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-sky-50 text-sky-700',
  };
  return (
    <Card className="card-premium">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
          {detail && <p className="mt-1 truncate text-[11px] text-gray-400">{detail}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function ProtectedPhotoDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const photoQuery = useQuery({
    queryKey: ['attendance-photo', url],
    queryFn: () => api.get(url, { responseType: 'blob' }).then((response) => response.data as Blob),
    staleTime: 5 * 60 * 1000,
  });
  const objectUrl = useMemo(
    () => photoQuery.data ? URL.createObjectURL(photoQuery.data) : '',
    [photoQuery.data],
  );
  useEffect(() => {
    if (objectUrl) return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Attendance photo">
      <div className="w-[95vw] sm:w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Attendance verification photo</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Close photo" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex min-h-48 items-center justify-center bg-gray-50 p-4">
          {photoQuery.isPending && <p className="text-sm text-gray-500">Loading secure photo…</p>}
          {photoQuery.isError && <p role="alert" className="text-sm text-rose-600">Could not load this attendance photo.</p>}
          {objectUrl && <Image src={objectUrl} alt="Attendance verification" width={1600} height={1200} unoptimized className="max-h-[70vh] max-w-full rounded-lg object-contain" />}
        </div>
      </div>
    </div>
  );
}

function PhotoButton({ url, label, onSelect }: { url: string | null; label: string; onSelect: (url: string) => void }) {
  if (!url) return <span className="text-xs text-gray-300">—</span>;
  return (
    <button type="button" onClick={() => onSelect(url)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
      <ImageIcon className="h-3.5 w-3.5" />{label}
    </button>
  );
}

function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-700">{value}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export default function AttendancePage() {
  const { role, user } = useAuth();
  const isHr = role === 'admin' || role === 'hr';
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState(isHr ? 'dashboard' : 'overview');
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cameraAction, setCameraAction] = useState<'check-in' | 'check-out' | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState('');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionCheckIn, setCorrectionCheckIn] = useState('');
  const [correctionCheckOut, setCorrectionCheckOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [settingsForm, setSettingsForm] = useState<AttendancePolicy | null>(null);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const todayQuery = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then((response) => response.data),
  });
  const dashboardQuery = useQuery<AttendanceDashboard>({
    queryKey: ['attendance-dashboard', month],
    queryFn: () => api.get('/attendance/dashboard', { params: { month } }).then((response) => response.data as AttendanceDashboard),
    enabled: isHr && tab === 'dashboard',
  });
  const reportQuery = useQuery<AttendanceReportRow[]>({
    queryKey: ['attendance-report', month],
    queryFn: () => api.get('/attendance/report', { params: { month } }).then((response) => response.data as AttendanceReportRow[]),
    enabled: isHr && tab === 'reports',
  });
  const historyQuery = useQuery({
    queryKey: ['attendance', month, debouncedSearch, statusFilter],
    queryFn: () => api.get('/attendance', {
      params: {
        month,
        ...(isHr ? {} : { mine: 'true' }),
        ...(isHr && debouncedSearch ? { search: debouncedSearch } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }).then((response) => response.data as AttendanceRecord[]),
    enabled: tab === 'records' || tab === 'history',
  });
  const settingsQuery = useQuery({
    queryKey: ['attendance-settings'],
    queryFn: () => api.get('/attendance/settings').then((response) => response.data as AttendancePolicy),
    enabled: isHr && tab === 'settings',
  });
  const correctionsQuery = useQuery<AttendanceCorrection[]>({
    queryKey: ['attendance-corrections', isHr, isHr ? 'pending' : 'mine'],
    queryFn: () => api.get(isHr ? '/attendance/corrections' : '/attendance/corrections/mine', {
      params: isHr ? { status: 'pending' } : undefined,
    }).then((response) => response.data as AttendanceCorrection[]),
    enabled: tab === 'corrections',
  });
  const holidaysQuery = useQuery<AttendanceHoliday[]>({
    queryKey: ['attendance-holidays'],
    queryFn: () => api.get('/leave/holidays').then((response) => response.data as AttendanceHoliday[]),
    enabled: isHr && tab === 'settings',
  });
  const today = todayQuery.data;
  const activeSettings = settingsForm ?? settingsQuery.data ?? null;
  const correctionDateValue = correctionDate || today?.date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const invalidateAttendance = () => {
    void queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
  };

  const updateSettings = useMutation({
    mutationFn: (settings: AttendancePolicy) => api.put('/attendance/settings', settings).then((response) => response.data),
    onSuccess: (settings) => {
      queryClient.setQueryData(['attendance-settings'], settings);
      void queryClient.invalidateQueries({ queryKey: ['attendance-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      toast.success('Attendance policy saved');
    },
    onError: (error) => toast.error('Could not save attendance settings', errorMessage(error)),
  });
  const submitCorrection = useMutation({
    mutationFn: () => api.post('/attendance/corrections', {
      date: correctionDateValue,
      ...(correctionCheckIn ? { requestedCheckInTime: correctionCheckIn } : {}),
      ...(correctionCheckOut ? { requestedCheckOutTime: correctionCheckOut } : {}),
      reason: correctionReason,
    }),
    onSuccess: () => {
      setCorrectionCheckIn('');
      setCorrectionCheckOut('');
      setCorrectionReason('');
      void queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      toast.success('Correction request submitted', 'An attendance administrator will review your request.');
    },
    onError: (error) => toast.error('Could not submit correction', errorMessage(error)),
  });
  const decideCorrection = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api.patch(`/attendance/corrections/${id}`, { status }).then((response) => response.data),
    onSuccess: () => {
      invalidateAttendance();
      toast.success('Correction reviewed');
    },
    onError: (error) => toast.error('Could not review correction', errorMessage(error)),
  });
  const editAttendance = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, string> }) =>
      api.patch(`/attendance/${id}`, values).then((response) => response.data),
    onSuccess: () => {
      setEditingRecord(null);
      invalidateAttendance();
      toast.success('Attendance record updated', 'The change was added to the audit log.');
    },
    onError: (error) => toast.error('Could not update attendance record', errorMessage(error)),
  });
  const addHoliday = useMutation({
    mutationFn: () => api.post('/leave/holidays', { name: holidayName.trim(), date: holidayDate }),
    onSuccess: () => {
      setHolidayName('');
      setHolidayDate('');
      void queryClient.invalidateQueries({ queryKey: ['attendance-holidays'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      toast.success('Holiday added');
    },
    onError: (error) => toast.error('Could not add holiday', errorMessage(error)),
  });
  const removeHoliday = useMutation({
    mutationFn: (id: string) => api.delete(`/leave/holidays/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance-holidays'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      toast.success('Holiday removed');
    },
    onError: (error) => toast.error('Could not remove holiday', errorMessage(error)),
  });

  const timeZone = today?.timeZone || activeSettings?.timeZone || 'UTC';
  const todayMetrics = today?.metrics;
  const ongoingSession = today?.sessions?.find((session: AttendanceSession) => !session.checkOut);
  const liveMinutes = (todayMetrics?.workingMinutes ?? 0) +
    (ongoingSession ? Math.floor((clock.getTime() - todayQuery.dataUpdatedAt) / 60_000) : 0);
  const monthly = today?.monthly;
  const history = historyQuery.data ?? [];
  const dashboard = dashboardQuery.data;
  const report = useMemo(
    () => tab === 'reports' ? (reportQuery.data ?? []) : (dashboard?.monthly ?? []),
    [tab, reportQuery.data, dashboard?.monthly],
  );
  const reportTotals = useMemo<ReportTotals>(() => report.reduce((total, row) => ({
    present: total.present + row.presentDays,
    absent: total.absent + row.absentDays,
    half: total.half + row.halfDays,
    late: total.late + row.lateDays,
    onTime: total.onTime + row.onTimeDays,
  }), { present: 0, absent: 0, half: 0, late: 0, onTime: 0 }), [report]);
  const chartTotal = reportTotals.present + reportTotals.absent + reportTotals.half;

  const tabs = isHr
    ? [
      { id: 'dashboard', label: 'Dashboard', icon: CalendarDays },
      { id: 'records', label: 'Records', icon: FileClock },
      { id: 'reports', label: 'Monthly reports', icon: Download },
      { id: 'corrections', label: 'Corrections', icon: ShieldCheck },
      { id: 'settings', label: 'Settings', icon: Settings2 },
    ]
    : [
      { id: 'overview', label: 'My attendance', icon: Clock3 },
      { id: 'history', label: 'History', icon: CalendarDays },
      { id: 'corrections', label: 'Corrections', icon: ShieldCheck },
    ];

  const openEdit = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditCheckIn(timeInputInZone(record.checkIn, timeZone));
    setEditCheckOut(timeInputInZone(record.checkOut, timeZone));
    setEditNotes(record.notes ?? '');
  };

  const exportReport = () => {
    const columns = [
      'Employee', 'Department', 'Working days', 'Present', 'Absent', 'Half days', 'Late days',
      'On time', 'Working hours', 'Expected hours', 'Attendance %', 'Half-day deduction',
      'Late minutes', 'Early departure minutes', 'Overtime minutes',
    ];
    const rows: (string | number)[][] = report.map((entry) => [
      `${entry.user.firstName} ${entry.user.lastName}`,
      entry.user.department?.name ?? '',
      entry.totalWorkingDays,
      entry.presentDays,
      entry.absentDays,
      entry.halfDays,
      entry.lateDays,
      entry.onTimeDays,
      (entry.workingMinutes / 60).toFixed(2),
      (entry.expectedMinutes / 60).toFixed(2),
      entry.attendancePercentage,
      entry.halfDayDeductionEquivalent,
      entry.lateMinutes,
      entry.earlyDepartureMinutes,
      entry.overtimeMinutes,
    ]);
    const csv = [columns, ...rows].map((row) =>
      row.map((cell: string | number) => `"${String(cell).replaceAll('"', '""')}"`).join(','),
    ).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${month}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">People operations</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-gray-900">Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isHr ? 'Monitor attendance, review corrections and manage company policy.' : 'Your attendance, working hours and monthly summary.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock3 className="h-4 w-4 text-brand-600" />
          <span>{today ? formatDate(today.date, `${timeZone}`) : 'Today'}</span>
          <span className="text-gray-300">·</span>
          <span>{new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(clock)}</span>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-100 bg-white/70 p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {todayQuery.isError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load your attendance. {errorMessage(todayQuery.error)}
        </div>
      )}

      {(tab === 'overview' || tab === 'dashboard') && (
        <div className="space-y-5">
          <Card className="card-premium overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
                    <p className="mt-1 text-xs text-gray-500">Office shift · {today?.settings?.officeStartTime ?? '10:30'} – {today?.settings?.officeEndTime ?? '19:00'} ({timeZone})</p>
                  </div>
                  {todayMetrics && <StatusBadge status={todayMetrics.status} />}
                </div>
                <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Working duration today</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight text-gray-900">{formatDuration(liveMinutes)}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      {todayMetrics?.firstCheckIn
                        ? `Punched in ${formatTime(todayMetrics.firstCheckIn, timeZone)}`
                        : 'No punch recorded yet'}
                      {todayMetrics?.lateMinutes > 0 && ` · ${todayMetrics.lateMinutes} minutes late`}
                      {todayMetrics?.isOngoing && ' · session ongoing'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => setCameraAction('check-in')} disabled={todayQuery.isPending || !!todayMetrics?.isOngoing} className="gradient-brand-btn text-white">
                      <LogIn className="h-4 w-4" />Punch in
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setCameraAction('check-out')} disabled={todayQuery.isPending || !todayMetrics?.isOngoing}>
                      <LogOut className="h-4 w-4" />Punch out
                    </Button>
                  </div>
                </div>
                {!!today?.sessions?.length && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {today.sessions.map((session: AttendanceSession, index: number) => (
                      <div key={session.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <span>Session {index + 1}</span>
                        <span className="font-medium text-gray-800">{formatTime(session.checkIn, timeZone)}</span>
                        <PhotoButton url={session.checkInPhotoUrl} label="In photo" onSelect={setSelectedPhoto} />
                        <span className="text-gray-300">→</span>
                        <span className="font-medium text-gray-800">{formatTime(session.checkOut, timeZone)}</span>
                        <PhotoButton url={session.checkOutPhotoUrl} label="Out photo" onSelect={setSelectedPhoto} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 bg-gradient-to-br from-brand-50/60 to-white p-5 sm:p-6 lg:border-l lg:border-t-0">
                {isHr ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Team presence</p>
                        <p className="mt-1 text-xs text-gray-500">{dashboard?.date ? formatDate(dashboard.date, timeZone) : 'Today'}</p>
                      </div>
                      <Users className="h-5 w-5 text-brand-600" />
                    </div>
                    {dashboardQuery.isPending ? (
                      <p className="mt-8 text-sm text-gray-400">Loading attendance summary…</p>
                    ) : dashboardQuery.isError ? (
                      <p role="alert" className="mt-8 text-sm text-rose-600">Could not load team attendance.</p>
                    ) : (
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Present</p><p className="mt-1 text-xl font-semibold text-emerald-700">{dashboard?.presentToday ?? 0}<span className="ml-1 text-xs font-normal text-gray-400">/ {dashboard?.totalEmployees ?? 0}</span></p></div>
                        <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Currently working</p><p className="mt-1 text-xl font-semibold text-gray-900">{dashboard?.currentlyWorking ?? 0}</p></div>
                        <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Late arrivals</p><p className="mt-1 text-xl font-semibold text-amber-700">{dashboard?.lateArrivals ?? 0}</p></div>
                        <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Not punched in</p><p className="mt-1 text-xl font-semibold text-rose-700">{dashboard?.notPunchedIn ?? 0}</p></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-900">This month</p>
                    <p className="mt-1 text-xs text-gray-500">{monthly?.totalWorkingDays ?? 0} scheduled working days to date</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Present days</p><p className="mt-1 text-xl font-semibold text-gray-900">{monthly?.presentDays ?? 0}</p></div>
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Attendance</p><p className="mt-1 text-xl font-semibold text-brand-700">{monthly?.attendancePercentage ?? 0}%</p></div>
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Working hours</p><p className="mt-1 text-xl font-semibold text-gray-900">{formatDuration(monthly?.workingMinutes ?? 0)}</p></div>
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">This week</p><p className="mt-1 text-xl font-semibold text-gray-900">{formatDuration(today?.weeklyMinutes ?? 0)}</p></div>
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Half days</p><p className="mt-1 text-xl font-semibold text-orange-700">{monthly?.halfDays ?? 0}<span className="ml-1 text-[11px] font-normal text-gray-400">· {monthly?.halfDayDeductionEquivalent ?? 0} day deduction</span></p></div>
                      <div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-gray-500">Late days</p><p className="mt-1 text-xl font-semibold text-amber-700">{monthly?.lateDays ?? 0}</p></div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {isHr && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total employees" value={dashboard?.totalEmployees ?? '—'} icon={Users} />
              <StatCard label="Present today" value={dashboard?.presentToday ?? '—'} detail={`${dashboard?.currentlyWorking ?? 0} currently working`} icon={UserCheck} />
              <StatCard label="Absent today" value={dashboard?.absentToday ?? '—'} icon={UserRoundX} tone="rose" />
              <StatCard label="Average working hours" value={dashboard ? `${dashboard.averageWorkingHours}h` : '—'} icon={Clock3} tone="blue" />
              <StatCard label="Late arrivals" value={dashboard?.lateArrivals ?? '—'} icon={Clock3} tone="amber" />
              <StatCard label="On time" value={dashboard?.onTimeEmployees ?? '—'} icon={CheckCircle2} />
              <StatCard label="Half days today" value={dashboard?.halfDays ?? '—'} icon={FileClock} tone="amber" />
              <StatCard label="Not punched in" value={dashboard?.notPunchedIn ?? '—'} icon={XCircle} tone="rose" />
            </div>
          )}

          {isHr && dashboard && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="card-premium">
                <CardHeader className="pb-3"><CardTitle>Currently working</CardTitle><p className="mt-1 text-xs text-gray-500">Open sessions awaiting punch out</p></CardHeader>
                <CardContent className="space-y-2">
                  {dashboard.currentlyWorkingEmployees.slice(0, 6).map((entry) => (
                    <div key={entry.user.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-gray-700">{entry.user.firstName} {entry.user.lastName}</span><span className="shrink-0 text-xs text-gray-400">{formatTime(entry.checkIn, timeZone)}</span></div>
                  ))}
                  {!dashboard.currentlyWorkingEmployees?.length && <p className="py-2 text-sm text-gray-400">No open sessions.</p>}
                </CardContent>
              </Card>
              <Card className="card-premium">
                <CardHeader className="pb-3"><CardTitle>Late arrivals</CardTitle><p className="mt-1 text-xs text-gray-500">Employees beyond the on-time threshold</p></CardHeader>
                <CardContent className="space-y-2">
                  {dashboard.lateEmployees.slice(0, 6).map((employee) => (
                    <div key={employee.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-gray-700">{employee.firstName} {employee.lastName}</span><span className="text-xs text-amber-700">Late</span></div>
                  ))}
                  {!dashboard.lateEmployees?.length && <p className="py-2 text-sm text-gray-400">No late arrivals today.</p>}
                </CardContent>
              </Card>
              <Card className="card-premium">
                <CardHeader className="pb-3"><CardTitle>Not punched in</CardTitle><p className="mt-1 text-xs text-gray-500">Absent from today&apos;s scheduled shift</p></CardHeader>
                <CardContent className="space-y-2">
                  {dashboard.absentEmployees.slice(0, 6).map((employee) => (
                    <div key={employee.id} className="truncate text-sm text-gray-700">{employee.firstName} {employee.lastName}</div>
                  ))}
                  {!dashboard.absentEmployees?.length && <p className="py-2 text-sm text-gray-400">No one is currently absent.</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {isHr && (
            <Card className="card-premium">
              <CardHeader className="flex-col items-stretch gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><CardTitle>Monthly attendance overview</CardTitle><p className="mt-1 text-xs text-gray-500">Month-to-date employee attendance summary</p></div>
                <input aria-label="Attendance report month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-400 sm:w-auto" />
              </CardHeader>
              <CardContent className="space-y-5">
                {dashboardQuery.isError && <p role="alert" className="text-sm text-rose-600">Could not load the attendance overview. {errorMessage(dashboardQuery.error)}</p>}
                {dashboardQuery.isPending ? <p className="py-4 text-sm text-gray-400">Loading monthly report…</p> : (
                  <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                    <div className="space-y-4 rounded-xl bg-gray-50/80 p-4">
                      <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-800">Attendance distribution</p><span className="text-xs text-gray-400">{chartTotal} day entries</span></div>
                      <MetricBar label="Present days" value={reportTotals.present} total={chartTotal} color="bg-emerald-500" />
                      <MetricBar label="Half days" value={reportTotals.half} total={chartTotal} color="bg-amber-400" />
                      <MetricBar label="Absent days" value={reportTotals.absent} total={chartTotal} color="bg-rose-400" />
                      <div className="flex flex-wrap gap-4 pt-1 text-xs text-gray-500">
                        <span>On time <strong className="ml-1 text-gray-800">{reportTotals.onTime}</strong></span>
                        <span>Late days <strong className="ml-1 text-gray-800">{reportTotals.late}</strong></span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left">
                        <thead><tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400"><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Present</th><th className="px-3 py-2">Absent</th><th className="px-3 py-2">Half days</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Attendance</th></tr></thead>
                        <tbody>
                          {report.slice(0, 8).map((entry) => (
                            <tr key={entry.user.id} className="border-b border-gray-50 last:border-0">
                              <td className="px-3 py-3 text-sm font-medium text-gray-800">{entry.user.firstName} {entry.user.lastName}</td>
                              <td className="px-3 py-3 text-sm text-gray-600">{entry.presentDays}</td>
                              <td className="px-3 py-3 text-sm text-gray-600">{entry.absentDays}</td>
                              <td className="px-3 py-3 text-sm text-gray-600">{entry.halfDays}</td>
                              <td className="px-3 py-3 text-sm text-gray-600">{formatDuration(entry.workingMinutes)}</td>
                              <td className="px-3 py-3 text-sm font-semibold text-brand-700">{entry.attendancePercentage}%</td>
                            </tr>
                          ))}
                          {!report.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">No employee attendance data</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'reports' && isHr && (
        <Card className="card-premium">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div><CardTitle>Monthly attendance report</CardTitle><p className="mt-1 text-xs text-gray-500">Working-day totals, hours, punctuality and half-day deductions</p></div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Report month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600" />
              <Button type="button" variant="outline" onClick={exportReport} disabled={!report.length}><Download className="h-4 w-4" />Export CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {reportQuery.isError && <p role="alert" className="px-5 py-4 text-sm text-rose-600">Could not load monthly reports. {errorMessage(reportQuery.error)}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left">
                <thead><tr className="border-y border-gray-100 bg-gray-50/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Working days</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Half days</th><th className="px-4 py-3">Deduction</th><th className="px-4 py-3">Late / on time</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Expected hours</th><th className="px-4 py-3">Attendance</th>
                </tr></thead>
                <tbody>
                  {reportQuery.isPending && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">Loading monthly report…</td></tr>}
                  {report.map((entry) => (
                    <tr key={entry.user.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-gray-800">{entry.user.firstName} {entry.user.lastName}</p><p className="text-[11px] text-gray-400">{entry.user.department?.name ?? entry.user.email}</p></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{entry.totalWorkingDays}</td><td className="px-4 py-3 text-sm text-gray-600">{entry.presentDays}</td><td className="px-4 py-3 text-sm text-gray-600">{entry.absentDays}</td><td className="px-4 py-3 text-sm text-gray-600">{entry.halfDays}</td><td className="px-4 py-3 text-sm text-gray-600">{entry.halfDayDeductionEquivalent} days</td><td className="px-4 py-3 text-sm text-gray-600">{entry.lateDays} / {entry.onTimeDays}</td><td className="px-4 py-3 text-sm text-gray-600">{formatDuration(entry.workingMinutes)}</td><td className="px-4 py-3 text-sm text-gray-600">{formatDuration(entry.expectedMinutes)}</td><td className="px-4 py-3 text-sm font-semibold text-brand-700">{entry.attendancePercentage}%</td>
                    </tr>
                  ))}
                  {!report.length && !reportQuery.isPending && <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No attendance for this month.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {(tab === 'records' || tab === 'history') && (
        <Card className="card-premium">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div><CardTitle>{isHr ? 'Attendance records' : 'My attendance history'}</CardTitle><p className="mt-1 text-xs text-gray-500">Punch sessions, hours, punctuality and verification photos</p></div>
            <div className="flex flex-wrap gap-2">
              {isHr && <label className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" className="h-9 w-48 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-400" /></label>}
              <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600">
                <option value="">All statuses</option>
                <option value="on_time">On time</option><option value="slightly_late">Slightly late</option><option value="late">Late</option><option value="half_day">Half day</option><option value="absent">Absent</option>
              </select>
              <input aria-label="Filter attendance month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {historyQuery.isError && <p role="alert" className="px-5 py-4 text-sm text-rose-600">Could not load records. {errorMessage(historyQuery.error)}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead><tr className="border-y border-gray-100 bg-gray-50/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {isHr && <th className="px-4 py-3">Employee</th>}<th className="px-4 py-3">Date</th><th className="px-4 py-3">Punch in</th><th className="px-4 py-3">Punch out</th><th className="px-4 py-3">Working hours</th><th className="px-4 py-3">Late / early</th><th className="px-4 py-3">Status</th>{isHr && <th className="px-4 py-3">Action</th>}
                </tr></thead>
                <tbody>
                  {historyQuery.isPending && <tr><td colSpan={isHr ? 8 : 6} className="px-4 py-10 text-center text-sm text-gray-400">Loading attendance…</td></tr>}
                  {history.map((record) => {
                    const first = record.sessions[0];
                    const last = record.sessions[record.sessions.length - 1];
                    return (
                      <tr key={record.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50/50">
                        {isHr && <td className="px-4 py-3"><p className="text-sm font-medium text-gray-800">{record.user?.firstName} {record.user?.lastName}</p><p className="text-[11px] text-gray-400">{record.user?.department?.name ?? 'No department'}</p></td>}
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.date, timeZone)}</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2 text-sm text-gray-600">{formatTime(record.checkIn, timeZone)}<PhotoButton url={first?.checkInPhotoUrl ?? null} label="Photo" onSelect={setSelectedPhoto} /></div></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2 text-sm text-gray-600">{formatTime(record.checkOut, timeZone)}<PhotoButton url={last?.checkOutPhotoUrl ?? null} label="Photo" onSelect={setSelectedPhoto} /></div></td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.totalHours !== null ? `${record.totalHours}h` : record.checkIn && !record.checkOut ? 'Ongoing' : '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{record.lateMinutes ? `${record.lateMinutes}m late` : '—'}{record.earlyDepartureMinutes ? ` · ${record.earlyDepartureMinutes}m early` : ''}</td>
                        <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                        {isHr && <td className="px-4 py-3"><Button type="button" size="sm" variant="outline" onClick={() => openEdit(record)}>Edit</Button></td>}
                      </tr>
                    );
                  })}
                  {!history.length && !historyQuery.isPending && <tr><td colSpan={isHr ? 8 : 6} className="px-4 py-12 text-center text-sm text-gray-400">No attendance records for this month.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'corrections' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {!isHr && (
            <Card className="card-premium">
              <CardHeader><CardTitle>Request an attendance correction</CardTitle><p className="mt-1 text-xs text-gray-500">Explain the missed or incorrect punch. HR will review it.</p></CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submitCorrection.mutate(); }}>
                  <label className="block space-y-1.5 text-xs font-medium text-gray-600">Attendance date<input required type="date" value={correctionDateValue} onChange={(event) => setCorrectionDate(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5 text-xs font-medium text-gray-600">Requested punch in<input type="time" value={correctionCheckIn} onChange={(event) => setCorrectionCheckIn(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                    <label className="block space-y-1.5 text-xs font-medium text-gray-600">Requested punch out<input type="time" value={correctionCheckOut} onChange={(event) => setCorrectionCheckOut(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                  </div>
                  <label className="block space-y-1.5 text-xs font-medium text-gray-600">Reason<textarea required maxLength={1000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Add context for the correction" /></label>
                  <Button type="submit" disabled={submitCorrection.isPending} className="gradient-brand-btn text-white">Submit for review</Button>
                </form>
              </CardContent>
            </Card>
          )}
          <Card className="card-premium">
            <CardHeader><CardTitle>{isHr ? 'Pending correction requests' : 'My correction requests'}</CardTitle><p className="mt-1 text-xs text-gray-500">{isHr ? 'Review employee-submitted corrections.' : 'Track the approval status of your requests.'}</p></CardHeader>
            <CardContent className="space-y-3">
              {correctionsQuery.isError && <p role="alert" className="text-sm text-rose-600">Could not load correction requests. {errorMessage(correctionsQuery.error)}</p>}
              {correctionsQuery.isPending && <p className="text-sm text-gray-400">Loading correction requests…</p>}
              {(correctionsQuery.data ?? []).map((correction) => (
                <div key={correction.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{correction.user ? `${correction.user.firstName} ${correction.user.lastName}` : formatDate(correction.date, timeZone)}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(correction.date, timeZone)} · Submitted by {correction.requestedBy ? `${correction.requestedBy.firstName} ${correction.requestedBy.lastName}` : 'you'}</p>
                    </div>
                    <StatusBadge status={correction.status} />
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{correction.reason}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Requested: {correction.requestedCheckIn ? formatTime(correction.requestedCheckIn, timeZone) : '—'} – {correction.requestedCheckOut ? formatTime(correction.requestedCheckOut, timeZone) : '—'}
                  </p>
                  {correction.reviewNotes && <p className="mt-2 text-xs text-gray-500">Review note: {correction.reviewNotes}</p>}
                  {isHr && correction.status === 'pending' && (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" onClick={() => decideCorrection.mutate({ id: correction.id, status: 'approved' })} disabled={decideCorrection.isPending}><Check className="h-3.5 w-3.5" />Approve</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => decideCorrection.mutate({ id: correction.id, status: 'rejected' })} disabled={decideCorrection.isPending}><X className="h-3.5 w-3.5" />Reject</Button>
                    </div>
                  )}
                </div>
              ))}
              {!correctionsQuery.isPending && !(correctionsQuery.data ?? []).length && <p className="py-8 text-center text-sm text-gray-400">No correction requests.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'settings' && isHr && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card className="card-premium">
            <CardHeader><CardTitle>Attendance policy</CardTitle><p className="mt-1 text-xs text-gray-500">Policy is applied using the organization time zone: {activeSettings?.timeZone ?? '…'}</p></CardHeader>
            <CardContent>
              {settingsQuery.isError && <p role="alert" className="mb-4 text-sm text-rose-600">Could not load attendance settings. {errorMessage(settingsQuery.error)}</p>}
              {!activeSettings && settingsQuery.isPending ? <p className="text-sm text-gray-400">Loading settings…</p> : activeSettings && (
                <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); updateSettings.mutate(activeSettings); }}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs font-medium text-gray-600">Office start<input type="time" value={activeSettings.officeStartTime} onChange={(event) => setSettingsForm({ ...activeSettings, officeStartTime: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                    <label className="space-y-1.5 text-xs font-medium text-gray-600">Office end<input type="time" value={activeSettings.officeEndTime} onChange={(event) => setSettingsForm({ ...activeSettings, officeEndTime: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                    <NumberInput label="Grace period (minutes)" value={activeSettings.gracePeriodMinutes} onChange={(value) => setSettingsForm({ ...activeSettings, gracePeriodMinutes: value })} />
                    <NumberInput label="Break deduction (minutes)" value={activeSettings.breakDeductionMinutes} onChange={(value) => setSettingsForm({ ...activeSettings, breakDeductionMinutes: value })} />
                    <NumberInput label="Minimum full-day hours (minutes)" value={activeSettings.fullDayMinimumMinutes} onChange={(value) => setSettingsForm({ ...activeSettings, fullDayMinimumMinutes: value })} />
                    <NumberInput label="Half-day threshold (minutes)" value={activeSettings.halfDayMinimumMinutes} onChange={(value) => setSettingsForm({ ...activeSettings, halfDayMinimumMinutes: value })} />
                    <NumberInput label="Half days per full-day deduction" value={activeSettings.halfDaysPerDeduction} min={1} onChange={(value) => setSettingsForm({ ...activeSettings, halfDaysPerDeduction: value })} />
                    <label className="space-y-1.5 text-xs font-medium text-gray-600">Below half-day threshold<select value={activeSettings.belowHalfDayStatus} onChange={(event) => setSettingsForm({ ...activeSettings, belowHalfDayStatus: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="absent">Absent</option><option value="half_day">Half day</option></select></label>
                    <label className="space-y-1.5 text-xs font-medium text-gray-600">Overtime calculation<select value={activeSettings.overtimeMode} onChange={(event) => setSettingsForm({ ...activeSettings, overtimeMode: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="after_shift_end">After office end</option><option value="after_expected_hours">After expected daily hours</option></select></label>
                    <label className="flex items-center gap-2 self-end rounded-lg border border-gray-100 px-3 py-2.5 text-xs text-gray-600"><input type="checkbox" checked={activeSettings.trackEarlyDeparture} onChange={(event) => setSettingsForm({ ...activeSettings, trackEarlyDeparture: event.target.checked })} className="accent-brand-600" />Track early departures</label>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-800">Weekly non-working days</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {WEEKDAYS.map((day) => (
                        <label key={day} className="inline-flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={activeSettings.weeklyOffDays.includes(day)} onChange={(event) => setSettingsForm({
                          ...activeSettings,
                          weeklyOffDays: event.target.checked ? [...activeSettings.weeklyOffDays, day] : activeSettings.weeklyOffDays.filter((item) => item !== day),
                        })} className="accent-brand-600" />{day}</label>
                      ))}
                    </div>
                    <label className="mt-4 inline-flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={activeSettings.firstSaturdayOff} onChange={(event) => setSettingsForm({ ...activeSettings, firstSaturdayOff: event.target.checked })} className="accent-brand-600" />First Saturday of each month is non-working</label>
                  </div>
                  <Button type="submit" disabled={updateSettings.isPending} className="gradient-brand-btn text-white">Save attendance policy</Button>
                </form>
              )}
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader><CardTitle>Company holidays</CardTitle><p className="mt-1 text-xs text-gray-500">Holidays are excluded from scheduled working days.</p></CardHeader>
            <CardContent className="space-y-4">
              <form className="grid gap-2 sm:grid-cols-[1fr_150px_auto]" onSubmit={(event) => { event.preventDefault(); addHoliday.mutate(); }}>
                <input required value={holidayName} onChange={(event) => setHolidayName(event.target.value)} placeholder="Holiday name" className="h-10 rounded-lg border border-gray-200 px-3 text-sm" />
                <input required type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm" />
                <Button type="submit" disabled={addHoliday.isPending}>Add holiday</Button>
              </form>
              {holidaysQuery.isError && <p role="alert" className="text-sm text-rose-600">Could not load company holidays. {errorMessage(holidaysQuery.error)}</p>}
              <div className="divide-y divide-gray-100">
                {(holidaysQuery.data ?? []).map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between gap-3 py-3">
                    <div><p className="text-sm font-medium text-gray-800">{holiday.name}</p><p className="mt-0.5 text-xs text-gray-400">{formatDate(holiday.date, timeZone)}</p></div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeHoliday.mutate(holiday.id)} disabled={removeHoliday.isPending} aria-label={`Remove ${holiday.name}`}><X className="h-4 w-4 text-gray-400" /></Button>
                  </div>
                ))}
                {!holidaysQuery.isPending && !(holidaysQuery.data ?? []).length && <p className="py-7 text-center text-sm text-gray-400">No company holidays configured.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {cameraAction && <AttendanceCamera action={cameraAction} onClose={() => setCameraAction(null)} onComplete={() => { setCameraAction(null); invalidateAttendance(); }} />}
      {selectedPhoto && <ProtectedPhotoDialog url={selectedPhoto} onClose={() => setSelectedPhoto('')} />}
      {editingRecord && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-attendance-title">
          <div className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 id="edit-attendance-title" className="font-semibold text-gray-900">Correct attendance record</h2><p className="mt-1 text-xs text-gray-500">{editingRecord.user?.firstName} {editingRecord.user?.lastName} · {formatDate(editingRecord.date, timeZone)}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setEditingRecord(null)} aria-label="Close"><X className="h-4 w-4" /></Button></div>
            <form className="mt-5 space-y-4" onSubmit={(event) => {
              event.preventDefault();
              const values: Record<string, string> = { notes: editNotes };
              if (editCheckIn) values.checkInTime = editCheckIn;
              if (editCheckOut) values.checkOutTime = editCheckOut;
              editAttendance.mutate({ id: editingRecord.id, values });
            }}>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs font-medium text-gray-600">Punch in<input type="time" value={editCheckIn} onChange={(event) => setEditCheckIn(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
                <label className="space-y-1.5 text-xs font-medium text-gray-600">Punch out<input type="time" value={editCheckOut} onChange={(event) => setEditCheckOut(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
              </div>
              <label className="block space-y-1.5 text-xs font-medium text-gray-600">Attendance note<textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingRecord(null)}>Cancel</Button><Button type="submit" disabled={editAttendance.isPending}>Save correction</Button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberInput({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-gray-600">{label}
      <input type="number" min={min} max={1440} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" />
    </label>
  );
}
