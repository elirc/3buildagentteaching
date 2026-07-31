import { prisma } from "@agentic-edu/db";
import {
  buildWeeklyRiskReport,
  calculateGradeSummary,
  diffReports,
  scoreStudentRisk,
  summarizeAttendance,
  type ReportDiff,
  type WeeklyRiskReportPayload,
  type WeeklyRiskReportRowInput
} from "@agentic-edu/domain";

export interface ReportScope {
  scopeType: "School" | "ClassSection" | "Advisor";
  scopeId: string | null;
}

/**
 * Gathers the rows a weekly risk report is built from.
 *
 * The scope filter is applied in the `where` rather than by fetching everyone
 * and filtering in JavaScript — the same rule US-03 established for list pages,
 * and the same reason: at seed scale both look identical and at school scale
 * only one of them finishes.
 */
export async function collectWeeklyRiskRows(scope: ReportScope): Promise<{
  rows: WeeklyRiskReportRowInput[];
  scopeLabel: string;
}> {
  const where =
    scope.scopeType === "ClassSection" && scope.scopeId
      ? { enrollments: { some: { classSectionId: scope.scopeId, status: "Enrolled" as const } } }
      : scope.scopeType === "Advisor" && scope.scopeId
        ? { advisorId: scope.scopeId }
        : {};

  const students = await prisma.student.findMany({
    where,
    include: {
      advisor: { select: { name: true } },
      submissions: { include: { assignment: true } },
      attendanceRecords: true,
      interventionPlans: true,
      supportNotes: true
    },
    orderBy: { lastName: "asc" }
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
    const activeInterventionCount = student.interventionPlans.filter((plan) => plan.status === "Active").length;
    const risk = scoreStudentRisk({
      gradeSummary,
      attendanceSummary,
      activeInterventionCount,
      recentSupportNoteCount: student.supportNotes.length
    });

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      gradeLevel: student.gradeLevel,
      riskScore: risk.score,
      riskLevel: risk.level,
      primaryRiskAreas: risk.primaryAreas,
      gradeAverage: gradeSummary.average === null ? null : Math.round(gradeSummary.average),
      missingCount: gradeSummary.missingCount,
      absences: attendanceSummary.absent,
      activeInterventionCount,
      advisorName: student.advisor?.name ?? null
    } satisfies WeeklyRiskReportRowInput;
  });

  return { rows, scopeLabel: await describeScope(scope) };
}

/** Builds the payload without persisting it. Used by the job handler. */
export async function buildWeeklyRiskSnapshot(
  scope: ReportScope,
  periodStart: Date,
  periodEnd: Date
): Promise<WeeklyRiskReportPayload> {
  const { rows, scopeLabel } = await collectWeeklyRiskRows(scope);
  return buildWeeklyRiskReport({ ...scope, scopeLabel, periodStart, periodEnd, rows });
}

export async function listReports(limit = 50) {
  return prisma.report.findMany({ orderBy: { generatedAt: "desc" }, take: limit });
}

/**
 * One report plus its comparison against the previous one of the same type and
 * scope.
 *
 * "Previous" is by `periodStart`, not `generatedAt`. Regenerating last week's
 * report today would otherwise make it look like the newest one and compare
 * this week against itself.
 */
export async function getReportWithDiff(id: string): Promise<{
  report: Awaited<ReturnType<typeof listReports>>[number];
  payload: WeeklyRiskReportPayload;
  previousId: string | null;
  diff: ReportDiff;
} | null> {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return null;

  const previous = await prisma.report.findFirst({
    where: {
      type: report.type,
      scopeType: report.scopeType,
      scopeId: report.scopeId,
      periodStart: { lt: report.periodStart }
    },
    orderBy: { periodStart: "desc" }
  });

  const payload = report.payload as unknown as WeeklyRiskReportPayload;
  const previousPayload = previous ? (previous.payload as unknown as WeeklyRiskReportPayload) : null;

  return { report, payload, previousId: previous?.id ?? null, diff: diffReports(previousPayload, payload) };
}

async function describeScope(scope: ReportScope): Promise<string> {
  if (scope.scopeType === "ClassSection" && scope.scopeId) {
    const section = await prisma.classSection.findUnique({
      where: { id: scope.scopeId },
      include: { course: true, academicTerm: true }
    });
    return section ? `${section.course.code} · ${section.academicTerm.name}` : scope.scopeId;
  }
  if (scope.scopeType === "Advisor" && scope.scopeId) {
    const advisor = await prisma.user.findUnique({ where: { id: scope.scopeId }, select: { name: true } });
    return advisor ? `${advisor.name}'s caseload` : scope.scopeId;
  }
  return "Whole school";
}
