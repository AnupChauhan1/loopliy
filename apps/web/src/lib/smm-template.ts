export interface SmmTaskSpec {
  dayOffset: number;
  title: string;
}

/** SMM Month-1 cycle: full 24-day schedule including onboarding (Day 1–3). */
export const SMM_CYCLE_1: SmmTaskSpec[] = [
  { dayOffset: 1, title: 'Client Onboarding Form Submission' },
  { dayOffset: 2, title: 'Cliq Onboarding & Channel Setup' },
  { dayOffset: 3, title: 'Setup & Strategy Kickoff Call' },
  { dayOffset: 4, title: 'Content Calendar Creation & Approval' },
  { dayOffset: 5, title: 'Static Post #1' },
  { dayOffset: 6, title: 'Reel #1' },
  { dayOffset: 7, title: 'Story & Engagement Highlights #1' },
  { dayOffset: 8, title: 'Static Post #2' },
  { dayOffset: 9, title: 'Reel #2' },
  { dayOffset: 10, title: 'Carousel Post #1' },
  { dayOffset: 11, title: 'Static Post #3' },
  { dayOffset: 12, title: 'Reel #3 & Mid-Cycle Analytics Review' },
  { dayOffset: 13, title: 'Static Post #4' },
  { dayOffset: 14, title: 'Reel #4' },
  { dayOffset: 15, title: 'Ad Creative & Boost Setup' },
  { dayOffset: 16, title: 'Static Post #5' },
  { dayOffset: 17, title: 'Reel #5' },
  { dayOffset: 18, title: 'Carousel Post #2' },
  { dayOffset: 19, title: 'Static Post #6' },
  { dayOffset: 20, title: 'Reel #6' },
  { dayOffset: 21, title: 'Community & Lead Inbox Audit' },
  { dayOffset: 22, title: 'Static Post #7' },
  { dayOffset: 23, title: 'Reel #7' },
  { dayOffset: 24, title: 'Monthly Performance Report & Next Cycle Review' },
];

/** SMM Month-2+ cycle preview: skips Day 1–3 onboarding, runs Day 4–24. */
export const SMM_CYCLE_2_PLUS: SmmTaskSpec[] = SMM_CYCLE_1.filter((t) => t.dayOffset >= 4);

export const PROJECT_SERVICES = [
  { value: 'smm', label: 'SMM' },
  { value: 'website', label: 'Website' },
  { value: 'seo', label: 'SEO' },
  { value: 'performance_ads', label: 'Performance Ads' },
  { value: 'branding', label: 'Branding & Design' },
  { value: 'other', label: 'Other' },
] as const;

export function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Due date for a task on `dayOffset` of a cycle starting at `start` (Day 1 = start date). */
export function dueDateFor(start: string | Date, dayOffset: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + dayOffset - 1);
  return d;
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
