export interface TemplateTaskSpec {
  dayOffset: number;
  title: string;
}

/** SMM Month-1 cycle: full 24-day schedule including onboarding (Day 1–3). */
export const SMM_CYCLE_1: TemplateTaskSpec[] = [
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

/** SMM Month-2+ cycle: skips Day 1–3 onboarding, runs Day 4–24 from cycle start. */
export const SMM_CYCLE_2_PLUS: TemplateTaskSpec[] = SMM_CYCLE_1.filter((t) => t.dayOffset >= 4);

export const PROJECT_SERVICES = [
  'smm',
  'website',
  'seo',
  'performance_ads',
  'branding',
  'other',
] as const;

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Due date for a task on `dayOffset` of a cycle starting at `cycleStart` (Day 1 = start date). */
export function dueDateFor(cycleStart: Date, dayOffset: number): Date {
  return addDays(cycleStart, dayOffset - 1);
}

/** Advance a date by the project tenure (days | weeks | months). Defaults to 1 month. */
export function addTenure(date: Date, unit?: string | null, value?: number | null): Date {
  const d = new Date(date);
  const v = value && value > 0 ? value : 1;
  if (unit === 'days') d.setDate(d.getDate() + v);
  else if (unit === 'weeks') d.setDate(d.getDate() + v * 7);
  else d.setMonth(d.getMonth() + v);
  return d;
}
