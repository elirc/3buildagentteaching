import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, summarizeAttendance } from "@agentic-edu/domain";

export async function getStudentProfile(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      advisor: true,
      enrollments: { include: { classSection: { include: { course: true, teacher: true } } } },
      submissions: { include: { assignment: { include: { classSection: { include: { course: true } } } } } },
      attendanceRecords: { include: { classSection: { include: { course: true } } }, orderBy: { date: "desc" } },
      supportNotes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      interventionPlans: { include: { createdBy: true }, orderBy: { createdAt: "desc" } },
      guardians: { include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }
    }
  });
  if (!student) return null;

  const gradeSummary = calculateGradeSummary(student.submissions.map((submission) => ({ score: submission.score, pointsPossible: submission.assignment.pointsPossible, status: submission.status, gradedAt: submission.gradedAt })));
  const attendanceSummary = summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })));
  const risk = scoreStudentRisk({
    gradeSummary,
    attendanceSummary,
    activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
    recentSupportNoteCount: student.supportNotes.length
  });
  const [progressRun, riskRun, guardianDraftRun, successReviewRun, audits, advisors] = await Promise.all([
    prisma.agentRun.findFirst({ where: { agentType: "StudentProgressSummary", targetId: studentId }, orderBy: { createdAt: "desc" } }),
    prisma.agentRun.findFirst({ where: { agentType: "AtRiskStudentDetection", targetId: studentId }, orderBy: { createdAt: "desc" } }),
    prisma.agentRun.findFirst({ where: { agentType: "GuardianCommunicationDraft", targetId: studentId }, orderBy: { createdAt: "desc" } }),
    prisma.agentRun.findFirst({ where: { agentType: "StudentSuccessReview", targetId: studentId }, orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.findMany({ where: { entityType: "Student", entityId: studentId }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.user.findMany({ where: { role: "Advisor" }, orderBy: { name: "asc" } })
  ]);

  return { student, gradeSummary, attendanceSummary, risk, progressRun, riskRun, guardianDraftRun, successReviewRun, audits, advisors };
}
