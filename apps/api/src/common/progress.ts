/**
 * Automatic progress calculation — progress is NEVER stored or edited manually.
 * Task progress is derived from workflow status; project progress is the
 * weighted average of its tasks' status percentages.
 */

export function taskProgress(status?: string | null): number {
  switch (status) {
    case 'completed':
    case 'approved':
      return 100;
    case 'in_review':
      return 80;
    case 'in_progress':
    case 'changes_requested':
      return 50;
    default:
      // todo, pending, on_hold, cancelled
      return 0;
  }
}

/** Weighted-average progress across tasks (each task contributes its status %). */
export function projectProgress(tasks: { status?: string | null }[]): number {
  if (!tasks.length) return 0;
  const total = tasks.reduce((sum, t) => sum + taskProgress(t.status), 0);
  return Math.round(total / tasks.length);
}

/** Same as projectProgress but for grouped rows: { status, _count: { _all } } or { status, count } */
export function projectProgressFromGroups(
  groups: { status: string | null; _count?: { _all: number }; count?: number }[],
): number {
  let total = 0;
  let weighted = 0;
  for (const g of groups) {
    const n = g._count?._all ?? g.count ?? 0;
    total += n;
    weighted += n * taskProgress(g.status);
  }
  return total ? Math.round(weighted / total) : 0;
}
