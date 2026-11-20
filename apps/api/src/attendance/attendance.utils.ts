export interface AttendancePolicy {
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
}

export interface AttendanceSessionValue {
  checkIn: Date;
  checkOut: Date | null;
}

export interface DailyAttendanceMetrics {
  firstCheckIn: Date | null;
  lastCheckOut: Date | null;
  workingMinutes: number;
  completedWorkingMinutes: number;
  ongoingMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  status: string;
  isHalfDay: boolean;
  isOngoing: boolean;
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localDateTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (
    !year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute) ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) {
    throw new RangeError('Invalid local date or time');
  }

  const expectedUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidateUtc = expectedUtc;
  const formatter = getDateFormatter(timeZone);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidateUtc))
      .map(({ type, value }) => [type, value]));
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjustment = expectedUtc - representedUtc;
    if (adjustment === 0) break;
    candidateUtc += adjustment;
  }

  const result = new Date(candidateUtc);
  const represented = Object.fromEntries(formatter.formatToParts(result)
    .map(({ type, value }) => [type, value]));
  if (
    `${represented.year}-${represented.month}-${represented.day}` !== dateKey ||
    Number(represented.hour) !== hour ||
    Number(represented.minute) !== minute
  ) {
    throw new RangeError('Local date and time do not exist in the configured time zone');
  }
  return result;
}

export function getMonthDateKeys(year: number, month: number): string[] {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) =>
    `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
  );
}

export function isFirstSaturday(dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 6 && day <= 7;
}

export function isWorkingDate(
  dateKey: string,
  policy: Pick<AttendancePolicy, 'weeklyOffDays' | 'firstSaturdayOff'>,
  holidayDateKeys: ReadonlySet<string>,
): boolean {
  if (holidayDateKeys.has(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  if (policy.weeklyOffDays.includes(weekday)) return false;
  return !(policy.firstSaturdayOff && isFirstSaturday(dateKey));
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function overlapAfter(start: Date, end: Date, cutoff: Date): number {
  return minutesBetween(start < cutoff ? cutoff : start, end);
}

export function calculateDailyAttendance(
  sessions: AttendanceSessionValue[],
  dateKey: string,
  now: Date,
  timeZone: string,
  policy: AttendancePolicy,
): DailyAttendanceMetrics {
  const ordered = [...sessions].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
  const firstCheckIn = ordered[0]?.checkIn ?? null;
  const isOngoing = ordered.some((session) => session.checkOut === null);
  const lastCheckOut = isOngoing
    ? null
    : ordered.reduce<Date | null>((latest, session) => {
      if (!session.checkOut) return latest;
      return !latest || session.checkOut > latest ? session.checkOut : latest;
    }, null);

  const completedRawMinutes = ordered.reduce((total, session) =>
    total + (session.checkOut ? minutesBetween(session.checkIn, session.checkOut) : 0), 0);
  const ongoingMinutes = ordered.reduce((total, session) =>
    total + (session.checkOut ? 0 : minutesBetween(session.checkIn, now)), 0);
  const workingMinutes = Math.max(
    0,
    completedRawMinutes + ongoingMinutes - (isOngoing ? 0 : policy.breakDeductionMinutes),
  );
  const completedWorkingMinutes = isOngoing
    ? completedRawMinutes
    : workingMinutes;

  const shiftStart = localDateTimeToUtc(dateKey, policy.officeStartTime, timeZone);
  const shiftEnd = localDateTimeToUtc(dateKey, policy.officeEndTime, timeZone);
  const lateMinutes = firstCheckIn
    ? minutesBetween(shiftStart, firstCheckIn)
    : 0;
  const earlyDepartureMinutes = policy.trackEarlyDeparture && lastCheckOut
    ? minutesBetween(lastCheckOut, shiftEnd)
    : 0;
  const overtimeMinutes = ordered.reduce((total, session) => {
    const end = session.checkOut ?? now;
    if (policy.overtimeMode === 'after_expected_hours') return total;
    return total + overlapAfter(session.checkIn, end, shiftEnd);
  }, 0) + (policy.overtimeMode === 'after_expected_hours'
    ? Math.max(0, workingMinutes - policy.fullDayMinimumMinutes)
    : 0);

  let status = 'absent';
  if (firstCheckIn) {
    if (workingMinutes < policy.halfDayMinimumMinutes && !isOngoing) {
      status = policy.belowHalfDayStatus;
    } else if (workingMinutes < policy.fullDayMinimumMinutes && !isOngoing) {
      status = 'half_day';
    } else if (lateMinutes === 0) {
      status = 'on_time';
    } else if (lateMinutes <= policy.gracePeriodMinutes) {
      status = 'slightly_late';
    } else {
      status = 'late';
    }
  }

  return {
    firstCheckIn,
    lastCheckOut,
    workingMinutes,
    completedWorkingMinutes,
    ongoingMinutes,
    lateMinutes,
    earlyDepartureMinutes,
    overtimeMinutes,
    status,
    isHalfDay: status === 'half_day',
    isOngoing,
  };
}

export function halfDayDeductionEquivalent(halfDayCount: number, halfDaysPerDeduction: number): number {
  if (halfDaysPerDeduction <= 0) throw new RangeError('Half-day conversion must be positive');
  return halfDayCount / halfDaysPerDeduction;
}
