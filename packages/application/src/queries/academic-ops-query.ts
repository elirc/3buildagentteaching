import { prisma } from "@agentic-edu/db";
import { calculateRubricScore } from "@agentic-edu/domain";

export async function getAcademicOperationsOverview() {
  const [terms, guardians, rubrics, notifications, approvals] = await Promise.all([
    prisma.academicTerm.findMany({
      include: { gradingPeriods: true, sections: { include: { course: true } } },
      orderBy: { startsAt: "desc" }
    }),
    prisma.guardian.findMany({
      include: { students: { include: { student: true } } },
      orderBy: { lastName: "asc" }
    }),
    prisma.rubric.findMany({
      include: {
        assignment: true,
        criteria: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.notification.findMany({
      include: { user: true, student: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.interventionApproval.findMany({
      include: { interventionPlan: { include: { student: true } }, requestedBy: true, reviewedBy: true },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  return {
    terms,
    guardians,
    rubrics,
    notifications,
    approvals,
    metrics: {
      activeTerms: terms.filter((term) => term.status === "Active").length,
      guardianLinks: guardians.reduce((sum, guardian) => sum + guardian.students.length, 0),
      unreadNotifications: notifications.filter((notification) => notification.status !== "Read").length,
      pendingApprovals: approvals.filter((approval) => approval.status === "Requested").length
    }
  };
}

export async function getRubricScorePreview(rubricId: string, submissionId: string) {
  const [rubric, scores] = await Promise.all([
    prisma.rubric.findUniqueOrThrow({ where: { id: rubricId }, include: { criteria: true } }),
    prisma.submissionCriterionScore.findMany({ where: { submissionId } })
  ]);

  return calculateRubricScore(
    rubric.criteria.map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      pointsPossible: criterion.pointsPossible
    })),
    scores.map((score) => ({
      criterionId: score.criterionId,
      score: score.score
    }))
  );
}
