/**
 * Smart role-based auto-assignment engine.
 * Matches a task's title/description keywords to an employee's
 * designation / role / department, then picks the least-loaded match.
 */

export interface AutoAssignCandidate {
  id: string;
  /** lowercase haystack: role names + department + designation + member role */
  text: string;
  /** current assigned-task count used for load balancing */
  load?: number;
}

export interface SmartMatch {
  candidateId: string;
  /** bucket label for reporting, e.g. 'Video Editor' */
  role: string;
}

interface Bucket {
  role: string;
  task: RegExp;
  member: RegExp;
}

const BUCKETS: Bucket[] = [
  {
    role: 'Video Editor',
    task: /reel|video|edit|animation|motion|youtube|shorts?|clip/,
    member: /video|editor|motion|reel/,
  },
  {
    role: 'Designer',
    task: /design|static|carousel|graphic|banner|creative|ui|thumbnail|logo|poster|template/,
    member: /design|creative|graphic|visual|ui|ux/,
  },
  {
    role: 'Developer',
    task: /develop|code|website|landing|bug|api|integration|deploy|technical|seo|plugin|plugin|script install/,
    member: /develop|engineer|frontend|backend|software|web|tech|it\b/,
  },
  {
    role: 'Strategist',
    task: /strateg|calendar|plan|kickoff|campaign|research|audit|report|analytic|copywrit|script|content|social media|growth|market/,
    member: /strateg|marketing|social media|content|account|brand|growth|pm\b|project manager/,
  },
  {
    role: 'HR',
    task: /onboard|\bhr\b|approval|hir|attend|policy|induction|document|leave|payroll|recruit/,
    member: /\bhr\b|human resource|operation|people|recruit|admin/,
  },
];

const FALLBACK_ROLE = 'Team';

/** Tasks that legitimately belong to leads/managers (kickoff, approvals, reporting). */
const LEAD_TASK_RE = /kickoff|approval|report|strateg|plan|audit|monthly|review|roadmap|kpi|okr|forecast/;

/** Specialisms that make a "Manager"-titled person an execution specialist
 *  (e.g. Social Media Manager, Marketing Manager) rather than a pure lead. */
const SPECIALIST_RE =
  /design|develop|engineer|video|editor|motion|strateg|marketing|social media|content|\bhr\b|human resource|recruit|operation|people|creative|graphic|frontend|backend|software|web|tech|account/;

/** Pure leads/managers — reserved for leadership tasks only. */
export function isManagerCandidate(c: AutoAssignCandidate): boolean {
  if (/\b(admin|super admin|project manager|hr manager)\b/.test(c.text)) return true;
  return /\bmanager\b/.test(c.text) && !SPECIALIST_RE.test(c.text);
}

function leastLoaded(pool: AutoAssignCandidate[]): AutoAssignCandidate {
  return pool.reduce((a, b) => ((a.load ?? 0) <= (b.load ?? 0) ? a : b));
}

/** Pick the best candidate for a task title. Returns null when pool is empty. */
export function smartMatch(title: string, candidates: AutoAssignCandidate[]): SmartMatch | null {
  if (!candidates.length) return null;
  const t = (title ?? '').toLowerCase();
  const leadTask = LEAD_TASK_RE.test(t);

  // 1) Role-matched buckets in priority order — least-loaded candidate wins.
  //    Pure managers are excluded from execution buckets unless it's a
  //    leadership task (kickoff / approval / reporting).
  for (const bucket of BUCKETS) {
    if (!bucket.task.test(t)) continue;
    let pool = candidates.filter((c) => bucket.member.test(c.text));
    if (!leadTask) {
      const execPool = pool.filter((c) => !isManagerCandidate(c));
      if (execPool.length) pool = execPool;
    }
    if (!pool.length) continue;
    const best = leastLoaded(pool);
    return { candidateId: best.id, role: bucket.role };
  }

  // 2) Fallback: leadership tasks → managers first; everything else is spread
  //    evenly (least-loaded) across ALL non-manager team members so no single
  //    Project Manager absorbs the whole project.
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
  return { candidateId: leastLoaded(pool).id, role };
}

/** Build the lowercase matching haystack for a user record. */
export function candidateText(u: any, memberRole?: string | null): string {
  return [
    ...(u?.roles ?? []).map((r: any) => (typeof r === 'string' ? r : r?.role?.name)),
    u?.department?.name ?? (typeof u?.department === 'string' ? u.department : undefined),
    u?.departmentName,
    u?.employeeProfile?.designation ?? u?.designation,
    u?.roleNames?.length ? u.roleNames.join(' ') : undefined,
    memberRole,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Convenience: candidate object straight from a user row. */
export function candidateFromUser(u: any, memberRole?: string | null, load = 0): AutoAssignCandidate {
  return { id: u.id, text: candidateText(u, memberRole), load };
}

export { BUCKETS, FALLBACK_ROLE };
