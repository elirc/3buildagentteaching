import { prisma } from "@agentic-edu/db";
import { summarizeAttendance } from "@agentic-edu/domain";

/**
 * Parses a `YYYY-MM-DD` query param into a local midnight Date.
 *
 * `new Date("2026-09-09")` parses as UTC midnight, which in any western
 * timezone is the *previous* day locally. Attendance is keyed on a date, so
 * that offset silently writes the register to the wrong school day — and the
 * bug only appears for users west of Greenwich, which is exactly the kind of
 * defect that survives review.
 */
export function parseSheetDate(value: string | undefined, fallback: Date = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toDateParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The register for one section on one date, plus each student's running
 * attendance summary.
 *
 * Existing records are returned so the form can pre-select them — which makes
 * this an edit view as much as an entry view, and is why the service upserts.
 */
export async function getSectionAttendanceSheet(classSectionId: string, date: Date) {
  const section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: {
      course: true,
      teacher: true,
      academicTerm: true,
      enrollments: {
        where: { status: "Enrolled" },
        include: { student: true },
        orderBy: { student: { lastName: "asc" } }
      }
    }
  });
  if (!section) return null;

  const studentIds = section.enrollments.map((enrollment) => enrollment.studentId);

  const [todaysRecords, allRecords] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { classSectionId, date } }),
    // Whole-section history, so each row can show a running summary. Bounded by
    // roster size, not by school size.
    prisma.attendanceRecord.findMany({
      where: { classSectionId, studentId: { in: studentIds } },
      orderBy: { date: "asc" }
    })
  ]);

  const recordForToday = new Map(todaysRecords.map((record) => [record.studentId, record]));
  const historyByStudent = new Map<string, typeof allRecords>();
  for (const record of allRecords) {
    const list = historyByStudent.get(record.studentId) ?? [];
    list.push(record);
    historyByStudent.set(record.studentId, list);
  }

  // Distinct dates already recorded for this section stand in for the section's
  // timetable. The schedule JSON has days-of-week but no term calendar, so
  // deriving real session dates would mean generating them from the term range
  // — more machinery than the streak calculation currently justifies.
  const sessionDates = [...new Set(allRecords.map((record) => record.date.getTime()))].map((time) => new Date(time));

  const rows = section.enrollments.map((enrollment) => {
    const history = historyByStudent.get(enrollment.studentId) ?? [];
    return {
      enrollment,
      student: enrollment.student,
      existing: recordForToday.get(enrollment.studentId) ?? null,
      summary: summarizeAttendance(
        history.map((record) => ({ status: record.status, date: record.date })),
        sessionDates
      )
    };
  });

  return {
    section,
    date,
    rows,
    totals: {
      present: todaysRecords.filter((record) => record.status === "Present").length,
      absent: todaysRecords.filter((record) => record.status === "Absent").length,
      tardy: todaysRecords.filter((record) => record.status === "Tardy").length,
      excused: todaysRecords.filter((record) => record.status === "Excused").length,
      recorded: todaysRecords.length,
      roster: section.enrollments.length
    }
  };
}
