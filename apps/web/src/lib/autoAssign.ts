/**
 * Client-side mirror of the API smart auto-assign engine
 * (apps/api/src/common/auto-assign.ts). Used for live "who will this go to?"
 * hints in forms; the backend remains the source of truth.
 */

export interface AutoAssignCandidate {
  id: string;
  name?: string;
  text: string;
  load?: number;
}

interface Bucket {
  role: string;
  task: RegExp;
  member: RegExp;
}

const BUCKETS: Bucket[] = [
  { role: 'Video Editor', task: /reel|video|edit|animation|motion|youtube|shorts?|clip/, member: /video|editor|motion|reel/ },
  { role: 'Designer', task: /design|static|carousel|graphic|banner|creative|ui|thumbnail|logo|poster|template/, member: /design|creative|graphic|visual|ui|ux/ },
  { role: 'Developer', task: /develop|code|website|landing|bug|api|integration|deploy|technical|seo|plugin/, member: /develop|engineer|frontend|backend|software|web|tech|it\b/ },
  { role: 'Strategist', task: /strateg|calendar|plan|kickoff|campaign|research|audit|report|analytic|copywrit|script|content|social media|growth|market/, member: /strateg|marketing|social media|content|account|brand|growth|pm\b|project manager/ },
  { role: 'HR', task: /onboard|\bhr\b|approval|hir|attend|policy|induction|document|leave|payroll|recruit/, member: /\bhr\b|human resource|operation|people|recruit|admin/ },
];

const FALLBACK_ROLE = 'Team';

export function candidateText(u: any): string {
  return [
    ...(u?.roleNames ?? []),
    u?.roles?.map((r: any) => (typeof r === 'string' ? r : r?.role?.name)),
    u?.department?.name ?? u?.departmentName,
    u?.employeeProfile?.designation ?? u?.designation,
    u?.primaryRole,
  ]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Returns the best-matching candidate, or null when the pool is empty. */
export function smartAutoAssignTask(
  task: { title?: string; description?: string; category?: string },
  candidates: AutoAssignCandidate[],
): { candidate: AutoAssignCandidate; role: string } | null {
  if (!candidates.length) return null;
  const t = `${task.title ?? ''} ${task.description ?? ''} ${task.category ?? ''}`.toLowerCase();

  for (const bucket of BUCKETS) {
    if (!bucket.task.test(t)) continue;
    const pool = candidates.filter((c) => bucket.member.test(c.text));
    if (!pool.length) continue;
    const best = pool.reduce((a, b) => ((a.load ?? 0) <= (b.load ?? 0) ? a : b));
    return { candidate: best, role: bucket.role };
  }

  const managerial = candidates.filter((c) => /manager|strateg|lead|account/.test(c.text));
  const pool = managerial.length ? managerial : candidates;
  const best = pool.reduce((a, b) => ((a.load ?? 0) <= (b.load ?? 0) ? a : b));
  return { candidate: best, role: FALLBACK_ROLE };
}

export { BUCKETS, FALLBACK_ROLE };
