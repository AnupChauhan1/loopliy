import { keepPreviousData, useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

export type ChartPeriod = 'week' | 'month' | 'year' | 'all' | 'custom';

export interface TaskStatusData {
  byStatus: Record<string, number>;
  total: number;
  period: string;
}

/** Lightweight task-status aggregation — one GROUP BY query, safe to poll. */
export function useTaskStatus(period: ChartPeriod, from?: string, to?: string) {
  return useQuery({
    queryKey: ['dashboard', 'task-status', period, from ?? '', to ?? ''],
    queryFn: () =>
      api
        .get<TaskStatusData>('/dashboard/task-status', {
          params: { period, ...(from ? { from } : {}), ...(to ? { to } : {}) },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export interface TrendPoint {
  date: string;
  created: number;
  completed: number;
}

/** Org-wide dashboard stats. Keyed under ['dashboard'] so task/approval mutations refresh it. */
export function useDashboardStats(period?: ChartPeriod) {
  return useQuery({
    queryKey: ['dashboard', 'stats', period ?? 'all'],
    queryFn: () => api.get('/dashboard/stats', { params: period ? { period } : {} }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60000 : false,
  });
}

/** Lightweight counts for sidebar badges; avoids loading all dashboard metrics on every page. */
export function useDashboardNavStats() {
  return useQuery({
    queryKey: ['dashboard', 'nav-stats'],
    queryFn: () => api.get('/dashboard/nav-stats').then((r) => r.data),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60000 : false,
  });
}

function useRoleDashboardStats(role: 'manager' | 'hr' | 'my') {
  return useQuery({
    queryKey: ['dashboard', role, 'stats'],
    queryFn: () => api.get(`/dashboard/${role}-stats`).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60000 : false,
  });
}

export function useManagerDashboardStats() {
  return useRoleDashboardStats('manager');
}

export function useHrDashboardStats() {
  return useRoleDashboardStats('hr');
}

export function useMyDashboardStats() {
  return useRoleDashboardStats('my');
}

/** Percentage change of the last 7 days vs the 7 days before (null when no baseline). */
export function weekOverWeek(trend: TrendPoint[] | undefined, key: 'created' | 'completed') {
  if (!trend || trend.length < 14) return null;
  const sum = (arr: TrendPoint[]) => arr.reduce((s, t) => s + t[key], 0);
  const prev = sum(trend.slice(0, 7));
  const curr = sum(trend.slice(7));
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 100);
}
