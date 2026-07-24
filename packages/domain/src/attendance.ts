import type { AttendanceStatus } from "@agentic-edu/shared";

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

export function findLongestAbsenceStreak(records: AttendanceRecordLike[]): number {
  const sorted = [...records].sort((a, b) => a.date.getTime() - b.date.getTime());
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
