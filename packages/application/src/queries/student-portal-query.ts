import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, canSubmitAssignment } from "@agentic-edu/domain";
import type { ActorContext } from "../context";

/**
 * A student's own courses and work.
 *
 * Scoped by `actor.studentId` at the query level, like the guardian portal. The
 * page does no filtering.
 *
 * Draft assignments are excluded from every list. A Draft is a teacher's work
 * in progress — showing one to a student leaks an unfinished assignment and
 * invites them to submit against something that may still change.
 */
export async function getStudentCourses(actor: ActorContext) {
  if (!actor.studentId) return null;

  const student = await prisma.student.findUnique({
    where: { id: actor.studentId },
    include: {
      enrollments: {
        where: { status: "Enrolled" },
        include: {
          classSection: {
            include: {
              course: true,
              teacher: true,
              assignments: {
                // Published and Closed only. Never Draft.
                where: { status: { in: ["Published", "Closed"] } },
                orderBy: { dueDate: "asc" }
              }
            }
          }
        }
      },
      submissions: true
    }
  });
  if (!student) return null;

  const submissionByAssignment = new Map(student.submissions.map((s) => [s.assignmentId, s]));

  const courses = student.enrollments.map((enrollment) => {
    const section = enrollment.classSection;
    const work = section.assignments.map((assignment) => ({
      assignment,
      submission: submissionByAssignment.get(assignment.id) ?? null
    }));

    return {
      enrollment,
      section,
      work,
      summary: calculateGradeSummary(
        work.map(({ assignment, submission }) => ({
          score: submission?.score ?? null,
          pointsPossible: assignment.pointsPossible,
          status: submission?.status,
          gradedAt: submission?.gradedAt ?? null
        }))
      )
    };
  });

  return { student, courses };
}

/**
 * One assignment as the student sees it.
 *
 * Returns null when the assignment is not in one of the student's enrolled
 * sections, or is still a Draft — the same answer for "does not exist" and "not
 * yours", so the page cannot be used to probe for assignment ids.
 */
export async function getStudentAssignment(actor: ActorContext, assignmentId: string) {
  if (!actor.studentId) return null;

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      status: { in: ["Published", "Closed"] },
      classSection: { enrollments: { some: { studentId: actor.studentId, status: "Enrolled" } } }
    },
    include: {
      classSection: { include: { course: true, teacher: true } },
      rubric: { include: { criteria: { orderBy: { sortOrder: "asc" } } } }
    }
  });
  if (!assignment) return null;

  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.studentId } },
    include: { criterionScores: true }
  });

  return {
    assignment,
    submission,
    // The same rule the service enforces, so the form can be disabled with a
    // reason rather than letting the student write an essay into a box that
    // will refuse it.
    submitDecision: canSubmitAssignment({
      assignmentStatus: assignment.status,
      dueDate: assignment.dueDate
    })
  };
}
