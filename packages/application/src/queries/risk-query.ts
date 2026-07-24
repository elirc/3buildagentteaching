import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, summarizeAttendance } from "@agentic-edu/domain";

export async function getAtRiskStudentQueue() {
  const students = await prisma.student.findMany({
    include: { submissions: { include: { assignment: true } }, attendanceRecords: true, interventionPlans: true, supportNotes: true },
    orderBy: { lastName: "asc" }
  });

  return students
    .map((student) => {
      const gradeSummary = calculateGradeSummary(student.submissions.map((submission) => ({ score: submission.score, pointsPossible: submission.assignment.pointsPossible, status: submission.status, gradedAt: submission.gradedAt })));
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
    })
    .sort((a, b) => b.risk.score - a.risk.score);
}
