ALTER TABLE "AttendanceRecord"
  ADD COLUMN "lateMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "earlyDepartureMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "halfDay" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AttendanceSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "officeStartTime" TEXT NOT NULL DEFAULT '10:30',
  "officeEndTime" TEXT NOT NULL DEFAULT '19:00',
  "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
  "breakDeductionMinutes" INTEGER NOT NULL DEFAULT 0,
  "fullDayMinimumMinutes" INTEGER NOT NULL DEFAULT 510,
  "halfDayMinimumMinutes" INTEGER NOT NULL DEFAULT 240,
  "halfDaysPerDeduction" INTEGER NOT NULL DEFAULT 2,
  "weeklyOffDays" TEXT[] NOT NULL DEFAULT ARRAY['Sunday']::TEXT[],
  "firstSaturdayOff" BOOLEAN NOT NULL DEFAULT true,
  "belowHalfDayStatus" TEXT NOT NULL DEFAULT 'absent',
  "overtimeMode" TEXT NOT NULL DEFAULT 'after_shift_end',
  "trackEarlyDeparture" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "checkIn" TIMESTAMP(3) NOT NULL,
  "checkOut" TIMESTAMP(3),
  "checkInPhotoKey" TEXT,
  "checkOutPhotoKey" TEXT,
  "source" TEXT NOT NULL DEFAULT 'punch',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "attendanceRecordId" TEXT,
  "userId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "requestedCheckIn" TIMESTAMP(3),
  "requestedCheckOut" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceSettings_organizationId_key"
  ON "AttendanceSettings"("organizationId");
CREATE INDEX "AttendanceSettings_organizationId_idx"
  ON "AttendanceSettings"("organizationId");
CREATE INDEX "AttendanceSession_organizationId_checkIn_idx"
  ON "AttendanceSession"("organizationId", "checkIn");
CREATE INDEX "AttendanceSession_recordId_checkIn_idx"
  ON "AttendanceSession"("recordId", "checkIn");
CREATE INDEX "AttendanceSession_userId_checkOut_idx"
  ON "AttendanceSession"("userId", "checkOut");
CREATE UNIQUE INDEX "AttendanceSession_one_open_per_user_idx"
  ON "AttendanceSession"("userId")
  WHERE "checkOut" IS NULL;
CREATE INDEX "AttendanceCorrection_organizationId_status_createdAt_idx"
  ON "AttendanceCorrection"("organizationId", "status", "createdAt");
CREATE INDEX "AttendanceCorrection_userId_date_idx"
  ON "AttendanceCorrection"("userId", "date");
CREATE INDEX "AttendanceCorrection_attendanceRecordId_idx"
  ON "AttendanceCorrection"("attendanceRecordId");

ALTER TABLE "AttendanceSettings"
  ADD CONSTRAINT "AttendanceSettings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection"
  ADD CONSTRAINT "AttendanceCorrection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection"
  ADD CONSTRAINT "AttendanceCorrection_attendanceRecordId_fkey"
  FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection"
  ADD CONSTRAINT "AttendanceCorrection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection"
  ADD CONSTRAINT "AttendanceCorrection_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection"
  ADD CONSTRAINT "AttendanceCorrection_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
