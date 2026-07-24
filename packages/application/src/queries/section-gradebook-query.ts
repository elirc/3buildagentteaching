import { prisma } from "@agentic-edu/db";
import { calculateClassAverage, calculateGradeSummary } from "@agentic-edu/domain";

export async function getSectionGradebook() {
  const sections = await prisma.classSection.findMany({
    include: {
      course: true,
      teacher: true,
      assignments: true,
      enrollments: { include: { student: { include: { submissions: { include: { assignment: true } } } } } }
    },
    orderBy: { term: "desc" }
  });

  return sections.map((section) => {
    const rows = section.enrollments
      .filter((enrollment) => enrollment.status === "Enrolled")
      .map((enrollment) => ({
        enrollment,
        summary: calculateGradeSummary(
          enrollment.student.submissions
            .filter((submission) => submission.assignment.classSectionId === section.id)
            .map((submission) => ({
              score: submission.score,
              pointsPossible: submission.assignment.pointsPossible,
              status: submission.status,
              gradedAt: submission.gradedAt
            }))
        )
      }));
    return {
      section,
      rows,
      classAverage: calculateClassAverage(rows.map((row) => row.summary))
    };
  });
}
