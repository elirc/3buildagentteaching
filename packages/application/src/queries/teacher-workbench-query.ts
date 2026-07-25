import { prisma } from "@agentic-edu/db";
import {
  calculateGradeSummary,
  rankGradingQueue,
  scoreStudentRisk,
  scoreTeacherWorkload,
  summarizeAttendance,
  type RankedGradingQueueItem
} from "@agentic-edu/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything waiting on one teacher, in one place.
 *
 * Query budget: 4. One for the teacher and their active sections, one for the
 * ungraded submissions, one for the enrolled students' signals, one for related
 * failed jobs. Deliberately not a loop over sections issuing a query each —
 * that pattern is how a page that is instant on seed data becomes unusable for
 * a teacher with five sections.
 *
 * `now` is injected rather than read inside. Ages feed rankGradingQueue, and a
 * function whose output depends on the wall clock cannot be tested against a
 * fixed expectation.
 */
export async function getTeacherWorkbench(teacherId: string, now: Date = new Date()) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      sections: {
        where: { status: "Active" },
        include: { course: true, enrollments: { where: { status: "Enrolled" } } }
      }
    }
  });
  if (!teacher) return null;

  const sectionIds = teacher.sections.map((section) => section.id);
  const studentIds = [...new Set(teacher.sections.flatMap((s) => s.enrollments.map((e) => e.studentId)))];

  // An empty roster short-circuits: `in: []` is a valid but pointless query, and
  // three of them is three round-trips to learn nothing.
  if (sectionIds.length === 0) {
    return emptyWorkbench(teacher);
  }

  const [ungraded, students, failedJobs] = await Promise.all([
    prisma.submission.findMany({
      where: {
        score: null,
        status: { in: ["Submitted", "Late"] },
        assignment: { classSectionId: { in: sectionIds }, status: "Published" }
      },
      include: {
        student: true,
        assignment: { include: { classSection: { include: { course: true } } } }
      }
    }),
    // The risk score needs each student's whole history, so this is the one
    // genuinely heavy query. It is bounded by roster size rather than by school
    // size, which is the distinction that matters.
    studentIds.length > 0
      ? prisma.student.findMany({
          where: { id: { in: studentIds } },
          include: {
            submissions: { include: { assignment: true } },
            attendanceRecords: true,
            interventionPlans: true,
            supportNotes: true
          }
        })
      : Promise.resolve([]),
    prisma.backgroundJob.count({
      where: {
        status: { in: ["Failed", "DeadLettered", "Retrying"] },
        OR: [{ relatedTeacherId: teacherId }, { relatedClassSectionId: { in: sectionIds } }]
      }
    })
  ]);

  const riskByStudent = new Map(
    students.map((student) => {
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
      return [
        student.id,
        {
          student,
          gradeSummary,
          risk: scoreStudentRisk({
            gradeSummary,
            attendanceSummary,
            activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
            recentSupportNoteCount: student.supportNotes.length
          })
        }
      ] as const;
    })
  );

  const ranked = rankGradingQueue(
    ungraded.map((submission) => ({
      submissionId: submission.id,
      studentId: submission.studentId,
      // Age runs from submission where known, and from the due date otherwise —
      // a Late row with no submittedAt is still waiting on the teacher.
      daysWaiting: Math.floor(
        (now.getTime() - (submission.submittedAt ?? submission.assignment.dueDate).getTime()) / DAY_MS
      ),
      riskLevel: riskByStudent.get(submission.studentId)?.risk.level ?? "Low"
    }))
  );

  const submissionById = new Map(ungraded.map((submission) => [submission.id, submission]));
  const gradingQueue = ranked.map((item: RankedGradingQueueItem) => {
    const submission = submissionById.get(item.submissionId)!;
    return {
      ...item,
      submission,
      studentName: `${submission.student.firstName} ${submission.student.lastName}`,
      assignmentTitle: submission.assignment.title,
      courseTitle: submission.assignment.classSection.course.title
    };
  });

  const publishedAssignments = await prisma.assignment.findMany({
    where: { classSectionId: { in: sectionIds } },
    include: { _count: { select: { submissions: true } } }
  });

  const overdueDrafts = publishedAssignments.filter(
    (assignment) => assignment.status === "Draft" && assignment.dueDate < now
  );
  const publishedWithNoSubmissions = publishedAssignments.filter(
    (assignment) => assignment.status === "Published" && assignment._count.submissions === 0
  );

  const strugglingStudents = [...riskByStudent.values()]
    .filter((entry) => entry.gradeSummary.missingCount >= 3)
    .sort((a, b) => b.gradeSummary.missingCount - a.gradeSummary.missingCount);

  const atRiskCount = [...riskByStudent.values()].filter(
    (entry) => entry.risk.level === "High" || entry.risk.level === "Critical"
  ).length;

  return {
    teacher,
    sections: teacher.sections,
    gradingQueue,
    overdueDrafts,
    publishedWithNoSubmissions,
    strugglingStudents,
    metrics: {
      ungradedCount: ungraded.length,
      dueThisWeek: publishedAssignments.filter(
        (assignment) =>
          assignment.status === "Published" &&
          assignment.dueDate >= now &&
          assignment.dueDate.getTime() - now.getTime() <= 7 * DAY_MS
      ).length,
      atRiskCount,
      failedJobs
    },
    workload: scoreTeacherWorkload({
      employmentStatus: teacher.employmentStatus,
      activeSectionCount: teacher.sections.length,
      studentCount: studentIds.length,
      activeAssignmentCount: publishedAssignments.filter((a) => a.status === "Published").length,
      ungradedSubmissionCount: ungraded.length,
      highRiskStudentCount: atRiskCount
    })
  };
}

type TeacherWithSections = NonNullable<Awaited<ReturnType<typeof loadTeacher>>>;
async function loadTeacher(id: string) {
  return prisma.teacher.findUnique({
    where: { id },
    include: { sections: { where: { status: "Active" }, include: { course: true, enrollments: true } } }
  });
}

function emptyWorkbench(teacher: TeacherWithSections) {
  return {
    teacher,
    sections: [],
    gradingQueue: [],
    overdueDrafts: [],
    publishedWithNoSubmissions: [],
    strugglingStudents: [],
    metrics: { ungradedCount: 0, dueThisWeek: 0, atRiskCount: 0, failedJobs: 0 },
    workload: scoreTeacherWorkload({
      employmentStatus: teacher.employmentStatus,
      activeSectionCount: 0,
      studentCount: 0,
      activeAssignmentCount: 0,
      ungradedSubmissionCount: 0,
      highRiskStudentCount: 0
    })
  };
}
