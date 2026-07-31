import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { agentRegistry } from "./registry";
import {
  assignmentFeedbackAgent,
  atRiskStudentDetectionAgent,
  attendanceAnomalyAgent,
  gradingConsistencyAgent,
  guardianCommunicationDraftAgent,
  studentProgressSummaryAgent,
  studentSuccessReviewAgent,
  teacherWorkloadInsightAgent
} from "./index";

describe("mock agent heuristics", () => {
  it("student progress agent recommends intervention for Maya-like data", () => {
    const result = studentProgressSummaryAgent.run({
      studentProfile: { id: "student_maya", firstName: "Maya", lastName: "Johnson", enrollmentStatus: "Probation", gradeLevel: 9 },
      activeEnrollments: [{ sectionName: "MATH-091 Fall 2026", courseTitle: "Algebra I" }],
      recentGrades: [
        { score: 13, pointsPossible: 20, status: "Graded", gradedAt: new Date("2026-01-01") },
        { score: 16, pointsPossible: 30, status: "Graded", gradedAt: new Date("2026-01-02") },
        { score: null, pointsPossible: 50, status: "Missing", gradedAt: null },
        { score: null, pointsPossible: 10, status: "Missing", gradedAt: null }
      ],
      missingAssignments: 4,
      lateAssignments: 1,
      attendanceRecords: [
        { status: "Absent", date: new Date("2026-01-01") },
        { status: "Absent", date: new Date("2026-01-02") },
        { status: "Absent", date: new Date("2026-01-03") },
        { status: "Absent", date: new Date("2026-01-04") },
        { status: "Absent", date: new Date("2026-01-05") }
      ],
      supportNotes: [{ noteType: "Academic", content: "Missing Algebra work." }],
      activeInterventionPlans: []
    });

    expect(result.output.interventionRecommended).toBe(true);
    expect(result.output.recommendedOwner).toBe("Advisor");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("at-risk agent avoids duplicate plan language when active intervention exists", () => {
    const result = atRiskStudentDetectionAgent.run({
      studentName: "Maya Johnson",
      gradeSummary: {
        average: 62,
        earnedPoints: 62,
        possiblePoints: 100,
        missingCount: 4,
        lateCount: 0,
        gradedCount: 3,
        trend: "Declining",
        performanceBand: "AtRisk"
      },
      attendanceSummary: {
        present: 5,
        absent: 5,
        tardy: 0,
        excused: 0,
        issuePoints: 5,
        attendanceRate: 50,
        concernLevel: "Concern",
        longestAbsenceStreak: 3
      },
      interventionHistory: [{ status: "Active", riskArea: "Grades", summary: "Algebra plan" }],
      recentSupportNotes: []
    });

    expect(result.output.recommendedIntervention).toContain("active intervention");
    expect(result.output.riskLevel).toMatch(/High|Critical/);
  });

  it("routes a Critical student to Admin, not Advisor", () => {
    // The output text already said "escalate to school manager and advisor" for
    // Critical, while ownerRole — the field that actually decides whose queue
    // it lands in — said Advisor. Escalation that does not change the owner is
    // not escalation.
    const critical = atRiskStudentDetectionAgent.run({
      studentName: "Maya Johnson",
      gradeSummary: {
        average: 41,
        earnedPoints: 41,
        possiblePoints: 100,
        missingCount: 6,
        lateCount: 2,
        gradedCount: 4,
        trend: "Declining",
        performanceBand: "AtRisk"
      },
      attendanceSummary: {
        present: 1,
        absent: 9,
        tardy: 2,
        excused: 0,
        issuePoints: 10,
        attendanceRate: 8,
        concernLevel: "Severe",
        longestAbsenceStreak: 6
      },
      interventionHistory: [],
      recentSupportNotes: []
    });

    expect(critical.output.riskLevel).toBe("Critical");
    expect(critical.recommendations[0]?.owner).toBe("Admin");
    expect(critical.recommendations[0]?.priority).toBe("high");
  });

  it("still routes a High student to Advisor and a Low student to Teacher", () => {
    // Guard against over-correcting: only Critical moved.
    const high = atRiskStudentDetectionAgent.run({
      studentName: "Liam",
      // Scored deliberately, not guessed: base 10 + 25 (average < 70)
      // + 20 (missing > 3) + 12 (issuePoints >= 3) = 67, which lands in High
      // (60-79). An earlier version of this fixture used 5 absences and a
      // declining trend and totalled 95 — Critical — which would have made the
      // test assert the opposite of its own name.
      gradeSummary: {
        average: 62, earnedPoints: 62, possiblePoints: 100, missingCount: 4,
        lateCount: 0, gradedCount: 4, trend: "Stable", performanceBand: "AtRisk"
      },
      attendanceSummary: {
        present: 8, absent: 2, tardy: 2, excused: 0, issuePoints: 3,
        attendanceRate: 66, concernLevel: "Watch", longestAbsenceStreak: 1
      },
      interventionHistory: [],
      recentSupportNotes: []
    });
    expect(high.output.riskLevel).toBe("High");
    expect(high.recommendations[0]?.owner).toBe("Advisor");
  });

  it("assignment feedback agent flags incomplete late work", () => {
    const result = assignmentFeedbackAgent.run({
      assignment: { title: "Budget Model Project", type: "Project", dueDate: new Date("2026-01-10"), pointsPossible: 50 },
      submission: { status: "Late", submittedAt: new Date("2026-01-12"), contentText: "", score: 20 },
      rubricFields: ["reasoning", "evidence"]
    });

    expect(result.output.lateSubmissionNote).not.toBeNull();
    expect(result.output.missingCriteria).toHaveLength(2);
    expect(result.findings.some((finding) => finding.title === "Incomplete work")).toBe(true);
  });

  it("attendance anomaly agent detects absence streaks", () => {
    const result = attendanceAnomalyAgent.run({
      targetName: "Maya Johnson",
      targetType: "Student",
      dateRangeLabel: "recent records",
      historicalAverageIssuePoints: 1,
      records: [
        { status: "Absent", date: new Date("2026-01-01") },
        { status: "Absent", date: new Date("2026-01-02") },
        { status: "Absent", date: new Date("2026-01-03") }
      ]
    });

    expect(result.output.anomalyType).toBe("AbsenceStreak");
    expect(result.output.advisorFollowUpRecommended).toBe(true);
  });

  it("teacher workload agent flags heavy grading load", () => {
    const result = teacherWorkloadInsightAgent.run({
      teacherProfile: { id: "teacher_algebra", name: "Nina Patel", employmentStatus: "Active" },
      activeSectionCount: 4,
      studentCount: 115,
      activeAssignmentCount: 12,
      ungradedSubmissionCount: 35,
      highRiskStudentCount: 6,
      recentSupportNoteCount: 7,
      failedJobCount: 1
    });

    expect(result.output.workloadScore).toBeGreaterThanOrEqual(80);
    expect(result.output.recommendedAdministrativeAction).toContain("Rebalance");
  });

  it("guardian communication draft agent produces review-gated outreach", () => {
    const result = guardianCommunicationDraftAgent.run({
      studentName: "Maya Johnson",
      guardianName: "Denise Johnson",
      guardianEmail: "denise.johnson@guardian.example",
      communicationReason: "GradeConcern",
      gradeSummary: {
        average: 58,
        earnedPoints: 58,
        possiblePoints: 100,
        missingCount: 4,
        lateCount: 1,
        gradedCount: 3,
        trend: "Declining",
        performanceBand: "AtRisk"
      },
      attendanceSummary: {
        present: 5,
        absent: 5,
        tardy: 0,
        excused: 0,
        issuePoints: 5,
        attendanceRate: 50,
        concernLevel: "Concern",
        longestAbsenceStreak: 3
      },
      missingAssignmentCount: 4,
      activeInterventionSummary: "Algebra recovery plan",
      teacherNotes: [{ noteType: "Academic", content: "Missing Algebra work." }]
    });

    expect(result.output.requiredHumanReview).toBe(true);
    expect(result.output.tone).toBe("Urgent");
    expect(result.output.draftBody).toContain("Maya Johnson");
  });

  it("grading consistency agent detects score and feedback gaps", () => {
    const result = gradingConsistencyAgent.run({
      assignment: { id: "assignment_alg_project", title: "Budget Model Project", type: "Project", pointsPossible: 50 },
      submissions: [
        { studentId: "student_maya", status: "Graded", score: 18, feedback: "" },
        { studentId: "student_liam", status: "Graded", score: 48, feedback: "Strong model." },
        { studentId: "student_sophia", status: "Graded", score: 45, feedback: null }
      ]
    });

    expect(result.output.outlierStudentIds).toContain("student_maya");
    expect(result.output.consistencyScore).toBeLessThan(90);
  });

  it("student success review orchestrates subagent outputs into a plan", () => {
    const result = studentSuccessReviewAgent.run({
      studentName: "Maya Johnson",
      progress: {
        academicSummary: "Maya is improving in Biology but declining in Algebra.",
        strengths: ["Biology improvement"],
        concerns: ["Algebra missing work"],
        gradeTrend: "Declining",
        attendanceTrend: "Concern",
        missingWorkSummary: "4 missing assignments",
        recommendedNextActions: ["Advisor follow-up"],
        recommendedOwner: "Advisor",
        interventionRecommended: true
      },
      risk: {
        riskScore: 76,
        riskLevel: "High",
        primaryRiskAreas: ["Grades", "Attendance"],
        evidence: ["Grade average below threshold"],
        recommendedIntervention: "Update active Algebra intervention.",
        suggestedFollowUpDate: "2026-05-28",
        escalationRecommendation: "Assign advisor follow-up this week."
      },
      attendance: {
        anomalyScore: 70,
        anomalyType: "AbsenceStreak",
        affectedTarget: "Maya Johnson",
        evidence: ["Three absences in a row"],
        suspectedCauseCategory: "AcademicEngagement",
        recommendedNextAction: "Advisor follow-up",
        advisorFollowUpRecommended: true
      },
      activeInterventions: [{ riskArea: "Grades", summary: "Algebra plan" }],
      guardianDigestOptIn: true
    });

    expect(result.output.needsHumanApproval).toBe(true);
    expect(result.output.subagentSummaries).toHaveLength(3);
  });
});

describe("registry and manifests cannot drift", () => {
  /*
   * The code side is exhaustive by construction: agentRegistry is declared
   * `satisfies Record<AgentType, AgentDefinition>`, so adding an AgentType
   * without an implementation does not compile.
   *
   * The *data* side has no such protection. AgentManifest rows are seeded, and
   * as of US-17 an agent with no active manifest refuses to run. So an agent
   * can be perfectly implemented, fully typed, and dead in production because
   * nobody added a row. This test reads the seed file and asserts the two sides
   * agree — the cheapest available stand-in for a constraint the database
   * cannot express.
   */
  const seed = readFileSync(resolve(__dirname, "../../db/prisma/seed.ts"), "utf8");

  it("seeds an active manifest for every registered agent", () => {
    const missing = Object.keys(agentRegistry).filter(
      (agentType) => !new RegExp(`agentType:\\s*"${agentType}"`).test(seed)
    );

    expect(missing).toEqual([]);
  });

  it("seeds no manifest for an agent that does not exist", () => {
    const seeded = [...seed.matchAll(/agentType:\s*"(\w+)",\s*\n\s*version:/g)].map((match) => match[1]);
    const known = new Set(Object.keys(agentRegistry));

    expect(seeded.filter((agentType) => agentType && !known.has(agentType))).toEqual([]);
  });
});
