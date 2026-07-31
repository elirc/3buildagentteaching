import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { agentRegistry } from "./registry";
import { confidenceFromSubagents } from "./helpers";
import { evaluateFixture, type AgentFixture, type FixtureAssertion } from "./evaluation";
import {
  assignmentFeedbackAgent,
  atRiskStudentDetectionAgent,
  attendanceAnomalyAgent,
  gradingConsistencyAgent,
  guardianCommunicationDraftAgent,
  studentProgressSummaryAgent,
  studentSuccessReviewAgent,
  teacherWorkloadInsightAgent,
  termPostmortemAgent
} from "./index";

/**
 * A fixed clock for every agent that takes one.
 *
 * Not `new Date()`. These tests assert on output that includes a follow-up
 * date; with a live clock they would pass today and fail tomorrow, which is
 * precisely the flakiness US-19's clock injection exists to remove.
 */
const FIXED_NOW = new Date("2026-10-13T00:00:00.000Z");

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
      recentSupportNotes: [],
      now: FIXED_NOW
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
      recentSupportNotes: [],
      now: FIXED_NOW
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
      recentSupportNotes: [],
      now: FIXED_NOW
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
      guardianDigestOptIn: true,
      now: FIXED_NOW
    });

    expect(result.output.needsHumanApproval).toBe(true);
    expect(result.output.subagentSummaries).toHaveLength(3);
  });
});

describe("term postmortem agent", () => {
  const analysis = (overrides: Partial<Parameters<typeof termPostmortemAgent.run>[0]["analysis"]> = {}) => ({
    sectionHighlights: [
      { sectionId: "section_algebra_a", headline: "MATH-101: class average 64%", average: 64 },
      { sectionId: "section_biology_a", headline: "SCI-110: class average 82%", average: 82 }
    ],
    sectionsNeedingReview: [{ sectionId: "section_algebra_a", reason: "class average 64% is at or below 70%" }],
    interventionEffectiveness: { completed: 1, abandoned: 1, stillActive: 2 },
    staffingObservations: [],
    dataQualityIssues: ["4 submission(s) are ungraded at term end."],
    recommendationAcceptanceRate: 0.5,
    totalUngraded: 4,
    riskCounts: { Low: 20, Medium: 8, High: 3, Critical: 1 },
    ...overrides
  });

  it("blocks the seeded Fall 2026 shape and names the section and the ungraded work", () => {
    const result = termPostmortemAgent.run({
      termName: "Fall 2026",
      termStatus: "Active",
      analysis: analysis(),
      now: FIXED_NOW
    });

    // Blocked, not NeedsWork: ungraded work means the grades are not final.
    expect(result.output.nextTermReadiness).toBe("Blocked");
    expect(result.output.sectionsNeedingReview[0]?.sectionId).toBe("section_algebra_a");
    expect(result.output.dataQualityIssues.join(" ")).toContain("ungraded");
    expect(result.output.recommendationsForNextTerm[0]).toContain("ungraded");
  });

  it("drops confidence below 60 for a term with almost nothing in it, without throwing", () => {
    const result = termPostmortemAgent.run({
      termName: "Summer 2027",
      termStatus: "Active",
      analysis: analysis({
        sectionHighlights: [{ sectionId: "s1", headline: "ART-100: no graded work", average: null }],
        sectionsNeedingReview: [],
        interventionEffectiveness: { completed: 0, abandoned: 0, stillActive: 0 },
        dataQualityIssues: [],
        recommendationAcceptanceRate: null,
        totalUngraded: 0
      }),
      now: FIXED_NOW
    });

    /*
     * An empty term is not an error — it is a term nothing happened in, and the
     * agent has to say so rather than throw. What it must not do is sound
     * certain: the confidence is what tells a reader how much was behind the
     * narrative.
     */
    expect(result.confidenceScore).toBeLessThan(60);
    expect(result.output.executiveSummary).toContain("too little activity");
    expect(result.output.nextTermReadiness).toBe("Ready");
  });

  it("routes staffing to Admin, a grading backlog to Teacher, and unresolved plans to Advisor", () => {
    const staffing = termPostmortemAgent.run({
      termName: "T", termStatus: "Active", now: FIXED_NOW,
      analysis: analysis({ staffingObservations: ["Nina Patel finished at workload score 74."] })
    });
    const backlog = termPostmortemAgent.run({
      termName: "T", termStatus: "Active", now: FIXED_NOW,
      analysis: analysis({ staffingObservations: [], totalUngraded: 4, interventionEffectiveness: { completed: 0, abandoned: 0, stillActive: 0 } })
    });
    const plans = termPostmortemAgent.run({
      termName: "T", termStatus: "Active", now: FIXED_NOW,
      analysis: analysis({ staffingObservations: [], totalUngraded: 0, dataQualityIssues: [], interventionEffectiveness: { completed: 0, abandoned: 0, stillActive: 2 } })
    });

    // The owner is the field that routes work into a queue. Prose about who
    // should act is not routing — the same lesson the at-risk agent learned.
    expect(staffing.recommendations[0]?.owner).toBe("Admin");
    expect(backlog.recommendations[0]?.owner).toBe("Teacher");
    expect(plans.recommendations[0]?.owner).toBe("Advisor");
  });
});

describe("evaluateFixture", () => {
  const fixture = (assertions: FixtureAssertion[]): AgentFixture => ({ name: "test", input: {}, assertions });

  it("scores the fraction of assertions that held", () => {
    const result = evaluateFixture(
      fixture([
        { path: "riskLevel", op: "equals", value: "High" },
        { path: "riskScore", op: "greaterThan", value: 90 }
      ]),
      { riskLevel: "High", riskScore: 65 }
    );

    // 0.5 and "failed" are different facts. A harness recording only pass/fail
    // loses the difference between one assertion drifting and the agent
    // breaking outright.
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.path).toBe("riskScore");
  });

  it("supports every operator", () => {
    const actual = {
      riskLevel: "High",
      summary: "Escalate to the advisor",
      riskScore: 65,
      areas: ["Grades", "Attendance"],
      nested: { deep: { value: 3 } }
    };

    const passing = evaluateFixture(
      fixture([
        { path: "riskLevel", op: "equals", value: "High" },
        { path: "summary", op: "contains", value: "advisor" },
        { path: "riskScore", op: "lessThan", value: 80 },
        { path: "riskScore", op: "greaterThan", value: 60 },
        { path: "areas", op: "arrayIncludes", value: "Attendance" },
        { path: "areas", op: "length", value: 2 },
        { path: "nested.deep.value", op: "equals", value: 3 },
        { path: "areas[0]", op: "equals", value: "Grades" }
      ]),
      actual
    );

    expect(passing.failures).toEqual([]);
    expect(passing.passed).toBe(true);
  });

  it("reports a missing field as a failed assertion rather than throwing", () => {
    /*
     * The important behaviour for a harness: an agent that stops producing a
     * field must fail that one fixture, not crash the run and take the other
     * twenty-six results with it.
     */
    const result = evaluateFixture(fixture([{ path: "gone.entirely", op: "equals", value: 1 }]), { present: true });

    expect(result.passed).toBe(false);
    expect(result.failures[0]?.actual).toBeUndefined();
  });

  it("fails type-mismatched comparisons instead of coercing", () => {
    // "65" > 60 is true in JavaScript and meaningless here. A string where a
    // number belongs is a real difference worth reporting.
    const result = evaluateFixture(fixture([{ path: "score", op: "greaterThan", value: 60 }]), { score: "65" });

    expect(result.passed).toBe(false);
    expect(result.failures[0]?.reason).toContain("not a number");
  });

  it("passes a fixture with no assertions, and scores it 1", () => {
    // Worth pinning: it asserts nothing, so there is nothing to fail — but
    // writing one buys no coverage, which the test name says out loud.
    expect(evaluateFixture(fixture([]), {})).toMatchObject({ passed: true, score: 1 });
  });
});

describe("agents are deterministic", () => {
  /*
   * A repo-wide scan, not a per-agent review. The rule is easy to state and
   * easy to break by accident — a `new Date()` added inside an agent looks
   * harmless and makes every fixture comparing against a recorded date fail on
   * the next calendar day. Teams then conclude their eval suite is flaky and
   * stop trusting it, which is a much more expensive outcome than a red test.
   *
   * The pattern is `new Date()` with no arguments specifically.
   * `new Date(now.getTime())` is deterministic given `now` and is how the
   * clock-injected helper builds its result, so banning the constructor
   * outright would ban the fix as well as the bug.
   */
  const sourceFiles = readdirSync(__dirname)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ file, contents: readFileSync(resolve(__dirname, file), "utf8") }));

  it("has source files to scan", () => {
    // Guards the guard: a scan over an empty list passes for the wrong reason.
    expect(sourceFiles.length).toBeGreaterThan(8);
  });

  it("reads no wall clock", () => {
    const offenders = sourceFiles
      .filter(({ contents }) => /new Date\(\s*\)|Date\.now\(/.test(stripComments(contents)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("uses no randomness", () => {
    const offenders = sourceFiles
      .filter(({ contents }) => /Math\.random\(/.test(stripComments(contents)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("produces identical output for identical input", () => {
    // The property all of the above exist to protect, asserted directly.
    const input = {
      studentName: "Maya Johnson",
      gradeSummary: {
        average: 56, earnedPoints: 112, possiblePoints: 200, missingCount: 4,
        lateCount: 2, gradedCount: 5, trend: "Declining" as const, performanceBand: "AtRisk" as const
      },
      attendanceSummary: {
        present: 10, absent: 5, tardy: 2, excused: 1, issuePoints: 7,
        attendanceRate: 61, concernLevel: "Concern" as const, longestAbsenceStreak: 2
      },
      interventionHistory: [],
      recentSupportNotes: [],
      now: new Date("2026-10-13T00:00:00.000Z")
    };

    expect(atRiskStudentDetectionAgent.run(input).output).toEqual(atRiskStudentDetectionAgent.run(input).output);
  });
});

/** Comments legitimately mention the banned patterns while explaining them. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("confidenceFromSubagents", () => {
  it("penalises a parent whose weakest child was unsure", () => {
    const shaky = confidenceFromSubagents(80, [40, 90, 85]);
    const solid = confidenceFromSubagents(80, [85, 90, 88]);

    expect(shaky).toBeLessThan(solid);
    // Materially below, not a rounding difference: half the gap to the weakest.
    expect(solid - shaky).toBeGreaterThanOrEqual(15);
  });

  it("uses the weakest child, not the average", () => {
    /*
     * Same mean (75), very different worst case. Averaging would score these
     * identically and let two confident children hide the one that had almost
     * no data — which is the one that should make a reader cautious.
     */
    const oneWeak = confidenceFromSubagents(90, [45, 90, 90]);
    const allMiddling = confidenceFromSubagents(90, [75, 75, 75]);

    expect(oneWeak).toBeLessThan(allMiddling);
  });

  it("never raises confidence above the parent's own", () => {
    // A sub-agent being certain is not evidence that the synthesis above it is
    // right, so confident children buy nothing.
    expect(confidenceFromSubagents(60, [100, 100, 100])).toBe(60);
    expect(confidenceFromSubagents(60, [60])).toBe(60);
  });

  it("is unchanged when there are no children", () => {
    expect(confidenceFromSubagents(72, [])).toBe(72);
  });

  it("stays inside 0..100", () => {
    expect(confidenceFromSubagents(10, [0])).toBeGreaterThanOrEqual(0);
    expect(confidenceFromSubagents(100, [100])).toBeLessThanOrEqual(100);
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
