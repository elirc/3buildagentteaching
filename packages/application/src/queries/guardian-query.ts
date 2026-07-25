import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, summarizeAttendance } from "@agentic-edu/domain";
import type { ActorContext } from "../context";

/**
 * What a guardian may see about their own children.
 *
 * The filtering here is the security boundary, not the template. Every list is
 * scoped by `actor.guardianStudentIds` at the query level, so a rendering
 * mistake cannot leak another family's data — there is nothing in the returned
 * object to leak.
 *
 * Specifically excluded, and each for a reason:
 *
 *   SupportNote      only `Shared` visibility. TeacherOnly, AdvisorOnly and
 *                    AdminOnly notes are staff working notes; a parent reading
 *                    "mother seems disengaged" would be a serious harm and the
 *                    visibility enum exists precisely to prevent it.
 *   AgentRun         guardians never see model output, confidence scores or
 *                    reasoning traces. The GuardianCommunicationDraft agent
 *                    exists to produce something a human approves and sends.
 *   AuditEvent       operational data about staff actions.
 *   InterventionPlan summary and status only, never the internal actions list.
 */
export async function getGuardianDashboard(actor: ActorContext, selectedStudentId?: string) {
  // Copied to a mutable array because Prisma's generated `in:` type is
  // `string[]`. The actor's own scope stays readonly so nothing can mutate it.
  const allowedIds = [...(actor.guardianStudentIds ?? [])];
  if (allowedIds.length === 0) {
    return { students: [], selected: null };
  }

  // A requested id that is not theirs falls back to their first child rather
  // than erroring. The request is refused either way; there is no reason to
  // confirm that some other student id exists.
  const studentId = selectedStudentId && allowedIds.includes(selectedStudentId) ? selectedStudentId : allowedIds[0]!;

  const students = await prisma.student.findMany({
    where: { id: { in: allowedIds } },
    select: { id: true, firstName: true, lastName: true, gradeLevel: true }
  });

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: { status: "Enrolled" },
        include: { classSection: { include: { course: true, teacher: true } } }
      },
      submissions: {
        include: { assignment: { include: { classSection: { include: { course: true } } } } },
        orderBy: { updatedAt: "desc" }
      },
      attendanceRecords: { orderBy: { date: "desc" } },
      interventionPlans: { where: { status: "Active" } },
      // Shared only. This filter is the whole reason the visibility enum exists.
      supportNotes: { where: { visibility: "Shared" }, orderBy: { createdAt: "desc" }, take: 5 },
      guardians: { where: { guardian: { userId: actor.id } }, include: { guardian: true } },
      notifications: { where: { status: { in: ["Delivered", "Read"] } }, orderBy: { createdAt: "desc" }, take: 10 }
    }
  });
  if (!student) return { students, selected: null };

  const gradeSummary = calculateGradeSummary(
    student.submissions.map((submission) => ({
      score: submission.score,
      pointsPossible: submission.assignment.pointsPossible,
      status: submission.status,
      gradedAt: submission.gradedAt
    }))
  );

  // Per-course averages, because "how is my child doing in Biology" is the
  // actual question a parent has — a single school-wide average answers nothing.
  const byCourse = new Map<string, { title: string; scores: typeof student.submissions }>();
  for (const submission of student.submissions) {
    const course = submission.assignment.classSection.course;
    const entry = byCourse.get(course.id) ?? { title: course.title, scores: [] };
    entry.scores.push(submission);
    byCourse.set(course.id, entry);
  }

  const courses = student.enrollments.map((enrollment) => {
    const entry = byCourse.get(enrollment.classSection.courseId);
    return {
      enrollment,
      courseTitle: enrollment.classSection.course.title,
      teacherName: `${enrollment.classSection.teacher.firstName} ${enrollment.classSection.teacher.lastName}`,
      summary: calculateGradeSummary(
        (entry?.scores ?? []).map((submission) => ({
          score: submission.score,
          pointsPossible: submission.assignment.pointsPossible,
          status: submission.status,
          gradedAt: submission.gradedAt
        }))
      )
    };
  });

  return {
    students,
    selected: {
      student,
      courses,
      gradeSummary,
      attendanceSummary: summarizeAttendance(
        student.attendanceRecords.map((record) => ({ status: record.status, date: record.date }))
      ),
      recentlyGraded: student.submissions.filter((submission) => submission.status === "Graded").slice(0, 8),
      // Summary and status only — the recommendedActions list is a staff
      // working document, not a parent-facing one.
      interventions: student.interventionPlans.map((plan) => ({
        id: plan.id,
        riskArea: plan.riskArea,
        summary: plan.summary,
        followUpDate: plan.followUpDate
      })),
      sharedNotes: student.supportNotes,
      notifications: student.notifications,
      links: student.guardians
    }
  };
}
