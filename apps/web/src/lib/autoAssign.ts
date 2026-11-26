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

const LEAD_TASK_RE = /kickoff|approval|report|strateg|plan|audit|monthly|review|roadmap|kpi|okr|forecast/;

const SPECIALIST_RE =
  /design|develop|engineer|video|editor|motion|strateg|marketing|social media|content|\bhr\b|human resource|recruit|operation|people|creative|graphic|frontend|backend|software|web|tech|account/;

function isManagerCandidate(c: AutoAssignCandidate): boolean {
  if (/\b(admin|super admin|project manager|hr manager)\b/.test(c.text)) return true;
  return /\bmanager\b/.test(c.text) && !SPECIALIST_RE.test(c.text);
}

function leastLoaded(pool: AutoAssignCandidate[]): AutoAssignCandidate {
  return pool.reduce((a, b) => ((a.load ?? 0) <= (b.load ?? 0) ? a : b));
}

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
  const leadTask = LEAD_TASK_RE.test(t);

  for (const bucket of BUCKETS) {
    if (!bucket.task.test(t)) continue;
    let pool = candidates.filter((c) => bucket.member.test(c.text));
    if (!leadTask) {
      const execPool = pool.filter((c) => !isManagerCandidate(c));
      if (execPool.length) pool = execPool;
    }
    if (!pool.length) continue;
    const best = leastLoaded(pool);
    return { candidate: best, role: bucket.role };
  }

  const managers = candidates.filter(isManagerCandidate);
  const execs = candidates.filter((c) => !isManagerCandidate(c));
  let pool: AutoAssignCandidate[];
  let role = FALLBACK_ROLE;
  if (leadTask && managers.length) {
    pool = managers;
    role = 'Manager';
  } else if (execs.length) {
    pool = execs;
  } else {
    pool = candidates;
  }
  return { candidate: leastLoaded(pool), role };
}

export { BUCKETS, FALLBACK_ROLE };
