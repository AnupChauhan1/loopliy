import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HR_ROLES, hasAnyRole, RolesGuard } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateDailyAttendance,
  getLocalDateKey,
  getMonthDateKeys,
  halfDayDeductionEquivalent,
  isWorkingDate,
  localDateTimeToUtc,
  type AttendancePolicy,
  type AttendanceSessionValue,
} from './attendance.utils';

const ATTENDANCE_DIR = join(process.cwd(), 'private', 'attendance');
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PHOTO_TYPES = {
  jpeg: { mime: 'image/jpeg', matches: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  png: { mime: 'image/png', matches: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  webp: { mime: 'image/webp', matches: (data: Buffer) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
} as const;

type PhotoFile = { buffer: Buffer; size: number } | undefined;

function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new BadRequestException(`${label} must be a valid ISO date`);
  }
  return new Date(value);
}

function parseLocalTime(dateKey: string, value: unknown, timeZone: string, label: string): Date {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new BadRequestException(`${label} must use HH:mm format.`);
  }
  try {
    return localDateTimeToUtc(dateKey, value, timeZone);
  } catch {
    throw new BadRequestException(`${label} is not a valid local time in the organization time zone.`);
  }
}

function normalizeSettings(settings: any): AttendancePolicy {
  return {
    officeStartTime: settings.officeStartTime,
    officeEndTime: settings.officeEndTime,
    gracePeriodMinutes: settings.gracePeriodMinutes,
    breakDeductionMinutes: settings.breakDeductionMinutes,
    fullDayMinimumMinutes: settings.fullDayMinimumMinutes,
    halfDayMinimumMinutes: settings.halfDayMinimumMinutes,
    halfDaysPerDeduction: settings.halfDaysPerDeduction,
    weeklyOffDays: settings.weeklyOffDays,
    firstSaturdayOff: settings.firstSaturdayOff,
    belowHalfDayStatus: settings.belowHalfDayStatus,
    overtimeMode: settings.overtimeMode,
    trackEarlyDeparture: settings.trackEarlyDeparture,
  };
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {
    mkdirSync(ATTENDANCE_DIR, { recursive: true });
  }

  private async context(organizationId: string) {
    const [organizationSettings, existingAttendanceSettings] = await Promise.all([
      this.prisma.organizationSettings.findUnique({
        where: { organizationId },
        select: { timezone: true },
      }),
      this.prisma.attendanceSettings.findUnique({ where: { organizationId } }),
    ]);
    let attendanceSettings = existingAttendanceSettings;
    if (!attendanceSettings) {
      try {
        attendanceSettings = await this.prisma.attendanceSettings.create({ data: { organizationId } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        attendanceSettings = await this.prisma.attendanceSettings.findUnique({ where: { organizationId } });
        if (!attendanceSettings) throw error;
      }
    }
    const timeZone = organizationSettings?.timezone || 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new InternalServerErrorException(
        'The organization time zone is invalid. Update it in organization settings before using attendance.',
      );
    }
    return { timeZone, settings: normalizeSettings(attendanceSettings) };
  }

  private bounds(dateKey: string, timeZone: string) {
    const nextDate = new Date(`${dateKey}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateKey = nextDate.toISOString().slice(0, 10);
    return {
      start: localDateTimeToUtc(dateKey, '00:00', timeZone),
      end: localDateTimeToUtc(nextDateKey, '00:00', timeZone),
    };
  }

  private async findOrCreateRecord(userId: string, organizationId: string, dateKey: string, timeZone: string) {
    const { start, end } = this.bounds(dateKey, timeZone);
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { userId, date: { gte: start, lt: end }, user: { organizationId } },
      include: { sessions: { orderBy: { checkIn: 'asc' } } },
    });
    if (existing) {
      if (existing.sessions.length === 0 && existing.checkIn) {
        const legacySession = await this.prisma.attendanceSession.create({
          data: {
            organizationId,
            recordId: existing.id,
            userId,
            checkIn: existing.checkIn,
            checkOut: existing.checkOut,
            source: 'manual',
          },
        });
        existing.sessions.push(legacySession);
      }
      return existing;
    }
    return this.prisma.attendanceRecord.create({
      data: { userId, date: start, status: 'absent' },
      include: { sessions: true },
    });
  }

  private savePhoto(organizationId: string, file: PhotoFile): string {
    if (!file?.buffer?.length) throw new BadRequestException('A camera photo is required to record attendance.');
    if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException('Attendance photos must be 5 MB or smaller.');
    }
    const format = Object.entries(PHOTO_TYPES).find(([, candidate]) => candidate.matches(file.buffer));
    if (!format) throw new BadRequestException('Unsupported photo. Use a JPEG, PNG, or WebP camera image.');
    const [extension] = format;
    if (!/^[\w-]{1,64}$/.test(organizationId)) throw new BadRequestException('Invalid organization');
    const directory = join(ATTENDANCE_DIR, organizationId);
    mkdirSync(directory, { recursive: true });
    const fileName = `${randomUUID()}.${extension}`;
    const temporaryPath = join(directory, `${fileName}.tmp`);
    const finalPath = join(directory, fileName);
    writeFileSync(temporaryPath, file.buffer, { flag: 'wx' });
    renameSync(temporaryPath, finalPath);
    return `${organizationId}/${fileName}`;
  }

  private async removePhoto(key: string) {
    const path = resolve(ATTENDANCE_DIR, key);
    const root = resolve(ATTENDANCE_DIR) + sep;
    if (path.startsWith(root) && existsSync(path)) {
      const { unlink } = await import('fs/promises');
      await unlink(path);
    }
  }

  private photoUrl(sessionId: string, type: 'check-in' | 'check-out', key: string | null) {
    return key ? `/attendance/photos/${sessionId}/${type}` : null;
  }

  private async updateRecordMetrics(
    recordId: string,
    dateKey: string,
    timeZone: string,
    settings: AttendancePolicy,
    sessions?: AttendanceSessionValue[],
  ) {
    const values = sessions ?? await this.prisma.attendanceSession.findMany({
      where: { recordId },
      orderBy: { checkIn: 'asc' },
      select: { checkIn: true, checkOut: true },
    });
    const now = new Date();
    const metrics = calculateDailyAttendance(values, dateKey, now, timeZone, settings);
    const allSessionsClosed = values.length > 0 && values.every((session) => session.checkOut !== null);
    return this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        checkIn: metrics.firstCheckIn,
        checkOut: allSessionsClosed ? metrics.lastCheckOut : null,
        totalHours: allSessionsClosed
          ? new Prisma.Decimal((metrics.workingMinutes / 60).toFixed(2))
          : null,
        status: metrics.status,
        lateMinutes: metrics.lateMinutes,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        halfDay: metrics.isHalfDay,
      },
    });
  }

  async today(user: any) {
    const { timeZone, settings } = await this.context(user.organizationId);
    const now = new Date();
    const dateKey = getLocalDateKey(now, timeZone);
    const { start, end } = this.bounds(dateKey, timeZone);
    const weekStart = new Date(`${dateKey}T00:00:00.000Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekStartKey = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    const weekStartInstant = localDateTimeToUtc(weekStartKey, '00:00', timeZone);
    const weekEndInstant = localDateTimeToUtc(weekEndKey, '00:00', timeZone);
    const [record, report, weeklyRecords] = await Promise.all([
      this.prisma.attendanceRecord.findFirst({
        where: { userId: user.id, date: { gte: start, lt: end } },
        include: { sessions: { orderBy: { checkIn: 'asc' } } },
      }),
      this.getMonthlyReport(user.organizationId, user.id, dateKey.slice(0, 7), timeZone, settings, true),
      this.prisma.attendanceRecord.findMany({
        where: {
          userId: user.id,
          user: { organizationId: user.organizationId },
          date: { gte: weekStartInstant, lt: weekEndInstant },
        },
        include: { sessions: { orderBy: { checkIn: 'asc' } } },
      }),
    ]);
    const weeklyMinutes = weeklyRecords.reduce((sum, item) => {
      const itemDate = getLocalDateKey(item.date, timeZone);
      return sum + calculateDailyAttendance(
        this.sessionsForRecord(item), itemDate, now, timeZone, settings,
      ).workingMinutes;
    }, 0);
    const metrics = calculateDailyAttendance(
      record ? this.sessionsForRecord(record) : [],
      dateKey,
      now,
      timeZone,
      settings,
    );
    return {
      date: dateKey,
      timeZone,
      settings: {
        officeStartTime: settings.officeStartTime,
        officeEndTime: settings.officeEndTime,
        gracePeriodMinutes: settings.gracePeriodMinutes,
      },
      record: record ? this.serializeRecord(record) : null,
      sessions: (record ? this.serializeRecord(record).sessions : []),
      metrics,
      weeklyMinutes,
      monthly: report[0] ?? null,
    };
  }

  async checkIn(user: any, file: PhotoFile) {
    const { timeZone, settings } = await this.context(user.organizationId);
    const now = new Date();
    const dateKey = getLocalDateKey(now, timeZone);
    const photoKey = this.savePhoto(user.organizationId, file);
    let attached = false;
    try {
      const record = await this.findOrCreateRecord(user.id, user.organizationId, dateKey, timeZone);
      if (record.sessions.some((session) => !session.checkOut)) {
        throw new BadRequestException('You already have an open attendance session.');
      }
      const session = await this.prisma.attendanceSession.create({
        data: {
          organizationId: user.organizationId,
          recordId: record.id,
          userId: user.id,
          checkIn: now,
          checkInPhotoKey: photoKey,
        },
      });
      attached = true;
      await this.updateRecordMetrics(record.id, dateKey, timeZone, settings);
      await this.audit(user.organizationId, user.id, 'attendance.check_in', record.id, {
        sessionId: session.id,
        checkIn: now.toISOString(),
      });
      return this.today(user);
    } catch (error) {
      if (!attached) await this.removePhoto(photoKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('You already have an open attendance session.');
      }
      throw error;
    }
  }

  async checkOut(user: any, file: PhotoFile) {
    const { timeZone, settings } = await this.context(user.organizationId);
    const now = new Date();
    const dateKey = getLocalDateKey(now, timeZone);
    const record = await this.findOrCreateRecord(user.id, user.organizationId, dateKey, timeZone);
    const openSession = [...record.sessions].reverse().find((session) => !session.checkOut);
    if (!openSession) throw new BadRequestException('Check in before checking out.');
    const photoKey = this.savePhoto(user.organizationId, file);
    let attached = false;
    try {
      const updated = await this.prisma.attendanceSession.updateMany({
        where: { id: openSession.id, checkOut: null },
        data: { checkOut: now, checkOutPhotoKey: photoKey },
      });
      if (updated.count !== 1) throw new BadRequestException('This attendance session has already been checked out.');
      attached = true;
      await this.updateRecordMetrics(record.id, dateKey, timeZone, settings);
      await this.audit(user.organizationId, user.id, 'attendance.check_out', record.id, {
        sessionId: openSession.id,
        checkOut: now.toISOString(),
      });
      return this.today(user);
    } catch (error) {
      if (!attached) await this.removePhoto(photoKey);
      throw error;
    }
  }

  private serializeSession(session: any) {
    return {
      id: session.id,
      checkIn: session.checkIn,
      checkOut: session.checkOut,
      checkInPhotoUrl: this.photoUrl(session.id, 'check-in', session.checkInPhotoKey),
      checkOutPhotoUrl: this.photoUrl(session.id, 'check-out', session.checkOutPhotoKey),
      source: session.source,
    };
  }

  private serializeRecord(record: any) {
    const sessions = record.sessions?.length
      ? record.sessions
      : record.checkIn
        ? [{
          id: record.id,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          checkInPhotoKey: null,
          checkOutPhotoKey: null,
          source: 'manual',
        }]
        : [];
    return {
      ...record,
      totalHours: record.totalHours?.toNumber?.() ?? record.totalHours,
      sessions: sessions.map((session: any) => this.serializeSession(session)),
    };
  }

  private sessionsForRecord(record: any): AttendanceSessionValue[] {
    if (record.sessions?.length) return record.sessions as AttendanceSessionValue[];
    return record.checkIn ? [{ checkIn: record.checkIn, checkOut: record.checkOut }] : [];
  }

  async photo(user: any, sessionId: string, type: string) {
    if (type !== 'check-in' && type !== 'check-out') throw new NotFoundException('Attendance photo not found.');
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, organizationId: user.organizationId },
      select: { userId: true, checkInPhotoKey: true, checkOutPhotoKey: true },
    });
    if (!session) throw new NotFoundException('Attendance photo not found.');
    if (session.userId !== user.id && !hasAnyRole(user, HR_ROLES)) {
      throw new ForbiddenException('You do not have permission to view this attendance photo.');
    }
    const key = type === 'check-in' ? session.checkInPhotoKey : session.checkOutPhotoKey;
    if (!key) throw new NotFoundException('Attendance photo not found.');
    const path = resolve(ATTENDANCE_DIR, key);
    const root = resolve(ATTENDANCE_DIR) + sep;
    if (!path.startsWith(root) || !existsSync(path)) throw new NotFoundException('Attendance photo not found.');
    const extension = extname(path).slice(1) as keyof typeof PHOTO_TYPES;
    const mimeType = PHOTO_TYPES[extension]?.mime;
    if (!mimeType) throw new NotFoundException('Attendance photo not found.');
    return { path, mimeType };
  }

  async list(user: any, query: any) {
    const isHr = hasAnyRole(user, HR_ROLES);
    if (!isHr && query.userId && query.userId !== user.id) {
      throw new ForbiddenException('You may only view your own attendance records.');
    }
    const { timeZone } = await this.context(user.organizationId);
    const where: Prisma.AttendanceRecordWhereInput = {
      user: { organizationId: user.organizationId },
    };
    if (!isHr || query.mine === 'true') where.userId = user.id;
    else if (query.userId) where.userId = query.userId;
    if (query.date) {
      const dateKey = String(query.date);
      if (!isValidDateKey(dateKey)) throw new BadRequestException('date must use a valid YYYY-MM-DD date.');
      const bounds = this.bounds(dateKey, timeZone);
      where.date = { gte: bounds.start, lt: bounds.end };
    } else if (query.month) {
      if (!isValidMonth(String(query.month))) throw new BadRequestException('month must use YYYY-MM format.');
      const [year, month] = String(query.month).split('-').map(Number);
      const startKey = `${query.month}-01`;
      const nextMonth = new Date(Date.UTC(year, month, 1));
      const endKey = nextMonth.toISOString().slice(0, 10);
      where.date = {
        gte: localDateTimeToUtc(startKey, '00:00', timeZone),
        lt: localDateTimeToUtc(endKey, '00:00', timeZone),
      };
    }
    if (query.status) where.status = String(query.status);
    if (query.search && isHr) {
      const search = String(query.search).trim().slice(0, 100);
      if (search) where.user = {
        organizationId: user.organizationId,
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }
    const take = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 60));
    return (await this.prisma.attendanceRecord.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        sessions: { orderBy: { checkIn: 'asc' } },
      },
      orderBy: { date: 'desc' },
      take,
    })).map((record) => this.serializeRecord(record));
  }

  private async holidayKeys(organizationId: string, timeZone: string, startDate: string, endDate: string) {
    const start = localDateTimeToUtc(startDate, '00:00', timeZone);
    const end = localDateTimeToUtc(endDate, '00:00', timeZone);
    const holidays = await this.prisma.holiday.findMany({
      where: { organizationId, date: { gte: start, lt: end } },
      select: { date: true },
    });
    return new Set(holidays.map(({ date }) => getLocalDateKey(date, timeZone)));
  }

  private async getMonthlyReport(
    organizationId: string,
    userId: string | undefined,
    month: string,
    timeZone: string,
    settings: AttendancePolicy,
    includeToday: boolean,
  ) {
    if (!isValidMonth(month)) throw new BadRequestException('month must use YYYY-MM format.');
    const [year, monthNumber] = month.split('-').map(Number);
    const allDates = getMonthDateKeys(year, monthNumber);
    const todayKey = getLocalDateKey(new Date(), timeZone);
    const currentMonthKey = todayKey.slice(0, 7);
    const dates = month < todayKey.slice(0, 7)
      ? allDates
      : month === currentMonthKey
        ? allDates.filter((date) => date < todayKey || (includeToday && date === todayKey))
        : [];
    const startKey = allDates[0];
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    const [users, records, holidays, leaves] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, isActive: true, ...(userId ? { id: userId } : {}) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: { select: { name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          user: { organizationId, isActive: true },
          ...(userId ? { userId } : {}),
          date: {
            gte: localDateTimeToUtc(startKey, '00:00', timeZone),
            lt: localDateTimeToUtc(nextMonth, '00:00', timeZone),
          },
        },
        include: { sessions: { orderBy: { checkIn: 'asc' } } },
      }),
      this.holidayKeys(organizationId, timeZone, startKey, nextMonth),
      this.prisma.leaveRequest.findMany({
        where: {
          status: 'approved',
          user: { organizationId, isActive: true, ...(userId ? { id: userId } : {}) },
          startDate: { lt: localDateTimeToUtc(nextMonth, '00:00', timeZone) },
          endDate: { gte: localDateTimeToUtc(startKey, '00:00', timeZone) },
        },
        select: { userId: true, startDate: true, endDate: true },
      }),
    ]);
    const recordsByUser = new Map<string, Map<string, any>>();
    for (const record of records) {
      const key = getLocalDateKey(record.date, timeZone);
      const userRecords = recordsByUser.get(record.userId) ?? new Map<string, any>();
      userRecords.set(key, record);
      recordsByUser.set(record.userId, userRecords);
    }
    const leaveDatesByUser = new Map<string, Set<string>>();
    for (const leave of leaves) {
      let key = getLocalDateKey(leave.startDate > localDateTimeToUtc(startKey, '00:00', timeZone)
        ? leave.startDate
        : localDateTimeToUtc(startKey, '00:00', timeZone), timeZone);
      const lastKey = getLocalDateKey(leave.endDate, timeZone);
      while (key <= lastKey) {
        const datesForUser = leaveDatesByUser.get(leave.userId) ?? new Set<string>();
        datesForUser.add(key);
        leaveDatesByUser.set(leave.userId, datesForUser);
        const next = new Date(`${key}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        key = next.toISOString().slice(0, 10);
      }
    }

    return users.map((employee) => {
      const employeeRecords = recordsByUser.get(employee.id) ?? new Map<string, any>();
      const approvedLeaveDates = leaveDatesByUser.get(employee.id) ?? new Set<string>();
      const expectedDates = dates.filter((date) =>
        isWorkingDate(date, settings, holidays) && !approvedLeaveDates.has(date),
      );
      let presentDays = 0;
      let halfDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let onTimeDays = 0;
      let workingMinutes = 0;
      let completedMinutes = 0;
      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let overtimeMinutes = 0;
      const { officeEndTime } = settings;
      const todayPastShiftEnd = new Date() >= localDateTimeToUtc(todayKey, officeEndTime, timeZone);
      const countToday = month !== todayKey.slice(0, 7) || todayPastShiftEnd;
      const reportDates = expectedDates.filter((date) =>
        date < todayKey || (date === todayKey && countToday),
      );

      for (const [date, record] of employeeRecords) {
        const metrics = calculateDailyAttendance(
          this.sessionsForRecord(record),
          date,
          new Date(),
          timeZone,
          settings,
        );
        workingMinutes += metrics.workingMinutes;
        if (record.checkOut) completedMinutes += metrics.completedWorkingMinutes;
        lateMinutes += metrics.lateMinutes;
        earlyDepartureMinutes += metrics.earlyDepartureMinutes;
        overtimeMinutes += metrics.overtimeMinutes;

        if (!reportDates.includes(date)) continue;
        const sessions = this.sessionsForRecord(record);
        if (metrics.isHalfDay || metrics.status === 'half_day') halfDays += 1;
        else if (metrics.status === 'absent') absentDays += 1;
        else if (sessions.length > 0) presentDays += 1;
        if (sessions.length > 0 && metrics.lateMinutes === 0) onTimeDays += 1;
        if (metrics.lateMinutes > 0) lateDays += 1;
      }

      const noShowDays = reportDates.filter((date) => !employeeRecords.has(date)).length;
      const expectedDays = reportDates.length;
      absentDays += noShowDays;
      const attendedEquivalents = presentDays + halfDayDeductionEquivalent(halfDays, settings.halfDaysPerDeduction);
      const expectedMinutes = expectedDays * settings.fullDayMinimumMinutes;
      return {
        user: employee,
        totalWorkingDays: expectedDays,
        presentDays,
        absentDays,
        halfDays,
        lateDays,
        onTimeDays,
        workingMinutes,
        completedMinutes,
        expectedMinutes,
        attendancePercentage: expectedDays
          ? Math.round((attendedEquivalents / expectedDays) * 10000) / 100
          : 0,
        halfDayDeductionEquivalent: halfDayDeductionEquivalent(halfDays, settings.halfDaysPerDeduction),
        lateMinutes,
        earlyDepartureMinutes,
        overtimeMinutes,
        completedWorkingDays: presentDays + halfDayDeductionEquivalent(halfDays, settings.halfDaysPerDeduction),
        averageDailyMinutes: presentDays + halfDays
          ? Math.round(workingMinutes / (presentDays + halfDays))
          : 0,
      };
    });
  }

  async report(user: any, month: string) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can view attendance reports.');
    const { timeZone, settings } = await this.context(user.organizationId);
    return this.getMonthlyReport(user.organizationId, undefined, month, timeZone, settings, true);
  }

  async dashboard(user: any, month: string) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can view the attendance dashboard.');
    const { timeZone, settings } = await this.context(user.organizationId);
    const monthKey = isValidMonth(month) ? month : getLocalDateKey(new Date(), timeZone).slice(0, 7);
    const todayKey = getLocalDateKey(new Date(), timeZone);
    const report = await this.getMonthlyReport(
      user.organizationId, undefined, monthKey, timeZone, settings, monthKey === todayKey.slice(0, 7),
    );
    const tomorrow = new Date(`${todayKey}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const todayBounds = this.bounds(todayKey, timeZone);
    const holidays = await this.holidayKeys(user.organizationId, timeZone, todayKey, tomorrowKey);
    const workingToday = isWorkingDate(todayKey, settings, holidays);
    const [teamToday, totalEmployees, approvedLeaves] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          user: { organizationId: user.organizationId, isActive: true },
          date: { gte: todayBounds.start, lt: todayBounds.end },
        },
        include: { sessions: { select: { checkIn: true, checkOut: true } } },
      }),
      this.prisma.user.count({ where: { organizationId: user.organizationId, isActive: true } }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: 'approved',
          user: { organizationId: user.organizationId, isActive: true },
          startDate: { lt: todayBounds.end },
          endDate: { gte: todayBounds.start },
        },
        select: { userId: true },
      }),
    ]);
    const onLeaveIds = new Set(approvedLeaves.map(({ userId }) => userId));
    const evaluatedToday = teamToday.map((record) => ({
      record,
      metrics: calculateDailyAttendance(this.sessionsForRecord(record), todayKey, new Date(), timeZone, settings),
    }));
    const onTimeEmployees = evaluatedToday.filter(({ record, metrics }) =>
      record.checkIn !== null && metrics.lateMinutes === 0,
    ).length;
    const lateArrivals = evaluatedToday.filter(({ metrics }) => metrics.lateMinutes > 0).length;
    const halfDays = evaluatedToday.filter(({ metrics }) => metrics.isHalfDay).length;
    const presentToday = evaluatedToday.filter(({ record, metrics }) =>
      record.checkIn !== null && metrics.status !== 'absent',
    ).length;
    const expectedEmployeesToday = Math.max(0, totalEmployees - onLeaveIds.size);
    const absentToday = workingToday ? Math.max(0, expectedEmployeesToday - presentToday) : 0;
    const currentlyWorking = evaluatedToday.filter(({ metrics }) => metrics.isOngoing).length;
    const totalHours = evaluatedToday.reduce((sum, { metrics }) =>
      sum + metrics.workingMinutes / 60, 0,
    );
    const employeesWithPunch = evaluatedToday.filter(({ record }) => record.checkIn !== null).length;
    const presentUserIds = new Set(evaluatedToday
      .filter(({ record, metrics }) => record.checkIn && metrics.status !== 'absent')
      .map(({ record }) => record.userId));
    const absentEmployees = workingToday
      ? report.filter((entry) =>
        !presentUserIds.has(entry.user.id) && !onLeaveIds.has(entry.user.id),
      ).map((entry) => entry.user)
      : [];
    const currentlyWorkingEmployees = evaluatedToday
      .filter(({ metrics }) => metrics.isOngoing)
      .map(({ record }) => ({
        user: report.find((entry) => entry.user.id === record.userId)?.user ?? { id: record.userId },
        checkIn: record.checkIn,
      }));
    const lateEmployees = evaluatedToday
      .filter(({ metrics }) => metrics.lateMinutes > 0)
      .map(({ record }) => report.find((entry) => entry.user.id === record.userId)?.user)
      .filter(Boolean);
    return {
      date: todayKey,
      totalEmployees,
      presentToday,
      absentToday,
      lateArrivals,
      onTimeEmployees,
      halfDays,
      currentlyWorking,
      notPunchedIn: absentToday,
      lateEmployees,
      absentEmployees,
      currentlyWorkingEmployees,
      averageWorkingHours: employeesWithPunch ? Math.round((totalHours / employeesWithPunch) * 100) / 100 : 0,
      monthly: report,
    };
  }

  async getSettings(user: any) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can manage attendance settings.');
    const { timeZone, settings } = await this.context(user.organizationId);
    return { ...settings, timeZone };
  }

  async updateSettings(user: any, body: any) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can manage attendance settings.');
    await this.context(user.organizationId);
    const current = await this.prisma.attendanceSettings.findUnique({ where: { organizationId: user.organizationId } });
    const values = { ...current, ...body };
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(values.officeStartTime) || !timePattern.test(values.officeEndTime)) {
      throw new BadRequestException('Office times must use 24-hour HH:mm format.');
    }
    const startMinute = Number(values.officeStartTime.slice(0, 2)) * 60 + Number(values.officeStartTime.slice(3));
    const endMinute = Number(values.officeEndTime.slice(0, 2)) * 60 + Number(values.officeEndTime.slice(3));
    if (endMinute <= startMinute) throw new BadRequestException('Office end time must be after start time.');
    for (const key of ['gracePeriodMinutes', 'breakDeductionMinutes', 'fullDayMinimumMinutes', 'halfDayMinimumMinutes', 'halfDaysPerDeduction']) {
      if (!Number.isInteger(values[key]) || values[key] < (key === 'halfDaysPerDeduction' ? 1 : 0) || values[key] > 1440) {
        throw new BadRequestException(`${key} must be a valid whole number.`);
      }
    }
    if (values.halfDayMinimumMinutes > values.fullDayMinimumMinutes) {
      throw new BadRequestException('The half-day threshold cannot exceed the full-day threshold.');
    }
    if (!Array.isArray(values.weeklyOffDays) || values.weeklyOffDays.some((day: string) => !WEEKDAYS.includes(day))) {
      throw new BadRequestException('weeklyOffDays must contain valid weekday names.');
    }
    if (typeof values.firstSaturdayOff !== 'boolean' || typeof values.trackEarlyDeparture !== 'boolean') {
      throw new BadRequestException('firstSaturdayOff and trackEarlyDeparture must be boolean values.');
    }
    if (!['absent', 'half_day'].includes(values.belowHalfDayStatus)) {
      throw new BadRequestException('belowHalfDayStatus must be absent or half_day.');
    }
    if (!['after_shift_end', 'after_expected_hours'].includes(values.overtimeMode)) {
      throw new BadRequestException('overtimeMode is invalid.');
    }
    const saved = await this.prisma.attendanceSettings.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        officeStartTime: values.officeStartTime,
        officeEndTime: values.officeEndTime,
        gracePeriodMinutes: values.gracePeriodMinutes,
        breakDeductionMinutes: values.breakDeductionMinutes,
        fullDayMinimumMinutes: values.fullDayMinimumMinutes,
        halfDayMinimumMinutes: values.halfDayMinimumMinutes,
        halfDaysPerDeduction: values.halfDaysPerDeduction,
        weeklyOffDays: values.weeklyOffDays,
        firstSaturdayOff: Boolean(values.firstSaturdayOff),
        belowHalfDayStatus: values.belowHalfDayStatus,
        overtimeMode: values.overtimeMode,
        trackEarlyDeparture: Boolean(values.trackEarlyDeparture),
      },
      update: {
        officeStartTime: values.officeStartTime,
        officeEndTime: values.officeEndTime,
        gracePeriodMinutes: values.gracePeriodMinutes,
        breakDeductionMinutes: values.breakDeductionMinutes,
        fullDayMinimumMinutes: values.fullDayMinimumMinutes,
        halfDayMinimumMinutes: values.halfDayMinimumMinutes,
        halfDaysPerDeduction: values.halfDaysPerDeduction,
        weeklyOffDays: values.weeklyOffDays,
        firstSaturdayOff: Boolean(values.firstSaturdayOff),
        belowHalfDayStatus: values.belowHalfDayStatus,
        overtimeMode: values.overtimeMode,
        trackEarlyDeparture: Boolean(values.trackEarlyDeparture),
      },
    });
    await this.audit(user.organizationId, user.id, 'attendance.settings_updated', saved.id, {
      settings: {
        officeStartTime: saved.officeStartTime,
        officeEndTime: saved.officeEndTime,
        gracePeriodMinutes: saved.gracePeriodMinutes,
        fullDayMinimumMinutes: saved.fullDayMinimumMinutes,
        halfDayMinimumMinutes: saved.halfDayMinimumMinutes,
      },
    });
    return { ...normalizeSettings(saved), timeZone: (await this.context(user.organizationId)).timeZone };
  }

  async createCorrection(user: any, body: any) {
    const { timeZone } = await this.context(user.organizationId);
    const targetUserId = hasAnyRole(user, HR_ROLES) && body.userId ? String(body.userId) : user.id;
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Employee not found.');
    const date = typeof body.date === 'string' && isValidDateKey(body.date) ? body.date : null;
    if (!date) throw new BadRequestException('date must use a valid YYYY-MM-DD date.');
    if (date > getLocalDateKey(new Date(), timeZone)) {
      throw new BadRequestException('Attendance corrections cannot be requested for a future date.');
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
    if (!reason) throw new BadRequestException('A correction reason is required.');
    const requestedCheckIn = body.requestedCheckInTime
      ? parseLocalTime(date, body.requestedCheckInTime, timeZone, 'requestedCheckInTime')
      : body.requestedCheckIn
        ? parseDate(body.requestedCheckIn, 'requestedCheckIn')
        : null;
    const requestedCheckOut = body.requestedCheckOutTime
      ? parseLocalTime(date, body.requestedCheckOutTime, timeZone, 'requestedCheckOutTime')
      : body.requestedCheckOut
        ? parseDate(body.requestedCheckOut, 'requestedCheckOut')
        : null;
    for (const value of [requestedCheckIn, requestedCheckOut]) {
      if (value && getLocalDateKey(value, timeZone) !== date) {
        throw new BadRequestException('Requested times must be on the selected attendance date.');
      }
    }
    if (!requestedCheckIn && !requestedCheckOut) throw new BadRequestException('Provide at least one corrected time.');
    if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
      throw new BadRequestException('Requested check-out must be after check-in.');
    }
    const bounds = this.bounds(date, timeZone);
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { userId: targetUserId, date: { gte: bounds.start, lt: bounds.end } },
      select: { id: true },
    });
    return this.prisma.attendanceCorrection.create({
      data: {
        organizationId: user.organizationId,
        attendanceRecordId: record?.id,
        userId: targetUserId,
        requestedById: user.id,
        date: bounds.start,
        requestedCheckIn,
        requestedCheckOut,
        reason,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listCorrections(user: any, status?: string) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can review attendance corrections.');
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new BadRequestException('Invalid correction status.');
    }
    return this.prisma.attendanceCorrection.findMany({
      where: { organizationId: user.organizationId, ...(status ? { status } : {}) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listMyCorrections(user: any) {
    return this.prisma.attendanceCorrection.findMany({
      where: { organizationId: user.organizationId, userId: user.id },
      include: { reviewedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async decideCorrection(user: any, id: string, body: any) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can review attendance corrections.');
    if (!['approved', 'rejected'].includes(body.status)) {
      throw new BadRequestException('status must be approved or rejected.');
    }
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!correction) throw new NotFoundException('Attendance correction not found.');
    if (correction.status !== 'pending') throw new BadRequestException('This correction has already been reviewed.');
    const reviewNotes = typeof body.reviewNotes === 'string' ? body.reviewNotes.trim().slice(0, 1000) : null;
    const now = new Date();
    const attendanceContext = body.status === 'approved'
      ? await this.context(user.organizationId)
      : null;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.attendanceCorrection.updateMany({
        where: { id, organizationId: user.organizationId, status: 'pending' },
        data: { status: body.status, reviewedById: user.id, reviewedAt: now, reviewNotes },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('This correction has already been reviewed.');
      }
      if (body.status === 'approved') {
        if (!attendanceContext) throw new InternalServerErrorException('Attendance settings were not loaded.');
        const { timeZone, settings } = attendanceContext;
        const dateKey = getLocalDateKey(correction.date, timeZone);
        let record = correction.attendanceRecordId
          ? await tx.attendanceRecord.findUnique({
            where: { id: correction.attendanceRecordId },
            include: { sessions: { orderBy: { checkIn: 'asc' } } },
          })
          : null;
        if (!record) {
          record = await tx.attendanceRecord.create({
            data: { userId: correction.userId, date: correction.date, status: 'absent' },
            include: { sessions: true },
          });
        }
        if (record.sessions.length === 0 && record.checkIn) {
          const legacySession = await tx.attendanceSession.create({
            data: {
              organizationId: user.organizationId,
              recordId: record.id,
              userId: correction.userId,
              checkIn: record.checkIn,
              checkOut: record.checkOut,
              source: 'manual',
            },
          });
          record.sessions.push(legacySession);
        }
        if (
          correction.requestedCheckIn &&
          !correction.requestedCheckOut &&
          dateKey < getLocalDateKey(now, timeZone) &&
          !record.sessions.some((session) => session.checkOut !== null)
        ) {
          throw new BadRequestException('A completed check-out time is required for a past attendance correction.');
        }
        const sessions = [...record.sessions];
        if (correction.requestedCheckIn) {
          const first = sessions[0];
          if (first) {
            sessions[0] = await tx.attendanceSession.update({
              where: { id: first.id },
              data: { checkIn: correction.requestedCheckIn, source: 'manual' },
            });
          } else {
            sessions.push(await tx.attendanceSession.create({
              data: {
                organizationId: user.organizationId,
                recordId: record.id,
                userId: correction.userId,
                checkIn: correction.requestedCheckIn,
                source: 'manual',
              },
            }));
          }
        }
        if (correction.requestedCheckOut) {
          const lastIndex = sessions.length - 1;
          const last = sessions[lastIndex];
          if (last) {
            const checkIn = last.checkIn;
            if (correction.requestedCheckOut <= checkIn) {
              throw new BadRequestException('Check-out must be after check-in.');
            }
            sessions[lastIndex] = await tx.attendanceSession.update({
              where: { id: last.id },
              data: { checkOut: correction.requestedCheckOut, source: 'manual' },
            });
          } else if (correction.requestedCheckIn) {
            if (correction.requestedCheckOut <= correction.requestedCheckIn) {
              throw new BadRequestException('Check-out must be after check-in.');
            }
            sessions.push(await tx.attendanceSession.create({
              data: {
                organizationId: user.organizationId,
                recordId: record.id,
                userId: correction.userId,
                checkIn: correction.requestedCheckIn,
                checkOut: correction.requestedCheckOut,
                source: 'manual',
              },
            }));
          } else {
            throw new BadRequestException('A check-in is required before setting check-out.');
          }
        }
        const { start: dayStart } = this.bounds(dateKey, timeZone);
        const savedSessions = await tx.attendanceSession.findMany({
          where: { recordId: record.id },
          orderBy: { checkIn: 'asc' },
          select: { checkIn: true, checkOut: true },
        });
        const metrics = calculateDailyAttendance(savedSessions, dateKey, now, timeZone, settings);
        const allClosed = savedSessions.length > 0 && savedSessions.every((session) => session.checkOut !== null);
        await tx.attendanceRecord.update({
          where: { id: record.id },
          data: {
            date: dayStart,
            checkIn: metrics.firstCheckIn,
            checkOut: allClosed ? metrics.lastCheckOut : null,
            totalHours: allClosed ? new Prisma.Decimal((metrics.workingMinutes / 60).toFixed(2)) : null,
            status: metrics.status,
            lateMinutes: metrics.lateMinutes,
            earlyDepartureMinutes: metrics.earlyDepartureMinutes,
            overtimeMinutes: metrics.overtimeMinutes,
            halfDay: metrics.isHalfDay,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: `attendance.correction_${body.status}`,
          resource: 'attendance_correction',
          resourceId: id,
          changes: { userId: correction.userId, reason: correction.reason, reviewNotes },
        },
      });
    });
    return this.prisma.attendanceCorrection.findUnique({ where: { id } });
  }

  async editRecord(user: any, id: string, body: any) {
    if (!hasAnyRole(user, HR_ROLES)) throw new ForbiddenException('Only HR can edit attendance records.');
    const { timeZone, settings } = await this.context(user.organizationId);
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id, user: { organizationId: user.organizationId } },
      include: { sessions: { orderBy: { checkIn: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found.');
    const dateKey = getLocalDateKey(record.date, timeZone);
    const changes: Record<string, unknown> = {};
    if (body.notes !== undefined) {
      if (typeof body.notes !== 'string') throw new BadRequestException('notes must be text.');
      changes.notes = body.notes.trim().slice(0, 1000) || null;
    }
    const checkIn = body.checkInTime
      ? parseLocalTime(dateKey, body.checkInTime, timeZone, 'checkInTime')
      : body.checkIn
        ? parseDate(body.checkIn, 'checkIn')
        : null;
    const checkOut = body.checkOutTime
      ? parseLocalTime(dateKey, body.checkOutTime, timeZone, 'checkOutTime')
      : body.checkOut
        ? parseDate(body.checkOut, 'checkOut')
        : null;
    for (const value of [checkIn, checkOut]) {
      if (value && getLocalDateKey(value, timeZone) !== dateKey) {
        throw new BadRequestException('Corrected times must stay on the attendance date.');
      }
    }
    const proposedSessions = record.sessions.length
      ? record.sessions.map((session) => ({ id: session.id, checkIn: session.checkIn, checkOut: session.checkOut }))
      : record.checkIn
        ? [{ id: null as string | null, checkIn: record.checkIn, checkOut: record.checkOut }]
        : [];
    if ((checkIn || checkOut) && !proposedSessions.length && !checkIn) {
      throw new BadRequestException('A check-in is required before setting check-out.');
    }
    if ((checkIn || checkOut) && !proposedSessions.length && checkIn) {
      proposedSessions.push({ id: null, checkIn, checkOut });
    } else {
      if (checkIn) proposedSessions[0].checkIn = checkIn;
      if (checkOut) proposedSessions[proposedSessions.length - 1].checkOut = checkOut;
    }
    for (let index = 0; index < proposedSessions.length; index += 1) {
      const session = proposedSessions[index];
      if (session.checkOut && session.checkOut <= session.checkIn) {
        throw new BadRequestException('Check-out must be after check-in.');
      }
      if (index > 0) {
        const previous = proposedSessions[index - 1];
        if (!previous.checkOut || previous.checkOut > session.checkIn) {
          throw new BadRequestException('Attendance sessions cannot overlap.');
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let sessionIds = record.sessions.map((session) => session.id);
      if (!sessionIds.length && proposedSessions.length) {
        const firstSession = await tx.attendanceSession.create({
          data: {
            organizationId: user.organizationId,
            recordId: record.id,
            userId: record.userId,
            checkIn: proposedSessions[0].checkIn,
            checkOut: proposedSessions[0].checkOut,
            source: 'manual',
          },
        });
        sessionIds = [firstSession.id];
      } else {
        if (checkIn && sessionIds.length) {
          await tx.attendanceSession.update({
            where: { id: sessionIds[0] },
            data: { checkIn: proposedSessions[0].checkIn, source: 'manual' },
          });
        }
        if (checkOut && sessionIds.length) {
          const lastIndex = sessionIds.length - 1;
          await tx.attendanceSession.update({
            where: { id: sessionIds[lastIndex] },
            data: { checkOut: proposedSessions[lastIndex].checkOut, source: 'manual' },
          });
        }
      }

      const sessions = await tx.attendanceSession.findMany({
        where: { recordId: record.id },
        orderBy: { checkIn: 'asc' },
        select: { checkIn: true, checkOut: true },
      });
      const metrics = calculateDailyAttendance(sessions, dateKey, new Date(), timeZone, settings);
      const allClosed = sessions.length > 0 && sessions.every((session) => session.checkOut !== null);
      const saved = await tx.attendanceRecord.update({
        where: { id },
        data: {
          ...changes,
          checkIn: metrics.firstCheckIn,
          checkOut: allClosed ? metrics.lastCheckOut : null,
          totalHours: allClosed ? new Prisma.Decimal((metrics.workingMinutes / 60).toFixed(2)) : null,
          status: metrics.status,
          lateMinutes: metrics.lateMinutes,
          earlyDepartureMinutes: metrics.earlyDepartureMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          halfDay: metrics.isHalfDay,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'attendance.record_updated',
          resource: 'attendance',
          resourceId: id,
          changes: {
            before: { checkIn: record.checkIn, checkOut: record.checkOut, notes: record.notes },
            after: {
              checkIn: metrics.firstCheckIn?.toISOString() ?? null,
              checkOut: metrics.lastCheckOut?.toISOString() ?? null,
              notes: typeof changes.notes === 'string' ? changes.notes : record.notes,
            },
          },
        },
      });
      return tx.attendanceRecord.findUnique({
        where: { id: saved.id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
          sessions: { orderBy: { checkIn: 'asc' } },
        },
      });
    });
    return updated ? this.serializeRecord(updated) : null;
  }

  private async audit(organizationId: string, userId: string, action: string, resourceId: string, changes: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        resource: 'attendance',
        resourceId,
        changes,
      },
    });
  }
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@Request() req: any) {
    return this.attendance.today(req.user);
  }

  @Post('check-in')
  @UseInterceptors(FileInterceptor('photo', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  }))
  checkIn(@Request() req: any, @UploadedFile() photo: PhotoFile) {
    return this.attendance.checkIn(req.user, photo);
  }

  @Post('check-out')
  @UseInterceptors(FileInterceptor('photo', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  }))
  checkOut(@Request() req: any, @UploadedFile() photo: PhotoFile) {
    return this.attendance.checkOut(req.user, photo);
  }

  @Get()
  list(@Request() req: any, @Query() query: any) {
    return this.attendance.list(req.user, query);
  }

  @Get('dashboard')
  dashboard(@Request() req: any, @Query('month') month?: string) {
    return this.attendance.dashboard(req.user, month ?? '');
  }

  @Get('report')
  report(@Request() req: any, @Query('month') month: string) {
    return this.attendance.report(req.user, month);
  }

  @Get('settings')
  getSettings(@Request() req: any) {
    return this.attendance.getSettings(req.user);
  }

  @Put('settings')
  updateSettings(@Request() req: any, @Body() body: any) {
    return this.attendance.updateSettings(req.user, body);
  }

  @Get('corrections')
  corrections(@Request() req: any, @Query('status') status?: string) {
    return this.attendance.listCorrections(req.user, status);
  }

  @Get('corrections/mine')
  myCorrections(@Request() req: any) {
    return this.attendance.listMyCorrections(req.user);
  }

  @Post('corrections')
  createCorrection(@Request() req: any, @Body() body: any) {
    return this.attendance.createCorrection(req.user, body);
  }

  @Patch('corrections/:id')
  decideCorrection(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.attendance.decideCorrection(req.user, id, body);
  }

  @Patch(':id')
  editRecord(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.attendance.editRecord(req.user, id, body);
  }

  @Get('photos/:sessionId/:type')
  async photo(@Request() req: any, @Param('sessionId') sessionId: string, @Param('type') type: string, @Res() res: Response) {
    const photo = await this.attendance.photo(req.user, sessionId, type);
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(photo.path);
  }
}

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
