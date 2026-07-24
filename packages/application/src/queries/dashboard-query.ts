import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, scoreTeacherWorkload, summarizeAttendance } from "@agentic-edu/domain";

export async function getDashboardSummary() {
  const [students, teachers, sections, submissions, jobs, agentRuns, auditEvents] = await Promise.all([
    prisma.student.findMany({
      include: {
        submissions: { include: { assignment: true } },
        attendanceRecords: true,
        interventionPlans: true,
        supportNotes: true
      }
    }),
    prisma.teacher.findMany({
      include: {
        sections: { include: { enrollments: true, assignments: { include: { submissions: true } } } }
      }
    }),
    prisma.classSection.findMany({ include: { course: true, teacher: true, enrollments: true } }),
    prisma.submission.findMany({ include: { assignment: true } }),
    prisma.backgroundJob.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);

  const studentRisk = students.map((student) => {
    const gradeSummary = calculateGradeSummary(
      student.submissions.map((submission) => ({
        score: submission.score,
        pointsPossible: submission.assignment.pointsPossible,
        status: submission.status,
        gradedAt: submission.gradedAt
      }))
    );
    const attendanceSummary = summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })));
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

  const gradedSummaries = studentRisk.map((item) => item.gradeSummary.average).filter((average): average is number => typeof average === "number");
  const classAverage = gradedSummaries.length > 0 ? gradedSummaries.reduce((sum, average) => sum + average, 0) / gradedSummaries.length : null;
  const workloadAlerts = teachers
    .map((teacher) => {
      const activeSections = teacher.sections.filter((section) => section.status === "Active");
      const studentIds = new Set(activeSections.flatMap((section) => section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").map((enrollment) => enrollment.studentId)));
      const activeAssignments = activeSections.flatMap((section) => section.assignments.filter((assignment) => assignment.status === "Published"));
      const ungraded = activeAssignments.flatMap((assignment) => assignment.submissions).filter((submission) => submission.score === null).length;
      return {
        teacher,
        workload: scoreTeacherWorkload({
          employmentStatus: teacher.employmentStatus,
          activeSectionCount: activeSections.length,
          studentCount: studentIds.size,
          activeAssignmentCount: activeAssignments.length,
          ungradedSubmissionCount: ungraded,
          highRiskStudentCount: 0
        })
      };
    })
    .filter((item) => item.workload.score >= 60);

  return {
    students,
    teachers,
    sections,
    submissions,
    jobs,
    agentRuns,
    auditEvents,
    studentRisk,
    workloadAlerts,
    classAverage,
    metrics: {
      activeStudents: students.filter((student) => student.enrollmentStatus === "Active" || student.enrollmentStatus === "Probation").length,
      activeTeachers: teachers.filter((teacher) => teacher.employmentStatus === "Active").length,
      activeSections: sections.filter((section) => section.status === "Active").length,
      atRiskStudents: studentRisk.filter((item) => item.risk.level === "High" || item.risk.level === "Critical").length,
      missingAssignments: submissions.filter((submission) => submission.status === "Missing").length,
      ungradedSubmissions: submissions.filter((submission) => submission.score === null && submission.status !== "Missing").length,
      attendanceConcerns: studentRisk.filter((item) => item.attendanceSummary.concernLevel === "Concern" || item.attendanceSummary.concernLevel === "Severe").length,
      failedJobs: jobs.filter((job) => job.status === "Failed" || job.status === "Retrying" || job.status === "DeadLettered").length
    }
  };
}
