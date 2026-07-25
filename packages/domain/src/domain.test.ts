import { describe, expect, it } from "vitest";
import {
  academicTermStatusSchema,
  approvalDecisionSchema,
  calculateGradeSummary,
  calculateNextRetryAt,
  calculateRubricScore,
  canAcquireJobLock,
  classifyPerformance,
  canTransitionApproval,
  decideEnrollment,
  determineSubmissionStatus,
  guardianRelationshipSchema,
  interventionStatusSchema,
  recommendationDecisionSchema,
  nextNotificationStatusAfterRead,
  retryJob,
  rubricRequiresTeacherReview,
  canPerform,
  scoreStudentRisk,
  scoreTeacherWorkload,
  studentSchema,
  summarizeAttendance,
  validateAcademicTerm,
  validateGradingPeriod,
  validateScore
} from "./index";

describe("enrollment rules", () => {
  it("waitlists a student when the section is full and waitlist is allowed", () => {
    const decision = decideEnrollment({
      studentStatus: "Active",
      sectionStatus: "Active",
      teacherStatus: "Active",
      activeEnrollmentCount: 30,
      sectionCapacity: 30,
      hasExistingActiveEnrollment: false,
      allowWaitlist: true
    });

    expect(decision).toEqual({ allowed: true, status: "Waitlisted" });
  });

  it("blocks withdrawn students and duplicate active enrollments", () => {
    expect(
      decideEnrollment({
        studentStatus: "Withdrawn",
        sectionStatus: "Active",
        teacherStatus: "Active",
        activeEnrollmentCount: 10,
        sectionCapacity: 20,
        hasExistingActiveEnrollment: false
      }).allowed
    ).toBe(false);

    expect(
      decideEnrollment({
        studentStatus: "Active",
        sectionStatus: "Active",
        teacherStatus: "Active",
        activeEnrollmentCount: 10,
        sectionCapacity: 20,
        hasExistingActiveEnrollment: true
      }).allowed
    ).toBe(false);
  });
});

describe("grade calculations", () => {
  it("calculates averages, missing work, and performance bands", () => {
    const summary = calculateGradeSummary([
      { score: 18, pointsPossible: 20, status: "Graded", gradedAt: new Date("2026-01-01") },
      { score: 35, pointsPossible: 50, status: "Graded", gradedAt: new Date("2026-01-02") },
      { score: null, pointsPossible: 30, status: "Missing", gradedAt: null }
    ]);

    expect(Math.round(summary.average ?? 0)).toBe(53);
    expect(summary.missingCount).toBe(1);
    expect(summary.performanceBand).toBe("AtRisk");
    expect(classifyPerformance(88)).toBe("Good");
  });
});

describe("attendance rules", () => {
  it("summarizes absence severity and streaks", () => {
    const summary = summarizeAttendance([
      { status: "Present", date: new Date("2026-01-01") },
      { status: "Absent", date: new Date("2026-01-02") },
      { status: "Absent", date: new Date("2026-01-03") },
      { status: "Absent", date: new Date("2026-01-04") },
      { status: "Tardy", date: new Date("2026-01-05") }
    ]);

    expect(summary.longestAbsenceStreak).toBe(3);
    expect(summary.concernLevel).toBe("Watch");
    expect(summary.issuePoints).toBe(3.5);
  });
});

describe("assignment and submission rules", () => {
  it("marks late and missing submissions deterministically", () => {
    const dueDate = new Date("2026-01-10T12:00:00Z");
    expect(determineSubmissionStatus({ assignmentStatus: "Published", dueDate, submittedAt: new Date("2026-01-11T12:00:00Z") })).toBe("Late");
    expect(determineSubmissionStatus({ assignmentStatus: "Published", dueDate, now: new Date("2026-01-11T12:00:00Z") })).toBe("Missing");
  });

  it("prevents scores above points possible", () => {
    expect(validateScore(21, 20).valid).toBe(false);
    expect(validateScore(20, 20).valid).toBe(true);
  });
});

describe("risk and workload scoring", () => {
  it("raises risk for combined low grades, missing work, and absences", () => {
    const risk = scoreStudentRisk({
      gradeSummary: {
        average: 55,
        earnedPoints: 55,
        possiblePoints: 100,
        missingCount: 4,
        lateCount: 1,
        gradedCount: 3,
        trend: "Declining",
        performanceBand: "AtRisk"
      },
      attendanceSummary: {
        present: 2,
        absent: 5,
        tardy: 0,
        excused: 0,
        issuePoints: 5,
        attendanceRate: 28,
        concernLevel: "Concern",
        longestAbsenceStreak: 3
      },
      activeInterventionCount: 0,
      recentSupportNoteCount: 2
    });

    expect(risk.level).toBe("Critical");
    expect(risk.primaryAreas).toContain("Grades");
    expect(risk.primaryAreas).toContain("Attendance");
  });

  it("scores a large grading backlog as heavy workload", () => {
    const workload = scoreTeacherWorkload({
      employmentStatus: "Active",
      activeSectionCount: 4,
      studentCount: 120,
      activeAssignmentCount: 10,
      ungradedSubmissionCount: 40,
      highRiskStudentCount: 6
    });

    expect(workload.level).toBe("Overloaded");
    expect(workload.indicators).toContain("Large grading backlog");
  });
});

describe("background job retry rules", () => {
  it("queues a failed job retry and dead-letters exhausted jobs", () => {
    expect(retryJob({ status: "Failed", attempts: 1, maxAttempts: 3 })).toMatchObject({ allowed: true, nextStatus: "Queued", attempts: 2 });
    expect(retryJob({ status: "Failed", attempts: 3, maxAttempts: 3 })).toMatchObject({ allowed: false, nextStatus: "DeadLettered" });
  });

  it("prevents worker locks for ineligible or actively locked jobs", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(canAcquireJobLock({ status: "Queued", now }).allowed).toBe(true);
    expect(canAcquireJobLock({ status: "Succeeded", now }).allowed).toBe(false);
    expect(canAcquireJobLock({ status: "Queued", now, lockExpiresAt: new Date("2026-01-01T12:05:00Z") }).allowed).toBe(false);
    expect(calculateNextRetryAt(now, 2).toISOString()).toBe("2026-01-01T12:04:00.000Z");
  });
});

describe("phase 2 academic operations rules", () => {
  it("validates terms and grading periods as calendar boundaries", () => {
    const term = { startsAt: new Date("2026-08-15"), endsAt: new Date("2026-12-20") };
    expect(validateAcademicTerm({ ...term, status: "Planned" }).valid).toBe(true);
    expect(validateGradingPeriod(term, { startsAt: new Date("2026-09-01"), endsAt: new Date("2026-10-15"), weight: 1 }).valid).toBe(true);
    expect(validateGradingPeriod(term, { startsAt: new Date("2027-01-01"), endsAt: new Date("2027-01-31"), weight: 1 }).valid).toBe(false);
  });

  it("summarizes rubric scoring and flags incomplete rubric reviews", () => {
    const summary = calculateRubricScore(
      [
        { id: "accuracy", title: "Accuracy", pointsPossible: 10 },
        { id: "reasoning", title: "Reasoning", pointsPossible: 5 }
      ],
      [{ criterionId: "accuracy", score: 8 }]
    );

    expect(summary.totalScore).toBe(8);
    expect(summary.percentage).toBeCloseTo(53.33, 1);
    expect(summary.missingCriterionIds).toEqual(["reasoning"]);
    expect(rubricRequiresTeacherReview(summary)).toBe(true);
  });

  it("keeps approvals immutable after decision and tracks notification reads", () => {
    expect(canTransitionApproval({ currentStatus: "Requested", nextStatus: "Approved" }).allowed).toBe(true);
    expect(canTransitionApproval({ currentStatus: "Approved", nextStatus: "Rejected" }).allowed).toBe(false);
    expect(nextNotificationStatusAfterRead("Delivered")).toBe("Read");
    expect(nextNotificationStatusAfterRead("Failed")).toBe("Failed");
  });
});

describe("validation", () => {
  it("rejects invalid student email addresses", () => {
    expect(() =>
      studentSchema.parse({
        firstName: "Maya",
        lastName: "Johnson",
        email: "not-an-email",
        gradeLevel: 9,
        enrollmentStatus: "Active",
        studentNumber: "NS-9999",
        guardianName: "Guardian",
        guardianEmail: "guardian@example.com"
      })
    ).toThrow();
  });

  it("rejects enum values that used to reach Prisma through an `as never` cast", () => {
    // Each of these strings is what a tampered <select> or a renamed enum value
    // actually sends. Before these schemas existed the cast let them through and
    // Prisma raised a driver error the user could do nothing with.
    expect(() => interventionStatusSchema.parse("Archived")).toThrow();
    expect(() => academicTermStatusSchema.parse("Draft")).toThrow();
    expect(() => guardianRelationshipSchema.parse("Sibling")).toThrow();
    expect(() => approvalDecisionSchema.parse("NotAStatus")).toThrow();
  });

  it("refuses to move a decision back to its pending state", () => {
    // "Requested" and "Proposed" are starting states. A reviewer decides; they
    // do not un-decide. Parsing is the cheapest place to enforce that, and the
    // Exclude<> typing means a form offering the option would not compile.
    expect(() => approvalDecisionSchema.parse("Requested")).toThrow();
    expect(() => recommendationDecisionSchema.parse("Proposed")).toThrow();

    expect(approvalDecisionSchema.parse("Approved")).toBe("Approved");
    expect(recommendationDecisionSchema.parse("Completed")).toBe("Completed");
  });
});

describe("role permissions", () => {
  it("allows platform managers to manage records", () => {
    expect(canPerform({ id: "admin", role: "Admin" }, "teacher:create")).toBe(true);
    expect(canPerform({ id: "manager", role: "SchoolManager" }, "enrollment:manage")).toBe(true);
  });

  it("limits teachers to instruction workflows scoped to their teacher id", () => {
    expect(canPerform({ id: "u1", role: "Teacher", teacherId: "teacher_1" }, "submission:grade", { teacherId: "teacher_1" })).toBe(true);
    expect(canPerform({ id: "u1", role: "Teacher", teacherId: "teacher_1" }, "submission:grade", { teacherId: "teacher_2" })).toBe(false);
    expect(canPerform({ id: "u1", role: "Teacher", teacherId: "teacher_1" }, "student:create")).toBe(false);
  });

  it("grants Guardian and Viewer nothing at all (pinned before US-08 changes it)", () => {
    // These two roles fall through canPerform to `return false`. That is
    // intentional for Viewer — a read-only observer — and a gap for Guardian,
    // who has a profile table, a digest opt-in flag and notifications addressed
    // to them, but cannot even mark one read.
    //
    // This test pins today's behaviour so US-08 has to change it *deliberately*.
    // When the Guardian branch lands, this test should fail and be rewritten —
    // that failure is the signal that the permission surface moved.
    const guardian = { id: "user_guardian", role: "Guardian" } as const;
    const viewer = { id: "user_viewer", role: "Viewer" } as const;

    for (const action of ["notification:manage", "submission:create", "supportNote:create", "agent:run"] as const) {
      expect(canPerform(guardian, action)).toBe(false);
      expect(canPerform(viewer, action)).toBe(false);
    }
  });

  it("limits students to their own submissions", () => {
    expect(canPerform({ id: "u2", role: "Student", studentId: "student_1" }, "submission:create", { studentId: "student_1" })).toBe(true);
    expect(canPerform({ id: "u2", role: "Student", studentId: "student_1" }, "submission:create", { studentId: "student_2" })).toBe(false);
  });

  it("allows advisors to support assigned students only", () => {
    expect(canPerform({ id: "advisor", role: "Advisor", advisedStudentIds: ["student_1"] }, "intervention:create", { studentId: "student_1" })).toBe(true);
    expect(canPerform({ id: "advisor", role: "Advisor", advisedStudentIds: ["student_1"] }, "intervention:create", { studentId: "student_2" })).toBe(false);
  });
});
