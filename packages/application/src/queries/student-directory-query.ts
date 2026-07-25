import { Prisma, prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, summarizeAttendance } from "@agentic-edu/domain";
import { buildPagination, parseEnumParam, parseListParams, type Pagination } from "@agentic-edu/shared";
import type { StudentEnrollmentStatus } from "@agentic-edu/shared";

const ENROLLMENT_STATUSES = ["Active", "Probation", "Withdrawn", "Graduated"] as const satisfies readonly StudentEnrollmentStatus[];

export interface StudentDirectoryParams {
  q?: string;
  status?: string;
  grade?: string;
  page?: string;
  pageSize?: string;
}

/**
 * One page of the student directory, with the derived signals each row shows.
 *
 * The page previously did `prisma.student.findMany` with four `include`s and no
 * limit — every student, with every submission, every attendance record, every
 * intervention and every support note, on every navigation (the root layout
 * forces dynamic rendering). At seed scale that is four students. At 500 it is
 * a spinner and a very unhappy database.
 *
 * Two queries now: one `count` for the pagination footer and one `findMany` for
 * the visible slice. The includes remain, because the risk score genuinely
 * needs that data — but it is now bounded by pageSize instead of by how many
 * students the school has.
 */
export async function getStudentDirectory(params: StudentDirectoryParams) {
  const listParams = parseListParams(params);
  const where = buildWhere(params, listParams.q);

  // The count must use the same `where`, or the footer lies about the total.
  // Deriving it from `rows.length` would only ever report the page size.
  const total = await prisma.student.count({ where });
  const pagination: Pagination = buildPagination(total, listParams);

  const students = await prisma.student.findMany({
    where,
    include: {
      submissions: { include: { assignment: true } },
      attendanceRecords: true,
      interventionPlans: true,
      supportNotes: true
    },
    orderBy: [{ gradeLevel: "asc" }, { lastName: "asc" }],
    skip: pagination.skip,
    take: pagination.take
  });

  const rows = students.map((student) => {
    const gradeSummary = calculateGradeSummary(
      student.submissions.map((submission) => ({
        score: submission.score,
        pointsPossible: submission.assignment.pointsPossible,
        status: submission.status,
        gradedAt: submission.gradedAt
      }))
    );
    const attendanceSummary = summarizeAttendance(
      student.attendanceRecords.map((record) => ({ status: record.status, date: record.date }))
    );
    return {
      student,
      gradeSummary,
      attendanceSummary,
      risk: scoreStudentRisk({
        gradeSummary,
        attendanceSummary,
        activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
        recentSupportNoteCount: student.supportNotes.length
      })
    };
  });

  return { rows, pagination };
}

function buildWhere(params: StudentDirectoryParams, q: string | null): Prisma.StudentWhereInput {
  const gradeLevel = Number.parseInt(params.grade ?? "", 10);

  return {
    // parseEnumParam replaces `params.status as never`, which handed an
    // unvalidated query-string value straight to the driver.
    enrollmentStatus: parseEnumParam(params.status, ENROLLMENT_STATUSES),
    gradeLevel: Number.isFinite(gradeLevel) ? gradeLevel : undefined,
    ...(q
      ? {
          // mode: "insensitive" is Postgres-specific and the reason this search
          // is a `contains` rather than a real full-text query. Good enough for
          // a directory; if this ever needs ranking, it needs tsvector.
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { studentNumber: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
}
