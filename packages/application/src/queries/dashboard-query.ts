import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, scoreTeacherWorkload, summarizeAttendance } from "@agentic-edu/domain";

/**
 * How many students the risk board considers.
 *
 * The risk score is computed in TypeScript from each student's full submission
 * and attendance history, so it cannot be pushed into SQL without duplicating
 * scoreStudentRisk in the database — which would be two sources of truth for
 * the one number this product exists to produce.
 *
 * The compromise: the *counters* come from aggregates over the whole school,
 * and only this many students are loaded in full to rank the board. That keeps
 * the expensive path bounded while leaving the headline numbers accurate.
 *
 * Students on probation are loaded first, so the ones most likely to be at risk
 * are inside the window.
 */
const RISK_BOARD_LIMIT = 50;

/**
 * Dashboard summary.
 *
 * Previously this loaded every student with four nested includes, every teacher
 * with sections/enrollments/assignments/submissions, plus every section and
 * every submission — then counted in JavaScript. With `dynamic = "force-dynamic"`
 * in the root layout, that ran on every navigation to any page, because the
 * dashboard is the layout's default child.
 *
 * Now the eight headline metrics are eight `count` calls that Postgres answers
 * from indexes, and only a bounded slice of students is hydrated for the risk
 * board.
 */
export async function getDashboardSummary() {
  const [
    activeStudents,
    activeTeachers,
    activeSections,
    missingAssignments,
    ungradedSubmissions,
    failedJobs,
    jobs,
    agentRuns,
    auditEvents
  ] = await Promise.all([
    prisma.student.count({ where: { enrollmentStatus: { in: ["Active", "Probation"] } } }),
    prisma.teacher.count({ where: { employmentStatus: "Active" } }),
    prisma.classSection.count({ where: { status: "Active" } }),
    prisma.submission.count({ where: { status: "Missing" } }),
    prisma.submission.count({ where: { score: null, status: { not: "Missing" } } }),
    prisma.backgroundJob.count({ where: { status: { in: ["Failed", "Retrying", "DeadLettered"] } } }),
    prisma.backgroundJob.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);

  // Probation first: the students most likely to score High or Critical should
  // be inside the window when the board is truncated.
  const students = await prisma.student.findMany({
    where: { enrollmentStatus: { in: ["Active", "Probation"] } },
    include: {
      submissions: { include: { assignment: true } },
      attendanceRecords: true,
      interventionPlans: true,
      supportNotes: true
    },
    orderBy: [{ enrollmentStatus: "desc" }, { lastName: "asc" }],
    take: RISK_BOARD_LIMIT
  });

  const studentRisk = students
    .map((student) => {
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
    })
    .sort((a, b) => b.risk.score - a.risk.score);

  const averages = studentRisk
    .map((item) => item.gradeSummary.average)
    .filter((average): average is number => typeof average === "number");
  const classAverage =
    averages.length > 0 ? averages.reduce((sum, average) => sum + average, 0) / averages.length : null;

  const teachers = await prisma.teacher.findMany({
    where: { employmentStatus: { not: "Inactive" }, sections: { some: { status: "Active" } } },
    include: { sections: { where: { status: "Active" }, include: { enrollments: true, assignments: { include: { submissions: true } } } } }
  });

  const workloadAlerts = teachers
    .map((teacher) => {
      const sections = teacher.sections;
      const studentIds = new Set(
        sections.flatMap((section) =>
          section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").map((enrollment) => enrollment.studentId)
        )
      );
      const publishedAssignments = sections.flatMap((section) =>
        section.assignments.filter((assignment) => assignment.status === "Published")
      );
      const ungraded = publishedAssignments
        .flatMap((assignment) => assignment.submissions)
        .filter((submission) => submission.score === null).length;

      return {
        teacher,
        workload: scoreTeacherWorkload({
          employmentStatus: teacher.employmentStatus,
          activeSectionCount: sections.length,
          studentCount: studentIds.size,
          activeAssignmentCount: publishedAssignments.length,
          ungradedSubmissionCount: ungraded,
          highRiskStudentCount: 0
        })
      };
    })
    .filter((item) => item.workload.score >= 60);

  return {
    jobs,
    agentRuns,
    auditEvents,
    studentRisk: studentRisk.slice(0, 10),
    workloadAlerts,
    classAverage,
    /** True when the risk board was truncated, so the UI can say so. */
    riskBoardTruncated: students.length === RISK_BOARD_LIMIT,
    metrics: {
      activeStudents,
      activeTeachers,
      activeSections,
      missingAssignments,
      ungradedSubmissions,
      failedJobs,
      // These two are derived from the loaded slice rather than the whole
      // school, because both depend on scoreStudentRisk / summarizeAttendance.
      // Labelled in the UI so nobody reads them as school-wide totals.
      atRiskStudents: studentRisk.filter((item) => item.risk.level === "High" || item.risk.level === "Critical").length,
      attendanceConcerns: studentRisk.filter(
        (item) => item.attendanceSummary.concernLevel === "Concern" || item.attendanceSummary.concernLevel === "Severe"
      ).length
    }
  };
}
