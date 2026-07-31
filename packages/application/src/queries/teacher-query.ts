import { prisma } from "@agentic-edu/db";
import { scoreTeacherWorkload } from "@agentic-edu/domain";

export async function getTeacherProfile(teacherId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      sections: { include: { course: true, academicTerm: true, enrollments: { include: { student: true } }, assignments: { include: { submissions: true } } } },
      attendanceRecords: { take: 8, orderBy: { date: "desc" } }
    }
  });
  if (!teacher) return null;

  const activeSections = teacher.sections.filter((section) => section.status === "Active");
  const studentIds = new Set(activeSections.flatMap((section) => section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").map((enrollment) => enrollment.studentId)));
  const activeAssignments = activeSections.flatMap((section) => section.assignments.filter((assignment) => assignment.status === "Published"));
  const ungraded = activeAssignments.flatMap((assignment) => assignment.submissions).filter((submission) => submission.score === null).length;
  const workload = scoreTeacherWorkload({
    employmentStatus: teacher.employmentStatus,
    activeSectionCount: activeSections.length,
    studentCount: studentIds.size,
    activeAssignmentCount: activeAssignments.length,
    ungradedSubmissionCount: ungraded,
    highRiskStudentCount: 0
  });
  const [latestRun, audits] = await Promise.all([
    prisma.agentRun.findFirst({ where: { agentType: "TeacherWorkloadInsight", targetId: teacherId }, orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.findMany({ where: { entityType: "Teacher", entityId: teacherId }, orderBy: { createdAt: "desc" }, take: 8 })
  ]);

  return { teacher, activeSections, studentIds, activeAssignments, ungraded, workload, latestRun, audits };
}
