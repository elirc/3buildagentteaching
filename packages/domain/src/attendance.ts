import type { AttendanceStatus, ClassSectionStatus, EnrollmentStatus } from "@agentic-edu/shared";
import { isDateWithinRange } from "./academic-calendar";

export interface AttendanceRecordLike {
  status: AttendanceStatus;
  date: Date;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  tardy: number;
  excused: number;
  issuePoints: number;
  attendanceRate: number | null;
  concernLevel: "Normal" | "Watch" | "Concern" | "Severe";
  longestAbsenceStreak: number;
}

export function summarizeAttendance(records: AttendanceRecordLike[]): AttendanceSummary {
  const counts = { present: 0, absent: 0, tardy: 0, excused: 0 };

  for (const record of records) {
    if (record.status === "Present") counts.present += 1;
    if (record.status === "Absent") counts.absent += 1;
    if (record.status === "Tardy") counts.tardy += 1;
    if (record.status === "Excused") counts.excused += 1;
  }

  const total = records.length;
  const issuePoints = counts.absent + counts.tardy * 0.5;
  const attendanceRate = total > 0 ? ((counts.present + counts.excused) / total) * 100 : null;
  let concernLevel: AttendanceSummary["concernLevel"] = "Normal";
  if (issuePoints >= 8) concernLevel = "Severe";
  else if (issuePoints >= 5) concernLevel = "Concern";
  else if (issuePoints >= 3) concernLevel = "Watch";

  return {
    ...counts,
    issuePoints,
    attendanceRate,
    concernLevel,
    longestAbsenceStreak: findLongestAbsenceStreak(records)
  };
}

/**
 * Longest run of consecutive absences.
 *
 * Counts consecutive *records*, not consecutive calendar days, which is the
 * right unit: a class that meets Mon/Wed/Fri has no Tuesday to be absent from,
 * so a Friday and the following Monday genuinely are back-to-back sessions.
 * The previous implementation happened to do this too, but only because it
 * never looked at dates at all — it would also have joined absences three weeks
 * apart into a "streak".
 *
 * Passing `sessionDates` fixes that: only records that fall on a scheduled
 * session count toward a run, and a session the student attended breaks it.
 * Without it the behaviour is unchanged, so existing callers are unaffected.
 */
export function findLongestAbsenceStreak(records: AttendanceRecordLike[], sessionDates?: Date[]): number {
  const sorted = [...records].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!sessionDates || sessionDates.length === 0) {
    let longest = 0;
    let current = 0;
    for (const record of sorted) {
      if (record.status === "Absent") {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
    return longest;
  }

  // Walk the schedule, not the records. A session with no record at all breaks
  // the run — "we have no idea" is not evidence of absence, and treating it as
  // such is how a data-entry gap becomes an intervention.
  const statusByDay = new Map(sorted.map((record) => [dayKey(record.date), record.status]));
  const orderedSessions = [...sessionDates].sort((a, b) => a.getTime() - b.getTime());

  let longest = 0;
  let current = 0;
  for (const session of orderedSessions) {
    const status = statusByDay.get(dayKey(session));
    if (status === "Absent") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Local calendar day, not UTC.
 *
 * Attendance is recorded against a school day. Using toISOString() here would
 * bucket a 5pm record in a UTC-7 zone into the *next* day, so a record and its
 * session would silently fail to match.
 */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export interface AttendanceEntryInput {
  enrollmentStatus: EnrollmentStatus;
  sectionStatus: ClassSectionStatus;
  date: Date;
  termRange?: { startsAt: Date; endsAt: Date } | null;
  now?: Date;
}

export interface AttendanceEntryDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether attendance may be recorded for this student, in this section, on this
 * date.
 *
 * The single-record form never asked any of this: it offered every student
 * against every section, so recording a Biology absence for a student who is
 * not in Biology was one mis-click away and produced a row that quietly skewed
 * their attendance rate.
 */
export function canRecordAttendance(input: AttendanceEntryInput): AttendanceEntryDecision {
  if (input.enrollmentStatus !== "Enrolled") {
    return { allowed: false, reason: "Attendance can only be recorded for actively enrolled students." };
  }

  if (input.sectionStatus === "Cancelled" || input.sectionStatus === "Completed") {
    return { allowed: false, reason: `Section is ${input.sectionStatus.toLowerCase()} and no longer meets.` };
  }

  const now = input.now ?? new Date();
  if (input.date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    // A day of slack, so recording "tomorrow" for a known trip is fine while a
    // typo'd year is not.
    return { allowed: false, reason: "Attendance cannot be recorded more than a day in advance." };
  }

  if (input.termRange && !isDateWithinRange(input.date, input.termRange)) {
    return { allowed: false, reason: "That date falls outside the section's academic term." };
  }

  return { allowed: true };
}
