import { describe, expect, it } from "vitest";
import {
  academicTermStatusSchema,
  approvalDecisionSchema,
  calculateGradeSummary,
  calculateNextRetryAt,
  calculateRubricScore,
  analyseTerm,
  assessTermReadiness,
  calculateWeightedGradeSummary,
  buildWeeklyRiskReport,
  decideTermClosure,
  canAcquireJobLock,
  compareSemver,
  diffReports,
  selectActiveVersion,
  isoWeek,
  isoWeekRange,
  weeklyReportKey,
  classifyPerformance,
  canRecordAttendance,
  canTransitionApproval,
  canReduceCapacity,
  decideEnrollment,
  decideGuardianUnlink,
  decideLogRetention,
  normalizeGuardianEmail,
  splitGuardianName,
  decideWaitlistPromotion,
  determineSubmissionStatus,
  findLongestAbsenceStreak,
  guardianRelationshipSchema,
  interventionStatusSchema,
  rankGradingQueue,
  recommendationDecisionSchema,
  nextNotificationStatusAfterRead,
  retryJob,
  routeNotificationRecipients,
  rubricRequiresTeacherReview,
  canPerform,
  scoreStudentRisk,
  scoreTeacherWorkload,
  studentCreateSchema,
  studentSchema,
  summarizeAttendance,
  validateAcademicTerm,
  validateAssignmentDueDate,
  validateGradingPeriod,
  validateGradingPeriodWeights,
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

describe("waitlist promotion", () => {
  const base = {
    studentStatus: "Active" as const,
    sectionStatus: "Active" as const,
    teacherStatus: "Active" as const,
    enrollmentStatus: "Waitlisted" as const,
    activeEnrollmentCount: 2,
    sectionCapacity: 3
  };

  it("promotes into a free seat", () => {
    expect(decideWaitlistPromotion(base)).toEqual({ allowed: true, status: "Enrolled" });
  });

  it("re-checks capacity at promotion time", () => {
    // The roster page said "1 seat open" when it rendered. Someone else may
    // have taken it since. Decide when writing, not when rendering.
    expect(decideWaitlistPromotion({ ...base, activeEnrollmentCount: 3 }).allowed).toBe(false);
  });

  it("refuses a student who has since withdrawn", () => {
    // A student can leave the school while sitting on a waitlist. Promoting
    // them would quietly re-activate a record the office closed.
    expect(decideWaitlistPromotion({ ...base, studentStatus: "Withdrawn" }).allowed).toBe(false);
  });

  it("refuses anything that is not actually waitlisted", () => {
    expect(decideWaitlistPromotion({ ...base, enrollmentStatus: "Dropped" }).allowed).toBe(false);
    expect(decideWaitlistPromotion({ ...base, enrollmentStatus: "Enrolled" }).allowed).toBe(false);
  });
});

describe("capacity changes", () => {
  it("allows raising capacity and holding it at the current count", () => {
    expect(canReduceCapacity({ newCapacity: 30, activeEnrollmentCount: 12 }).allowed).toBe(true);
    expect(canReduceCapacity({ newCapacity: 12, activeEnrollmentCount: 12 }).allowed).toBe(true);
  });

  it("refuses a capacity below the students already seated", () => {
    // Otherwise the section is permanently over-subscribed and every later
    // enrollment check refuses without explaining why.
    const decision = canReduceCapacity({ newCapacity: 2, activeEnrollmentCount: 5 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("5 student(s)");
  });

  it("refuses a capacity of zero", () => {
    expect(canReduceCapacity({ newCapacity: 0, activeEnrollmentCount: 0 }).allowed).toBe(false);
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

  it("counts a late, ungraded submission in the denominator", () => {
    // The bug: this used to contribute nothing at all, so the assignment
    // vanished from the average rather than lowering it. A student with one
    // good score and a pile of ungraded late work looked excellent.
    const summary = calculateGradeSummary([
      { score: 18, pointsPossible: 20, status: "Graded", gradedAt: new Date("2026-01-01") },
      { score: null, pointsPossible: 20, status: "Late", gradedAt: null }
    ]);

    expect(summary.lateCount).toBe(1);
    expect(summary.average).toBe(45); // 18 / 40, not 18 / 20
  });

  it("does not penalise work the teacher simply has not reached", () => {
    // Submitted-and-ungraded is the teacher's backlog, not the student's fault.
    // Counting it would make every student's average drop whenever grading
    // fell behind, which is both unfair and useless as a signal.
    const summary = calculateGradeSummary([
      { score: 18, pointsPossible: 20, status: "Graded", gradedAt: new Date("2026-01-01") },
      { score: null, pointsPossible: 20, status: "Submitted", gradedAt: null },
      { score: null, pointsPossible: 20, status: "NotStarted", gradedAt: null }
    ]);

    expect(summary.average).toBe(90);
  });

  it("keeps a graded late submission scored, not double-counted", () => {
    // Once graded, a Late row takes the normal path. Regression guard for the
    // fix above, which adds an early `continue`.
    const summary = calculateGradeSummary([
      { score: 15, pointsPossible: 20, status: "Late", gradedAt: new Date("2026-01-02") }
    ]);

    expect(summary.lateCount).toBe(1);
    expect(summary.gradedCount).toBe(1);
    expect(summary.average).toBe(75);
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

  it("breaks an absence streak on a session the student attended", () => {
    // Mon/Wed/Fri section. Absent Mon and Fri, present Wed — two separate
    // single absences, not a streak of two.
    const sessions = [new Date("2026-09-07"), new Date("2026-09-09"), new Date("2026-09-11")];
    const records = [
      { status: "Absent" as const, date: new Date("2026-09-07") },
      { status: "Present" as const, date: new Date("2026-09-09") },
      { status: "Absent" as const, date: new Date("2026-09-11") }
    ];

    expect(findLongestAbsenceStreak(records, sessions)).toBe(1);
  });

  it("treats consecutive sessions across a weekend as consecutive", () => {
    // Friday then Monday IS back-to-back for a class that does not meet at the
    // weekend. Counting calendar days here would report a gap that never
    // existed.
    const sessions = [new Date("2026-09-11"), new Date("2026-09-14")];
    const records = [
      { status: "Absent" as const, date: new Date("2026-09-11") },
      { status: "Absent" as const, date: new Date("2026-09-14") }
    ];

    expect(findLongestAbsenceStreak(records, sessions)).toBe(2);
  });

  it("does not treat a missing record as an absence", () => {
    // A session nobody took attendance for is unknown, not absent. Guessing
    // turns a data-entry gap into an intervention.
    const sessions = [new Date("2026-09-07"), new Date("2026-09-09"), new Date("2026-09-11")];
    const records = [
      { status: "Absent" as const, date: new Date("2026-09-07") },
      { status: "Absent" as const, date: new Date("2026-09-11") }
    ];

    expect(findLongestAbsenceStreak(records, sessions)).toBe(1);
  });
});

describe("attendance entry rules", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const termRange = { startsAt: new Date("2026-08-17"), endsAt: new Date("2026-12-18") };

  it("allows an enrolled student in an active section on a term date", () => {
    expect(
      canRecordAttendance({
        enrollmentStatus: "Enrolled",
        sectionStatus: "Active",
        date: new Date("2026-09-09"),
        termRange,
        now
      }).allowed
    ).toBe(true);
  });

  it("refuses a student who is not enrolled in this section", () => {
    // The single-record form offered every student against every section, so a
    // mis-click produced a row that quietly skewed someone's attendance rate.
    const decision = canRecordAttendance({
      enrollmentStatus: "Dropped",
      sectionStatus: "Active",
      date: new Date("2026-09-09"),
      termRange,
      now
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("actively enrolled");
  });

  it("refuses a date outside the section's term", () => {
    expect(
      canRecordAttendance({
        enrollmentStatus: "Enrolled",
        sectionStatus: "Active",
        date: new Date("2026-07-04"),
        termRange,
        now
      }).allowed
    ).toBe(false);
  });

  it("allows tomorrow but refuses a typo'd future date", () => {
    // A day of slack covers a known trip; a mistyped year does not.
    expect(
      canRecordAttendance({ enrollmentStatus: "Enrolled", sectionStatus: "Active", date: new Date("2026-09-11T09:00:00Z"), now }).allowed
    ).toBe(true);
    expect(
      canRecordAttendance({ enrollmentStatus: "Enrolled", sectionStatus: "Active", date: new Date("2027-09-10"), now }).allowed
    ).toBe(false);
  });

  it("refuses a cancelled section", () => {
    expect(
      canRecordAttendance({ enrollmentStatus: "Enrolled", sectionStatus: "Cancelled", date: new Date("2026-09-09"), now }).allowed
    ).toBe(false);
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

  it("puts a Critical student's newer work above a Low-risk student's older work", () => {
    // The reason rankGradingQueue exists. Sorting by age alone buries the
    // submission that matters most under one that matters least.
    const ranked = rankGradingQueue([
      { submissionId: "sub_low_old", studentId: "s1", daysWaiting: 9, riskLevel: "Low" },
      { submissionId: "sub_critical_new", studentId: "s2", daysWaiting: 5, riskLevel: "Critical" }
    ]);

    expect(ranked.map((item) => item.submissionId)).toEqual(["sub_critical_new", "sub_low_old"]);
  });

  it("still lets age win once the gap is large enough", () => {
    // Risk weighting must not become an absolute override, or genuinely stale
    // work never gets graded.
    const ranked = rankGradingQueue([
      { submissionId: "sub_low_ancient", studentId: "s1", daysWaiting: 30, riskLevel: "Low" },
      { submissionId: "sub_high_new", studentId: "s2", daysWaiting: 1, riskLevel: "High" }
    ]);

    expect(ranked[0]?.submissionId).toBe("sub_low_ancient");
  });

  it("orders identical items deterministically", () => {
    // Without a total order the table reshuffles between renders, which reads
    // as a bug even though every row is present.
    const items = [
      { submissionId: "sub_b", studentId: "s1", daysWaiting: 3, riskLevel: "Medium" as const },
      { submissionId: "sub_a", studentId: "s2", daysWaiting: 3, riskLevel: "Medium" as const }
    ];

    expect(rankGradingQueue(items).map((i) => i.submissionId)).toEqual(["sub_a", "sub_b"]);
    expect(rankGradingQueue([...items].reverse()).map((i) => i.submissionId)).toEqual(["sub_a", "sub_b"]);
  });

  it("clamps a negative wait to zero", () => {
    // A due date in the future produces a negative age. Treat it as brand new
    // rather than letting it sort below everything.
    const [item] = rankGradingQueue([
      { submissionId: "sub_future", studentId: "s1", daysWaiting: -4, riskLevel: "High" }
    ]);
    expect(item?.daysWaiting).toBe(0);
    expect(item?.urgency).toBe(7);
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
        studentNumber: "NS-9999"
      })
    ).toThrow();
  });

  it("requires a guardian to create a student but not to edit one", () => {
    const fields = {
      firstName: "Maya",
      lastName: "Johnson",
      email: "maya@student.example",
      gradeLevel: 9,
      enrollmentStatus: "Active" as const,
      studentNumber: "NS-9999"
    };

    // Editing a student says nothing about their guardians. That asymmetry is
    // the fix: guardian fields on the edit form are how the denormalised copy
    // drifted from the Guardian record every time someone changed a grade level.
    expect(() => studentSchema.parse(fields)).not.toThrow();

    expect(() => studentCreateSchema.parse(fields)).toThrow();
    expect(() => studentCreateSchema.parse({ ...fields, primaryGuardian: { name: "Denise Johnson", email: "not-an-email" } })).toThrow();
    expect(() =>
      studentCreateSchema.parse({ ...fields, primaryGuardian: { name: "Denise Johnson", email: "denise@example.com" } })
    ).not.toThrow();
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

describe("notification routing", () => {
  const staff = [
    { userId: "u_admin", role: "Admin" as const },
    { userId: "u_manager", role: "SchoolManager" as const },
    { userId: "u_teacher", role: "Teacher" as const },
    { userId: "u_advisor", role: "Advisor" as const }
  ];

  it("sends job failures only to people who can act on them", () => {
    // A teacher can do nothing about a dead-lettered job. Telling them anyway
    // trains the people who CAN act to stop reading.
    expect(routeNotificationRecipients("JobFailure", staff)).toEqual(["u_admin", "u_manager"]);
  });

  it("follows the agent's nominated owner for recommendations", () => {
    expect(routeNotificationRecipients("AgentRecommendation", staff, { ownerRole: "Teacher" })).toEqual(["u_teacher"]);
    expect(routeNotificationRecipients("AgentRecommendation", staff, { ownerRole: "Admin" })).toEqual(["u_admin"]);
  });

  it("falls back to support staff when the owner role is missing or nonsense", () => {
    // A recommendation nobody receives is worse than one a few extra people see.
    expect(routeNotificationRecipients("AgentRecommendation", staff, { ownerRole: null })).toEqual([
      "u_admin",
      "u_manager",
      "u_advisor"
    ]);
    expect(routeNotificationRecipients("AgentRecommendation", staff, { ownerRole: "Wizard" })).toEqual([
      "u_admin",
      "u_manager",
      "u_advisor"
    ]);
  });

  it("passes through recipients for student-facing types", () => {
    const family = [
      { userId: "u_student", role: "Student" as const },
      { userId: "u_guardian", role: "Guardian" as const }
    ];
    expect(routeNotificationRecipients("GradePosted", family)).toEqual(["u_student", "u_guardian"]);
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

  it("grants a Viewer nothing — read-only means read-only", () => {
    const viewer = { id: "user_viewer", role: "Viewer" } as const;
    for (const action of ["notification:manage", "submission:create", "supportNote:create", "agent:run"] as const) {
      expect(canPerform(viewer, action)).toBe(false);
    }
  });

  it("lets a Guardian see their own children and nobody else's", () => {
    // Replaces the US-02 characterisation test, which asserted that Guardian
    // could do nothing at all. That test existed to force this change to be
    // deliberate rather than accidental; it has done its job.
    const guardian = {
      id: "user_guardian",
      role: "Guardian",
      guardianStudentIds: ["student_maya"]
    } as const;

    expect(canPerform(guardian, "guardian:viewOwnStudents", { studentId: "student_maya" })).toBe(true);
    expect(canPerform(guardian, "guardian:updateOwnPreferences", { studentId: "student_maya" })).toBe(true);

    expect(canPerform(guardian, "guardian:viewOwnStudents", { studentId: "student_liam" })).toBe(false);
  });

  it("does not let a Guardian near staff workflows", () => {
    // The surface is deliberately tiny: look at your child, change how you are
    // contacted. Everything else stays refused.
    const guardian = { id: "user_guardian", role: "Guardian", guardianStudentIds: ["student_maya"] } as const;

    for (const action of [
      "supportNote:create",
      "intervention:create",
      "agent:run",
      "submission:grade",
      "notification:manage"
    ] as const) {
      expect(canPerform(guardian, action, { studentId: "student_maya" })).toBe(false);
    }
  });

  it("lets anyone mark their own notification read, and nobody else's", () => {
    // notification:readOwn is about ownership, not role — which is why it is
    // checked before the Admin short-circuit. An Admin needing to touch someone
    // else's notification uses notification:manage instead.
    const guardian = { id: "user_guardian", role: "Guardian" } as const;
    const student = { id: "user_student", role: "Student" } as const;
    const admin = { id: "user_admin", role: "Admin" } as const;

    expect(canPerform(guardian, "notification:readOwn", { recipientUserId: "user_guardian" })).toBe(true);
    expect(canPerform(student, "notification:readOwn", { recipientUserId: "user_student" })).toBe(true);

    expect(canPerform(guardian, "notification:readOwn", { recipientUserId: "user_student" })).toBe(false);
    expect(canPerform(admin, "notification:readOwn", { recipientUserId: "user_student" })).toBe(false);
  });

  it("limits students to their own submissions", () => {
    expect(canPerform({ id: "u2", role: "Student", studentId: "student_1" }, "submission:create", { studentId: "student_1" })).toBe(true);
    expect(canPerform({ id: "u2", role: "Student", studentId: "student_1" }, "submission:create", { studentId: "student_2" })).toBe(false);
  });

  it("allows advisors to support assigned students only", () => {
    expect(canPerform({ id: "advisor", role: "Advisor", advisedStudentIds: ["student_1"] }, "intervention:create", { studentId: "student_1" })).toBe(true);
    expect(canPerform({ id: "advisor", role: "Advisor", advisedStudentIds: ["student_1"] }, "intervention:create", { studentId: "student_2" })).toBe(false);
  });

  it("keeps log deletion with Admin and away from every other role", () => {
    // Deliberately asymmetric: SchoolManager has every other platform action.
    // Deleting the record of what the system did is the one that stops there.
    expect(canPerform({ id: "u", role: "Admin" }, "log:manage")).toBe(true);
    expect(canPerform({ id: "u", role: "SchoolManager" }, "log:manage")).toBe(false);
    expect(canPerform({ id: "u", role: "Advisor" }, "log:manage")).toBe(false);
    expect(canPerform({ id: "u", role: "Teacher" }, "log:manage")).toBe(false);
  });
});

describe("term analysis", () => {
  const section = (overrides: Partial<Parameters<typeof analyseTerm>[0]["sections"][number]> = {}) => ({
    sectionId: "s1",
    sectionLabel: "MATH-101",
    teacherName: "Nina Patel",
    enrolledCount: 20,
    classAverage: 85,
    submittedCount: 40,
    missingCount: 0,
    ungradedCount: 0,
    attendanceConcernCount: 0,
    ...overrides
  });

  const analyse = (overrides: Partial<Parameters<typeof analyseTerm>[0]> = {}) =>
    analyseTerm({
      termName: "Fall 2026",
      sections: [section()],
      interventions: [],
      teacherWorkloads: [],
      agentRunCount: 0,
      recommendationsProposed: 0,
      recommendationsAccepted: 0,
      deadLetteredJobCount: 0,
      studentRiskLevels: [],
      ...overrides
    });

  it("accumulates every reason a section needs review, not just the first", () => {
    // A section can be low-scoring AND behind on grading AND have attendance
    // concerns. Reporting only the first would send someone to fix a third of
    // the problem and call it done.
    const result = analyse({
      sections: [section({ classAverage: 61, missingCount: 20, ungradedCount: 5, attendanceConcernCount: 2 })]
    });

    const reason = result.sectionsNeedingReview[0]?.reason ?? "";
    expect(reason).toContain("61%");
    expect(reason).toContain("missing");
    expect(reason).toContain("ungraded");
    expect(reason).toContain("attendance");
  });

  it("counts cancelled as abandoned and still-active separately", () => {
    /*
     * A plan still running at term end has not been abandoned — it has not
     * finished, which is a different problem with a different owner. Folding
     * them together would report a school that carries plans forward as one
     * that gives up on them.
     */
    const result = analyse({
      interventions: [
        { status: "Completed", riskArea: "Grades" },
        { status: "Cancelled", riskArea: "Attendance" },
        { status: "Active", riskArea: "Grades" },
        { status: "Active", riskArea: "Engagement" }
      ]
    });

    expect(result.interventionEffectiveness).toEqual({ completed: 1, abandoned: 1, stillActive: 2 });
  });

  it("flags a section with enrolled students and no submissions at all", () => {
    const result = analyse({ sections: [section({ submittedCount: 0, missingCount: 0, classAverage: null })] });
    expect(result.dataQualityIssues.join(" ")).toContain("no submissions at all");
  });

  it("reports no acceptance rate rather than zero when nothing was recommended", () => {
    // 0% means "everything was rejected". null means "nothing was proposed".
    expect(analyse({ recommendationsProposed: 0 }).recommendationAcceptanceRate).toBeNull();
    expect(analyse({ recommendationsProposed: 4, recommendationsAccepted: 1 }).recommendationAcceptanceRate).toBe(0.25);
  });
});

describe("term readiness and closure", () => {
  const baseAnalysis = {
    sectionHighlights: [],
    sectionsNeedingReview: [],
    interventionEffectiveness: { completed: 0, abandoned: 0, stillActive: 0 },
    staffingObservations: [],
    dataQualityIssues: [],
    recommendationAcceptanceRate: null,
    totalUngraded: 0,
    riskCounts: { Low: 0, Medium: 0, High: 0, Critical: 0 }
  };

  it("blocks only on ungraded work, and flags everything else as NeedsWork", () => {
    /*
     * The distinction the whole close-term workflow rests on. Ungraded work
     * means grades are not final, and a term closed with non-final grades
     * records a mark nobody scored. Everything else is worth doing and not
     * worth blocking on.
     */
    expect(assessTermReadiness({ ...baseAnalysis, totalUngraded: 3 })).toBe("Blocked");
    expect(assessTermReadiness({ ...baseAnalysis, staffingObservations: ["Heavy load"] })).toBe("NeedsWork");
    expect(assessTermReadiness({ ...baseAnalysis, sectionsNeedingReview: [{ sectionId: "s1", reason: "low" }] })).toBe("NeedsWork");
    expect(assessTermReadiness(baseAnalysis)).toBe("Ready");
  });

  it("refuses closure while work is ungraded, naming how much", () => {
    const refused = decideTermClosure({ ungradedCount: 4, status: "Active" });
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toContain("4 submission(s)");
  });

  it("refuses to close a term twice", () => {
    // Idempotence would be wrong here: closing runs the postmortem agent, and a
    // second close would produce a second report of a term that has not changed.
    expect(decideTermClosure({ ungradedCount: 0, status: "Closed" }).allowed).toBe(false);
    expect(decideTermClosure({ ungradedCount: 0, status: "Archived" }).allowed).toBe(false);
    expect(decideTermClosure({ ungradedCount: 0, status: "Active" }).allowed).toBe(true);
  });
});

describe("agent version selection", () => {
  it("orders by number, not by string", () => {
    // The bug this exists to prevent: lexicographically "1.0.10" sorts BEFORE
    // "1.0.9", so a string compare keeps serving the older version forever —
    // silently, because the wrong version produces plausible output.
    expect(compareSemver("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("ranks a release above its own pre-releases", () => {
    expect(compareSemver("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });

  it("ignores build metadata, which semver excludes from precedence", () => {
    expect(compareSemver("1.0.0+build.5", "1.0.0+build.9")).toBe(0);
  });

  it("picks the highest active version and ignores inactive ones", () => {
    const manifests = [
      { version: "1.0.9", isActive: true },
      { version: "1.0.10", isActive: true },
      { version: "2.0.0", isActive: false }
    ];

    // 2.0.0 is highest but switched off — that is what "deactivate to roll
    // back" means, and it must return traffic to 1.0.10 rather than stopping.
    expect(selectActiveVersion(manifests)?.version).toBe("1.0.10");
  });

  it("returns null when nothing is active, rather than the newest inactive row", () => {
    expect(selectActiveVersion([{ version: "1.0.0", isActive: false }])).toBeNull();
    expect(selectActiveVersion([])).toBeNull();
  });
});

describe("weekly risk reports", () => {
  const row = (overrides: Partial<Parameters<typeof buildWeeklyRiskReport>[0]["rows"][number]> = {}) => ({
    studentId: "s1",
    studentName: "Maya Johnson",
    gradeLevel: 9,
    riskScore: 40,
    riskLevel: "Medium" as const,
    primaryRiskAreas: ["Grades"],
    gradeAverage: 68,
    missingCount: 2,
    absences: 1,
    activeInterventionCount: 0,
    advisorName: "Jordan Reyes",
    ...overrides
  });

  const build = (rows: ReturnType<typeof row>[]) =>
    buildWeeklyRiskReport({
      scopeType: "School",
      scopeId: null,
      scopeLabel: "Whole school",
      periodStart: new Date("2026-10-12T00:00:00.000Z"),
      periodEnd: new Date("2026-10-18T23:59:59.999Z"),
      rows
    });

  it("counts every risk band, including the ones with nobody in them", () => {
    const payload = build([row({ riskLevel: "Critical", riskScore: 90 }), row({ studentId: "s2", riskLevel: "Low", riskScore: 10 })]);

    // A band reading 0 is information. A missing key is a rendering bug waiting
    // to happen in whatever reads this payload back out of a Json column.
    expect(payload.totals.byLevel).toEqual({ Low: 1, Medium: 0, High: 0, Critical: 1 });
    expect(payload.totals.averageRiskScore).toBe(50);
    expect(payload.totals.students).toBe(2);
  });

  it("sorts worst first so the report starts where the attention is needed", () => {
    const payload = build([
      row({ studentId: "s1", studentName: "Low risk", riskScore: 10 }),
      row({ studentId: "s2", studentName: "High risk", riskScore: 85 })
    ]);

    expect(payload.rows.map((entry) => entry.studentName)).toEqual(["High risk", "Low risk"]);
  });

  it("reports no average for an empty scope rather than zero", () => {
    // Zero would read as "everyone is fine", which is a different claim from
    // "there is nobody here".
    expect(build([]).totals.averageRiskScore).toBeNull();
  });
});

describe("report diffing", () => {
  const payload = (rows: Array<{ id: string; name: string; score: number; level: "Low" | "Medium" | "High" | "Critical" }>) =>
    buildWeeklyRiskReport({
      scopeType: "School",
      scopeId: null,
      scopeLabel: "Whole school",
      periodStart: new Date("2026-10-12T00:00:00.000Z"),
      periodEnd: new Date("2026-10-18T23:59:59.999Z"),
      rows: rows.map((entry) => ({
        studentId: entry.id,
        studentName: entry.name,
        gradeLevel: 9,
        riskScore: entry.score,
        riskLevel: entry.level,
        primaryRiskAreas: [],
        gradeAverage: 70,
        missingCount: 0,
        absences: 0,
        activeInterventionCount: 0,
        advisorName: null
      }))
    });

  it("identifies a student who moved Medium to High as newly elevated", () => {
    const before = payload([{ id: "s1", name: "Maya", score: 40, level: "Medium" }]);
    const after = payload([{ id: "s1", name: "Maya", score: 65, level: "High" }]);

    const diff = diffReports(before, after);
    expect(diff.newlyElevated.map((entry) => entry.studentId)).toEqual(["s1"]);
    expect(diff.newlyElevated[0]?.delta).toBe(25);
    expect(diff.improved).toEqual([]);
  });

  it("identifies a student who left Critical as improved", () => {
    const before = payload([{ id: "s1", name: "Maya", score: 85, level: "Critical" }]);
    const after = payload([{ id: "s1", name: "Maya", score: 30, level: "Low" }]);

    const diff = diffReports(before, after);
    expect(diff.improved.map((entry) => entry.studentId)).toEqual(["s1"]);
    expect(diff.improved[0]?.delta).toBe(-55);
  });

  it("does not report a newly enrolled student as an escalation", () => {
    /*
     * The distinction that matters: appearing for the first time at Critical is
     * not the same event as *becoming* Critical. Conflating them sends an
     * advisor looking for something that happened this week when the student
     * simply enrolled.
     */
    const before = payload([]);
    const after = payload([{ id: "s2", name: "Noah", score: 90, level: "Critical" }]);

    const diff = diffReports(before, after);
    expect(diff.added.map((entry) => entry.studentId)).toEqual(["s2"]);
    expect(diff.newlyElevated).toEqual([]);
  });

  it("treats a first-ever report as all additions and no escalations", () => {
    const diff = diffReports(null, payload([{ id: "s1", name: "Maya", score: 90, level: "Critical" }]));

    expect(diff.added).toHaveLength(1);
    expect(diff.newlyElevated).toEqual([]);
    expect(diff.biggestMovers).toEqual([]);
  });

  it("ranks movers by the size of the change, ignoring students who did not move", () => {
    const before = payload([
      { id: "s1", name: "Small", score: 40, level: "Medium" },
      { id: "s2", name: "Big", score: 20, level: "Low" },
      { id: "s3", name: "Static", score: 50, level: "Medium" }
    ]);
    const after = payload([
      { id: "s1", name: "Small", score: 45, level: "Medium" },
      { id: "s2", name: "Big", score: 70, level: "High" },
      { id: "s3", name: "Static", score: 50, level: "Medium" }
    ]);

    const diff = diffReports(before, after);
    expect(diff.biggestMovers.map((entry) => entry.studentId)).toEqual(["s2", "s1"]);
  });
});

describe("ISO week keys and ranges", () => {
  it("gives the same key for two days in the same week", () => {
    // Two people pressing Generate on Tuesday and Thursday mean one report.
    expect(weeklyReportKey(null, new Date("2026-10-13T09:00:00.000Z")))
      .toBe(weeklyReportKey(null, new Date("2026-10-15T17:00:00.000Z")));
  });

  it("handles the new-year boundary, where a naive day-count would not", () => {
    // 1 Jan 2027 is a Friday, so it belongs to the ISO week that started
    // Monday 28 December 2026 — and must key to the same week as that Monday.
    expect(isoWeek(new Date("2027-01-01T00:00:00.000Z")))
      .toBe(isoWeek(new Date("2026-12-28T00:00:00.000Z")));
  });

  it("anchors the range to Monday so the same week always agrees on its bounds", () => {
    const tuesday = isoWeekRange(new Date("2026-10-13T14:30:00.000Z"));
    const thursday = isoWeekRange(new Date("2026-10-15T02:00:00.000Z"));

    expect(tuesday.periodStart.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(tuesday.periodStart.getTime()).toBe(thursday.periodStart.getTime());
    expect(tuesday.periodEnd.toISOString()).toBe("2026-10-18T23:59:59.999Z");
  });
});

describe("term calendar rules", () => {
  const term = {
    name: "Fall 2026",
    startsAt: new Date("2026-08-17T00:00:00.000Z"),
    endsAt: new Date("2026-12-18T00:00:00.000Z")
  };

  it("accepts a due date inside the term and names the term when it is outside", () => {
    expect(validateAssignmentDueDate(new Date("2026-10-01T00:00:00.000Z"), term).valid).toBe(true);

    const late = validateAssignmentDueDate(new Date("2027-01-05T00:00:00.000Z"), term);
    expect(late.valid).toBe(false);
    // The message has to say what the date is being compared against. "Invalid
    // due date" sends the teacher to ask a colleague; this one does not.
    expect(late.reason).toContain("Fall 2026");
    expect(late.reason).toContain("2026-08-17");
    expect(late.reason).toContain("2026-12-18");

    expect(validateAssignmentDueDate(new Date("2026-08-01T00:00:00.000Z"), term).valid).toBe(false);
  });

  it("treats the term boundaries as inside the term", () => {
    expect(validateAssignmentDueDate(term.startsAt, term).valid).toBe(true);
    expect(validateAssignmentDueDate(term.endsAt, term).valid).toBe(true);
  });

  it("flags weights that do not sum to 1, and tolerates binary floating point", () => {
    expect(validateGradingPeriodWeights([{ name: "Q1", weight: 0.5 }, { name: "Q2", weight: 0.4 }]).valid).toBe(false);
    expect(validateGradingPeriodWeights([{ name: "Q1", weight: 0.5 }, { name: "Q2", weight: 0.5 }]).valid).toBe(true);

    // 0.3 + 0.3 + 0.4 is 0.9999999999999999 in IEEE 754. Reporting that as a
    // user error would be reporting a fault in binary floating point as a fault
    // in someone's arithmetic.
    expect(
      validateGradingPeriodWeights([
        { name: "Q1", weight: 0.3 },
        { name: "Q2", weight: 0.3 },
        { name: "Q3", weight: 0.4 }
      ]).valid
    ).toBe(true);

    // No periods at all is not a misconfiguration — it is an unweighted term.
    expect(validateGradingPeriodWeights([]).valid).toBe(true);
  });
});

describe("weighted grade averages", () => {
  const weights = new Map([["q1", 0.5], ["q2", 0.5]]);

  it("weights periods equally regardless of how many points each holds", () => {
    // Q1: one 10-point quiz, full marks. Q2: one 200-point exam, half marks.
    // Flat: 110/210 = 52.4%. Weighted: (100 + 50) / 2 = 75%.
    const summary = calculateWeightedGradeSummary(
      [
        { score: 10, pointsPossible: 10, status: "Graded", gradingPeriodId: "q1" },
        { score: 100, pointsPossible: 200, status: "Graded", gradingPeriodId: "q2" }
      ],
      weights
    );

    expect(summary.average).toBeCloseTo(52.38, 1);
    expect(summary.weightedAverage).toBeCloseTo(75, 5);
  });

  it("redistributes the weight of a period with no scored work", () => {
    // Q2 has not started. A student who has done everything asked of them so
    // far must not see a failing grade for a term that has not happened.
    const summary = calculateWeightedGradeSummary(
      [{ score: 9, pointsPossible: 10, status: "Graded", gradingPeriodId: "q1" }],
      weights
    );

    expect(summary.weightedAverage).toBeCloseTo(90, 5);
  });

  it("falls back to the flat average when no weights are supplied", () => {
    const scores = [{ score: 8, pointsPossible: 10, status: "Graded", gradingPeriodId: "q1" }];
    const summary = calculateWeightedGradeSummary(scores, new Map());

    expect(summary.weightedAverage).toBe(summary.average);
    expect(summary.periods).toEqual([]);
  });

  it("reports unweighted work rather than dropping it", () => {
    // Assignment.gradingPeriodId is optional, so this is a real state and not a
    // defensive branch. The work must be visible in the breakdown.
    const summary = calculateWeightedGradeSummary(
      [
        { score: 10, pointsPossible: 10, status: "Graded", gradingPeriodId: "q1" },
        { score: 0, pointsPossible: 10, status: "Graded", gradingPeriodId: null }
      ],
      weights
    );

    expect(summary.weightedAverage).toBeCloseTo(100, 5);
    expect(summary.average).toBeCloseTo(50, 5);
    expect(summary.periods.find((period) => period.gradingPeriodId === "")).toMatchObject({ weight: 0, average: 0 });
  });
});

describe("guardian records", () => {
  it("splits a full name on the last space, so multi-word first names survive", () => {
    expect(splitGuardianName("Denise Johnson")).toEqual({ firstName: "Denise", lastName: "Johnson" });
    expect(splitGuardianName("Maria de la Cruz")).toEqual({ firstName: "Maria de la", lastName: "Cruz" });
    expect(splitGuardianName("  Harper   Brooks  ")).toEqual({ firstName: "Harper", lastName: "Brooks" });
  });

  it("leaves a one-word name's surname blank rather than duplicating it", () => {
    // Visibly incomplete beats confidently wrong: the guardian panel shows both
    // fields, so a blank is something a human can notice and fix. "Cher Cher"
    // looks like data.
    expect(splitGuardianName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitGuardianName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("treats email as a case-insensitive identity", () => {
    expect(normalizeGuardianEmail("  Denise.Johnson@Guardian.Example ")).toBe("denise.johnson@guardian.example");
  });

  it("refuses to unlink a student's only guardian", () => {
    const refused = decideGuardianUnlink({ linkCount: 1 });
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toContain("only guardian");

    expect(decideGuardianUnlink({ linkCount: 2 }).allowed).toBe(true);
    // Defensive: a count of 0 should not read as "fine to delete another".
    expect(decideGuardianUnlink({ linkCount: 0 }).allowed).toBe(false);
  });
});

describe("log retention", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("refuses 0 days, which reads like a no-op and means delete everything", () => {
    const decision = decideLogRetention(0, now);

    expect(decision.valid).toBe(false);
    expect(decision.reason).toContain("at least 1 day");
    expect(decision.cutoff).toBeUndefined();
  });

  it("refuses fractional and non-finite windows", () => {
    expect(decideLogRetention(1.5, now).valid).toBe(false);
    expect(decideLogRetention(Number.NaN, now).valid).toBe(false);
    expect(decideLogRetention(Number.POSITIVE_INFINITY, now).valid).toBe(false);
  });

  it("refuses more than a year", () => {
    expect(decideLogRetention(366, now).valid).toBe(false);
    expect(decideLogRetention(365, now).valid).toBe(true);
  });

  it("computes the cutoff by subtracting whole days from the supplied clock", () => {
    const decision = decideLogRetention(30, now);

    expect(decision.valid).toBe(true);
    expect(decision.cutoff?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });
});
