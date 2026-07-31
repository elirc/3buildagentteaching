import { prisma } from "@agentic-edu/db";
import {
  calculateClassAverage,
  calculateWeightedGradeSummary,
  validateGradingPeriodWeights
} from "@agentic-edu/domain";

export async function getSectionGradebook() {
  const sections = await prisma.classSection.findMany({
    include: {
      course: true,
      teacher: true,
      assignments: true,
      // The term brings its grading periods with it, because the weighted
      // average needs them and fetching them per section afterwards would be a
      // query per row of the gradebook.
      academicTerm: { include: { gradingPeriods: { orderBy: { startsAt: "asc" } } } },
      enrollments: { include: { student: { include: { submissions: { include: { assignment: true } } } } } }
    },
    orderBy: [{ academicTerm: { startsAt: "desc" } }, { room: "asc" }]
  });

  return sections.map((section) => {
    const periods = section.academicTerm.gradingPeriods;
    const weights = new Map(periods.map((period) => [period.id, period.weight]));
    const weightReport = validateGradingPeriodWeights(periods.map((period) => ({ name: period.name, weight: period.weight })));

    const rows = section.enrollments
      .filter((enrollment) => enrollment.status === "Enrolled")
      .map((enrollment) => ({
        enrollment,
        summary: calculateWeightedGradeSummary(
          enrollment.student.submissions
            .filter((submission) => submission.assignment.classSectionId === section.id)
            .map((submission) => ({
              score: submission.score,
              pointsPossible: submission.assignment.pointsPossible,
              status: submission.status,
              gradedAt: submission.gradedAt,
              gradingPeriodId: submission.assignment.gradingPeriodId
            })),
          weights
        )
      }));

    return {
      section,
      rows,
      periods,
      weightReport,
      /*
       * The class average is still built from the *unweighted* per-student
       * figure. Averaging weighted finals across students would silently mean
       * something different for each one depending on which periods they have
       * work in, and a class average is meant to be comparable.
       */
      classAverage: calculateClassAverage(rows.map((row) => row.summary))
    };
  });
}
