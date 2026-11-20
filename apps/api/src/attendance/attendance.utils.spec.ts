import {
  calculateDailyAttendance,
  getLocalDateKey,
  getMonthDateKeys,
  halfDayDeductionEquivalent,
  isWorkingDate,
  localDateTimeToUtc,
  type AttendancePolicy,
} from './attendance.utils';

const policy: AttendancePolicy = {
  officeStartTime: '10:30',
  officeEndTime: '19:00',
  gracePeriodMinutes: 15,
  breakDeductionMinutes: 0,
  fullDayMinimumMinutes: 510,
  halfDayMinimumMinutes: 240,
  halfDaysPerDeduction: 2,
  weeklyOffDays: ['Sunday'],
  firstSaturdayOff: true,
  belowHalfDayStatus: 'absent',
  overtimeMode: 'after_shift_end',
  trackEarlyDeparture: true,
};

describe('attendance utilities', () => {
  it('converts configured local time and date across time zones', () => {
    const instant = localDateTimeToUtc('2026-03-08', '10:30', 'America/New_York');

    expect(instant.toISOString()).toBe('2026-03-08T14:30:00.000Z');
    expect(getLocalDateKey(instant, 'America/New_York')).toBe('2026-03-08');
    expect(() => localDateTimeToUtc('2026-03-08', '02:30', 'America/New_York')).toThrow(RangeError);
  });

  it('classifies on-time, grace-period, and late arrivals', () => {
    const makeSession = (time: string) => [{
      checkIn: localDateTimeToUtc('2026-05-04', time, 'UTC'),
      checkOut: null,
    }];
    const now = new Date('2026-05-04T11:00:00.000Z');

    expect(calculateDailyAttendance(makeSession('10:30'), '2026-05-04', now, 'UTC', policy).status)
      .toBe('on_time');
    expect(calculateDailyAttendance(makeSession('10:45'), '2026-05-04', now, 'UTC', policy).status)
      .toBe('slightly_late');
    expect(calculateDailyAttendance(makeSession('10:46'), '2026-05-04', now, 'UTC', policy).status)
      .toBe('late');
  });

  it('keeps ongoing work separate and calculates totals across multiple sessions', () => {
    const sessions = [
      {
        checkIn: new Date('2026-05-04T10:30:00.000Z'),
        checkOut: new Date('2026-05-04T12:30:00.000Z'),
      },
      {
        checkIn: new Date('2026-05-04T13:00:00.000Z'),
        checkOut: null,
      },
    ];
    const metrics = calculateDailyAttendance(
      sessions, '2026-05-04', new Date('2026-05-04T15:00:00.000Z'), 'UTC', policy,
    );

    expect(metrics.isOngoing).toBe(true);
    expect(metrics.lastCheckOut).toBeNull();
    expect(metrics.completedWorkingMinutes).toBe(120);
    expect(metrics.ongoingMinutes).toBe(120);
    expect(metrics.workingMinutes).toBe(240);
  });

  it('marks completed short shifts as half days or absent and tracks early departure/overtime', () => {
    const calculate = (checkOutTime: string, overtimeMode = 'after_shift_end') =>
      calculateDailyAttendance(
        [{
          checkIn: localDateTimeToUtc('2026-05-04', '10:30', 'UTC'),
          checkOut: localDateTimeToUtc('2026-05-04', checkOutTime, 'UTC'),
        }],
        '2026-05-04',
        new Date('2026-05-04T20:30:00.000Z'),
        'UTC',
        { ...policy, overtimeMode },
      );

    expect(calculate('15:30').status).toBe('half_day');
    expect(calculate('13:00').status).toBe('absent');
    expect(calculate('18:30').earlyDepartureMinutes).toBe(30);
    expect(calculate('20:00').overtimeMinutes).toBe(60);
    expect(calculate('20:00', 'after_expected_hours').overtimeMinutes).toBe(60);
  });

  it('counts configured work dates and half-day deduction equivalents', () => {
    const dates = getMonthDateKeys(2026, 5);
    const holidays = new Set(['2026-05-04']);

    expect(dates).toHaveLength(31);
    expect(isWorkingDate('2026-05-02', policy, holidays)).toBe(false);
    expect(isWorkingDate('2026-05-03', policy, holidays)).toBe(false);
    expect(isWorkingDate('2026-05-04', policy, holidays)).toBe(false);
    expect(halfDayDeductionEquivalent(3, policy.halfDaysPerDeduction)).toBe(1.5);
  });
});
