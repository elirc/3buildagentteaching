import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysAgo(days: number): Date {
  const date = new Date("2026-05-21T12:00:00.000Z");
  date.setDate(date.getDate() - days);
  return date;
}

function daysFrom(days: number): Date {
  const date = new Date("2026-05-21T12:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date;
}

function fingerprint(service: string, level: string, message: string): string {
  return createHash("sha1")
    .update(`${service}:${level}:${message.toLowerCase().replace(/\d+/g, "{n}")}`)
    .digest("hex")
    .slice(0, 12);
}

async function main() {
  await prisma.auditEvent.deleteMany();
  await prisma.agentRecommendation.deleteMany();
  await prisma.agentEvaluation.deleteMany();
  await prisma.agentManifest.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.workerLock.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.structuredLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.interventionApproval.deleteMany();
  await prisma.interventionPlan.deleteMany();
  await prisma.supportNote.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.submissionCriterionScore.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.rubricCriterion.deleteMany();
  await prisma.rubric.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classSection.deleteMany();
  await prisma.gradingPeriod.deleteMany();
  await prisma.academicTerm.deleteMany();
  await prisma.course.deleteMany();
  await prisma.studentGuardian.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: "user_admin", name: "Avery Chen", email: "admin@northstar.example", role: "Admin" },
      { id: "user_manager", name: "Sam Rivera", email: "manager@northstar.example", role: "SchoolManager" },
      { id: "user_advisor", name: "Jordan Ellis", email: "advisor@northstar.example", role: "Advisor" },
      { id: "user_teacher_algebra", name: "Nina Patel", email: "nina.patel@northstar.example", role: "Teacher" },
      { id: "user_teacher_biology", name: "Marcus Green", email: "marcus.green@northstar.example", role: "Teacher" },
      { id: "user_teacher_english", name: "Elena Moore", email: "elena.moore@northstar.example", role: "Teacher" },
      { id: "user_student_maya", name: "Maya Johnson", email: "maya.johnson@student.example", role: "Student" },
      { id: "user_student_liam", name: "Liam Brooks", email: "liam.brooks@student.example", role: "Student" },
      { id: "user_student_sophia", name: "Sophia Nguyen", email: "sophia.nguyen@student.example", role: "Student" },
      { id: "user_guardian", name: "Denise Johnson", email: "denise.johnson@guardian.example", role: "Guardian" },
      { id: "user_guardian_harper", name: "Harper Brooks", email: "harper.brooks@guardian.example", role: "Guardian" },
      { id: "user_guardian_minh", name: "Minh Nguyen", email: "minh.nguyen@guardian.example", role: "Guardian" },
      { id: "user_viewer", name: "Operations Viewer", email: "viewer@northstar.example", role: "Viewer" }
    ]
  });

  await prisma.teacher.createMany({
    data: [
      {
        id: "teacher_algebra",
        userId: "user_teacher_algebra",
        firstName: "Nina",
        lastName: "Patel",
        email: "nina.patel@northstar.example",
        department: "Mathematics",
        employmentStatus: "Active",
        subjectsTaught: ["Algebra", "Geometry"],
        officeLocation: "Room 214"
      },
      {
        id: "teacher_biology",
        userId: "user_teacher_biology",
        firstName: "Marcus",
        lastName: "Green",
        email: "marcus.green@northstar.example",
        department: "Science",
        employmentStatus: "Active",
        subjectsTaught: ["Biology", "Environmental Science"],
        officeLocation: "Lab 3"
      },
      {
        id: "teacher_english",
        userId: "user_teacher_english",
        firstName: "Elena",
        lastName: "Moore",
        email: "elena.moore@northstar.example",
        department: "Humanities",
        employmentStatus: "Active",
        subjectsTaught: ["English Literature", "Composition"],
        officeLocation: "Room 108"
      }
    ]
  });

  await prisma.student.createMany({
    data: [
      {
        id: "student_maya",
        userId: "user_student_maya",
        firstName: "Maya",
        lastName: "Johnson",
        email: "maya.johnson@student.example",
        gradeLevel: 9,
        enrollmentStatus: "Probation",
        studentNumber: "NS-1001",
        advisorId: "user_advisor"
      },
      {
        id: "student_liam",
        userId: "user_student_liam",
        firstName: "Liam",
        lastName: "Brooks",
        email: "liam.brooks@student.example",
        gradeLevel: 9,
        enrollmentStatus: "Active",
        studentNumber: "NS-1002",
        advisorId: "user_advisor"
      },
      {
        id: "student_sophia",
        userId: "user_student_sophia",
        firstName: "Sophia",
        lastName: "Nguyen",
        email: "sophia.nguyen@student.example",
        gradeLevel: 10,
        enrollmentStatus: "Active",
        studentNumber: "NS-1003",
        advisorId: "user_advisor"
      },
      {
        id: "student_noah",
        firstName: "Noah",
        lastName: "Singh",
        email: "noah.singh@student.example",
        gradeLevel: 9,
        enrollmentStatus: "Active",
        studentNumber: "NS-1004",
        advisorId: "user_advisor"
      }
    ]
  });

  await prisma.guardian.createMany({
    data: [
      {
        id: "guardian_maya_denise",
        userId: "user_guardian",
        firstName: "Denise",
        lastName: "Johnson",
        email: "denise.johnson@guardian.example",
        phone: "555-0101"
      },
      {
        id: "guardian_liam_harper",
        userId: "user_guardian_harper",
        firstName: "Harper",
        lastName: "Brooks",
        email: "harper.brooks@guardian.example",
        phone: "555-0102"
      },
      {
        id: "guardian_sophia_minh",
        userId: "user_guardian_minh",
        firstName: "Minh",
        lastName: "Nguyen",
        email: "minh.nguyen@guardian.example",
        phone: "555-0103"
      },
      {
        id: "guardian_noah_priya",
        firstName: "Priya",
        lastName: "Singh",
        email: "priya.singh@guardian.example",
        phone: "555-0104"
      }
    ]
  });

  await prisma.studentGuardian.createMany({
    data: [
      { id: "student_guardian_maya", studentId: "student_maya", guardianId: "guardian_maya_denise", relationship: "Mother", isPrimary: true, receivesDigest: true, emergencyContact: true },
      { id: "student_guardian_liam", studentId: "student_liam", guardianId: "guardian_liam_harper", relationship: "Guardian", isPrimary: true, receivesDigest: true, emergencyContact: true },
      { id: "student_guardian_sophia", studentId: "student_sophia", guardianId: "guardian_sophia_minh", relationship: "Father", isPrimary: true, receivesDigest: false, emergencyContact: true },
      { id: "student_guardian_noah", studentId: "student_noah", guardianId: "guardian_noah_priya", relationship: "Mother", isPrimary: true, receivesDigest: true, emergencyContact: true }
    ]
  });

  await prisma.course.createMany({
    data: [
      { id: "course_algebra", code: "MATH-091", title: "Algebra I", description: "Linear equations, functions, and foundational algebraic reasoning.", subject: "Mathematics", gradeLevel: 9, creditHours: 1, status: "Active" },
      { id: "course_biology", code: "SCI-101", title: "Biology", description: "Cell biology, genetics, ecology, and scientific reasoning.", subject: "Science", gradeLevel: 9, creditHours: 1, status: "Active" },
      { id: "course_english", code: "ENG-109", title: "English Literature", description: "Close reading, literary analysis, and composition.", subject: "Humanities", gradeLevel: 9, creditHours: 1, status: "Active" },
      { id: "course_geometry", code: "MATH-201", title: "Geometry", description: "Proofs, congruence, similarity, and spatial reasoning.", subject: "Mathematics", gradeLevel: 10, creditHours: 1, status: "Draft" }
    ]
  });

  await prisma.academicTerm.createMany({
    data: [
      { id: "term_fall_2026", name: "Fall 2026", status: "Active", startsAt: new Date("2026-08-17T00:00:00.000Z"), endsAt: new Date("2026-12-18T00:00:00.000Z") },
      { id: "term_spring_2027", name: "Spring 2027", status: "Planned", startsAt: new Date("2027-01-12T00:00:00.000Z"), endsAt: new Date("2027-05-28T00:00:00.000Z") }
    ]
  });

  await prisma.gradingPeriod.createMany({
    data: [
      { id: "grading_fall_q1", academicTermId: "term_fall_2026", name: "Fall Q1", startsAt: new Date("2026-08-17T00:00:00.000Z"), endsAt: new Date("2026-10-16T00:00:00.000Z"), weight: 0.5 },
      { id: "grading_fall_q2", academicTermId: "term_fall_2026", name: "Fall Q2", startsAt: new Date("2026-10-19T00:00:00.000Z"), endsAt: new Date("2026-12-18T00:00:00.000Z"), weight: 0.5 }
    ]
  });

  await prisma.classSection.createMany({
    data: [
      {
        id: "section_algebra_a",
        courseId: "course_algebra",
        teacherId: "teacher_algebra",
        academicTermId: "term_fall_2026",
        room: "214",
        schedule: { days: ["Mon", "Wed", "Fri"], start: "09:00", end: "09:55" },
        capacity: 3,
        status: "Active"
      },
      {
        id: "section_biology_a",
        courseId: "course_biology",
        teacherId: "teacher_biology",
        academicTermId: "term_fall_2026",
        room: "Lab 3",
        schedule: { days: ["Tue", "Thu"], start: "10:10", end: "11:30" },
        capacity: 28,
        status: "Active"
      },
      {
        id: "section_english_a",
        courseId: "course_english",
        teacherId: "teacher_english",
        academicTermId: "term_fall_2026",
        room: "108",
        schedule: { days: ["Mon", "Wed"], start: "13:00", end: "14:20" },
        capacity: 30,
        status: "Active"
      }
    ]
  });

  await prisma.enrollment.createMany({
    data: [
      { id: "enroll_maya_algebra", studentId: "student_maya", classSectionId: "section_algebra_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_maya_biology", studentId: "student_maya", classSectionId: "section_biology_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_maya_english", studentId: "student_maya", classSectionId: "section_english_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_liam_algebra", studentId: "student_liam", classSectionId: "section_algebra_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_sophia_algebra", studentId: "student_sophia", classSectionId: "section_algebra_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_noah_algebra_waitlist", studentId: "student_noah", classSectionId: "section_algebra_a", status: "Waitlisted", enrolledAt: daysAgo(5) },
      { id: "enroll_liam_biology", studentId: "student_liam", classSectionId: "section_biology_a", status: "Enrolled", enrolledAt: daysAgo(90) },
      { id: "enroll_sophia_english", studentId: "student_sophia", classSectionId: "section_english_a", status: "Enrolled", enrolledAt: daysAgo(90) }
    ]
  });

  await prisma.assignment.createMany({
    data: [
      { id: "assignment_alg_linear", classSectionId: "section_algebra_a", gradingPeriodId: "grading_fall_q1", title: "Linear Equations Practice", description: "Solve one- and two-step linear equations with written reasoning.", type: "Homework", status: "Published", dueDate: daysAgo(21), pointsPossible: 20, createdByTeacherId: "teacher_algebra" },
      { id: "assignment_alg_functions", classSectionId: "section_algebra_a", gradingPeriodId: "grading_fall_q1", title: "Functions Quiz", description: "Identify domain, range, and function notation.", type: "Quiz", status: "Published", dueDate: daysAgo(12), pointsPossible: 30, createdByTeacherId: "teacher_algebra" },
      { id: "assignment_alg_project", classSectionId: "section_algebra_a", gradingPeriodId: "grading_fall_q2", title: "Budget Model Project", description: "Create and explain a linear budget model.", type: "Project", status: "Published", dueDate: daysAgo(4), pointsPossible: 50, createdByTeacherId: "teacher_algebra" },
      { id: "assignment_alg_systems", classSectionId: "section_algebra_a", gradingPeriodId: "grading_fall_q2", title: "Systems Exit Ticket", description: "Short formative check on systems of equations.", type: "Quiz", status: "Published", dueDate: daysAgo(2), pointsPossible: 10, createdByTeacherId: "teacher_algebra" },
      { id: "assignment_bio_cells", classSectionId: "section_biology_a", gradingPeriodId: "grading_fall_q1", title: "Cell Structure Lab", description: "Diagram cell structures and explain their functions.", type: "Lab", status: "Published", dueDate: daysAgo(18), pointsPossible: 40, createdByTeacherId: "teacher_biology" },
      { id: "assignment_bio_genetics", classSectionId: "section_biology_a", gradingPeriodId: "grading_fall_q2", title: "Genetics Reflection", description: "Explain inheritance patterns using a short written response.", type: "Homework", status: "Published", dueDate: daysAgo(6), pointsPossible: 25, createdByTeacherId: "teacher_biology" },
      { id: "assignment_eng_poetry", classSectionId: "section_english_a", gradingPeriodId: "grading_fall_q2", title: "Poetry Close Reading", description: "Annotate a poem and write an evidence-based paragraph.", type: "Discussion", status: "Published", dueDate: daysAgo(7), pointsPossible: 25, createdByTeacherId: "teacher_english" }
    ]
  });

  await prisma.rubric.create({
    data: {
      id: "rubric_budget_model",
      assignmentId: "assignment_alg_project",
      title: "Budget Model Project Rubric",
      description: "Scores mathematical model, reasoning, completeness, and reflection.",
      createdByTeacherId: "teacher_algebra",
      criteria: {
        create: [
          { id: "criterion_model_accuracy", title: "Model Accuracy", description: "Linear model uses correct variables, equation, and units.", pointsPossible: 20, sortOrder: 1 },
          { id: "criterion_reasoning", title: "Reasoning", description: "Explanation connects model choices to the scenario.", pointsPossible: 15, sortOrder: 2 },
          { id: "criterion_completeness", title: "Completeness", description: "Project includes all required sections and calculations.", pointsPossible: 10, sortOrder: 3 },
          { id: "criterion_reflection", title: "Reflection", description: "Student identifies limitations and next steps.", pointsPossible: 5, sortOrder: 4 }
        ]
      }
    }
  });

  await prisma.submission.createMany({
    data: [
      { id: "sub_maya_linear", assignmentId: "assignment_alg_linear", studentId: "student_maya", status: "Graded", submittedAt: daysAgo(21), contentText: "Solved equations with partial work shown.", score: 13, feedback: "Needs cleaner inverse-operation steps.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(19) },
      { id: "sub_maya_functions", assignmentId: "assignment_alg_functions", studentId: "student_maya", status: "Graded", submittedAt: daysAgo(13), contentText: "Quiz answers submitted.", score: 16, feedback: "Review domain/range and notation.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(10) },
      { id: "sub_maya_project", assignmentId: "assignment_alg_project", studentId: "student_maya", status: "Missing", submittedAt: null, contentText: null, score: null, feedback: null },
      { id: "sub_maya_systems", assignmentId: "assignment_alg_systems", studentId: "student_maya", status: "Missing", submittedAt: null, contentText: null, score: null, feedback: null },
      { id: "sub_liam_linear", assignmentId: "assignment_alg_linear", studentId: "student_liam", status: "Graded", submittedAt: daysAgo(21), contentText: "Complete work with checking step.", score: 19, feedback: "Strong work.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(19) },
      { id: "sub_liam_functions", assignmentId: "assignment_alg_functions", studentId: "student_liam", status: "Submitted", submittedAt: daysAgo(12), contentText: "Quiz answers awaiting grade.", score: null },
      { id: "sub_liam_project", assignmentId: "assignment_alg_project", studentId: "student_liam", status: "Graded", submittedAt: daysAgo(4), contentText: "Budget model with equation, graph, and reflection.", score: 46, feedback: "Strong model with clear reflection.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(2) },
      { id: "sub_sophia_linear", assignmentId: "assignment_alg_linear", studentId: "student_sophia", status: "Graded", submittedAt: daysAgo(21), contentText: "Mostly complete.", score: 17, feedback: "Good progress.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(19) },
      { id: "sub_sophia_functions", assignmentId: "assignment_alg_functions", studentId: "student_sophia", status: "Submitted", submittedAt: daysAgo(12), contentText: "Quiz answers awaiting grade.", score: null },
      { id: "sub_sophia_project", assignmentId: "assignment_alg_project", studentId: "student_sophia", status: "Graded", submittedAt: daysAgo(5), contentText: "Budget model with partial reflection.", score: 40, feedback: "Good calculations; improve reflection.", gradedByTeacherId: "teacher_algebra", gradedAt: daysAgo(2) },
      { id: "sub_maya_cells", assignmentId: "assignment_bio_cells", studentId: "student_maya", status: "Graded", submittedAt: daysAgo(18), contentText: "Cell diagram with organelle functions and reflection.", score: 30, feedback: "Improving accuracy.", gradedByTeacherId: "teacher_biology", gradedAt: daysAgo(16) },
      { id: "sub_maya_genetics", assignmentId: "assignment_bio_genetics", studentId: "student_maya", status: "Graded", submittedAt: daysAgo(6), contentText: "Reflection includes vocabulary and example cross.", score: 23, feedback: "Clear improvement.", gradedByTeacherId: "teacher_biology", gradedAt: daysAgo(4) },
      { id: "sub_maya_poetry", assignmentId: "assignment_eng_poetry", studentId: "student_maya", status: "Late", submittedAt: daysAgo(5), contentText: "Paragraph submitted late with evidence.", score: null }
    ]
  });

  await prisma.submissionCriterionScore.createMany({
    data: [
      { id: "score_maya_model_accuracy", submissionId: "sub_maya_project", criterionId: "criterion_model_accuracy", score: 0, feedback: "Missing submission prevents scoring." },
      { id: "score_maya_reasoning", submissionId: "sub_maya_project", criterionId: "criterion_reasoning", score: 0, feedback: "No reasoning evidence submitted." },
      { id: "score_liam_model_accuracy", submissionId: "sub_liam_project", criterionId: "criterion_model_accuracy", score: 19, feedback: "Strong equation setup." },
      { id: "score_liam_reasoning", submissionId: "sub_liam_project", criterionId: "criterion_reasoning", score: 14, feedback: "Clear explanation of assumptions." },
      { id: "score_liam_completeness", submissionId: "sub_liam_project", criterionId: "criterion_completeness", score: 9, feedback: "All required sections present." },
      { id: "score_liam_reflection", submissionId: "sub_liam_project", criterionId: "criterion_reflection", score: 4, feedback: "Useful reflection." },
      { id: "score_sophia_model_accuracy", submissionId: "sub_sophia_project", criterionId: "criterion_model_accuracy", score: 17, feedback: "Mostly correct model setup." },
      { id: "score_sophia_reasoning", submissionId: "sub_sophia_project", criterionId: "criterion_reasoning", score: 12, feedback: "Reasoning is present but light." },
      { id: "score_sophia_completeness", submissionId: "sub_sophia_project", criterionId: "criterion_completeness", score: 8, feedback: "Complete core sections." },
      { id: "score_sophia_reflection", submissionId: "sub_sophia_project", criterionId: "criterion_reflection", score: 3, feedback: "Reflection needs more specificity." }
    ]
  });

  const attendanceDates = [14, 12, 10, 8, 6, 4, 2];
  await prisma.attendanceRecord.createMany({
    data: [
      ...attendanceDates.map((days, index) => ({
        id: `att_maya_alg_${index}`,
        studentId: "student_maya",
        classSectionId: "section_algebra_a",
        academicTermId: "term_fall_2026",
        date: daysAgo(days),
        status: index >= 2 && index <= 6 ? "Absent" as const : "Present" as const,
        notes: index >= 2 ? "Unexcused absence in recent streak." : null,
        recordedByTeacherId: "teacher_algebra"
      })),
      { id: "att_maya_bio_1", studentId: "student_maya", classSectionId: "section_biology_a", academicTermId: "term_fall_2026", date: daysAgo(12), status: "Present", notes: null, recordedByTeacherId: "teacher_biology" },
      { id: "att_maya_bio_2", studentId: "student_maya", classSectionId: "section_biology_a", academicTermId: "term_fall_2026", date: daysAgo(5), status: "Present", notes: null, recordedByTeacherId: "teacher_biology" },
      { id: "att_liam_alg_1", studentId: "student_liam", classSectionId: "section_algebra_a", academicTermId: "term_fall_2026", date: daysAgo(2), status: "Present", notes: null, recordedByTeacherId: "teacher_algebra" },
      { id: "att_sophia_alg_1", studentId: "student_sophia", classSectionId: "section_algebra_a", academicTermId: "term_fall_2026", date: daysAgo(2), status: "Tardy", notes: "Arrived 12 minutes late.", recordedByTeacherId: "teacher_algebra" }
    ]
  });

  await prisma.supportNote.createMany({
    data: [
      { id: "note_maya_academic", studentId: "student_maya", authorUserId: "user_teacher_algebra", visibility: "Shared", noteType: "Academic", content: "Maya understands steps after reteach but is missing multiple Algebra tasks." },
      { id: "note_maya_attendance", studentId: "student_maya", authorUserId: "user_advisor", visibility: "Shared", noteType: "Attendance", content: "Guardian outreach attempted after sudden absence pattern." },
      { id: "note_maya_family", studentId: "student_maya", authorUserId: "user_advisor", visibility: "AdvisorOnly", noteType: "FamilyCommunication", content: "Guardian requested weekly progress digest." }
    ]
  });

  await prisma.interventionPlan.create({
    data: {
      id: "plan_maya_algebra",
      studentId: "student_maya",
      createdByUserId: "user_advisor",
      status: "Active",
      riskArea: "Grades",
      summary: "Targeted Algebra intervention for missing work recovery and attendance follow-up.",
      recommendedActions: ["Teacher check-in twice weekly", "Advisor guardian call", "Submit two missing assignments by Friday"],
      followUpDate: daysFrom(7)
    }
  });

  await prisma.interventionApproval.create({
    data: {
      id: "approval_maya_algebra",
      interventionPlanId: "plan_maya_algebra",
      requestedByUserId: "user_teacher_algebra",
      reviewedByUserId: "user_advisor",
      status: "Approved",
      rationale: "Maya has combined Algebra missing work and recent attendance concerns.",
      reviewedAt: daysAgo(2)
    }
  });

  await prisma.notification.createMany({
    data: [
      {
        id: "notification_maya_guardian_digest",
        userId: "user_guardian",
        studentId: "student_maya",
        type: "InterventionUpdate",
        channel: "Digest",
        status: "Queued",
        title: "Maya Johnson weekly support update",
        body: "Draft guardian digest is queued for advisor review before delivery.",
        metadata: { interventionPlanId: "plan_maya_algebra", requiresReview: true }
      },
      {
        id: "notification_teacher_backlog",
        userId: "user_teacher_algebra",
        type: "AgentRecommendation",
        channel: "InApp",
        status: "Delivered",
        title: "Grading backlog review",
        body: "Teacher Workload Insight Agent found a grading backlog in Algebra I.",
        metadata: { teacherId: "teacher_algebra" }
      },
      {
        id: "notification_job_failure",
        userId: "user_manager",
        type: "JobFailure",
        channel: "InApp",
        status: "Delivered",
        title: "Attendance summary job failed",
        body: "Malformed payload blocked the attendance summary worker.",
        metadata: { jobId: "job_attendance_malformed" }
      }
    ]
  });

  const logs = [
    ["assignment-service", "info", "Published assignment Budget Model Project for section_algebra_a", "Assignment", "assignment_alg_project"],
    ["gradebook", "warn", "Grade calculation skipped missing score for sub_maya_project", "Submission", "sub_maya_project"],
    ["attendance-sync", "error", "Attendance summary failed: malformed payload for student_maya", "Student", "student_maya"],
    ["enrollment", "warn", "Capacity conflict: section_algebra_a is full, waitlisting student_noah", "ClassSection", "section_algebra_a"],
    ["rbac", "error", "Permission denied: Viewer attempted to grade submission sub_maya_linear", "Submission", "sub_maya_linear"],
    ["notifications", "error", "Guardian digest delivery timeout for denise.johnson@guardian.example", "Student", "student_maya"],
    ["database", "fatal", "Database timeout while loading gradebook section_algebra_a", "ClassSection", "section_algebra_a"],
    ["jobs", "error", "Background job report generation timeout after 30000ms", "Job", "job_report_timeout"],
    ["agents", "info", "At-Risk Student Detection Agent completed for student_maya", "Student", "student_maya"]
  ] as const;

  await prisma.structuredLog.createMany({
    data: logs.map(([service, level, message, entityType, entityId], index) => ({
      id: `log_${index + 1}`,
      timestamp: daysAgo(index),
      service,
      environment: "development",
      level,
      message,
      requestId: `req_${1000 + index}`,
      userId: index % 2 === 0 ? "user_admin" : "user_teacher_algebra",
      entityType,
      entityId,
      metadata: { seedScenario: true, index },
      fingerprint: fingerprint(service, level, message)
    }))
  });

  /*
   * Job payloads are now parsed by packages/application/src/jobs/schemas.ts.
   * The three jobs seeded as failures carry genuinely invalid payloads, so they
   * fail because the schema rejects them rather than because a hardcoded string
   * matcher said so:
   *   job_grade_invalid        assignmentId: null      -> both keys missing
   *   job_attendance_malformed range: "{bad-json"      -> not a date range
   *   job_guardian_timeout     guardianEmail bad       -> not an email
   */
  await prisma.backgroundJob.createMany({
    data: [
      { id: "job_guardian_timeout", type: "GuardianDigest", status: "Failed", attempts: 2, maxAttempts: 3, payload: { studentId: "student_maya", guardianEmail: "not-an-email" }, errorMessage: "Email provider timeout", idempotencyKey: "digest:student_maya:week_2026_21", startedAt: daysAgo(1), finishedAt: daysAgo(1), relatedStudentId: "student_maya" },
      { id: "job_grade_invalid", type: "GradeRecalculation", status: "Failed", attempts: 1, maxAttempts: 3, payload: { assignmentId: null }, errorMessage: "Invalid grade recalculation payload", idempotencyKey: "grade:null", startedAt: daysAgo(2), finishedAt: daysAgo(2), relatedClassSectionId: "section_algebra_a" },
      { id: "job_attendance_malformed", type: "AttendanceSummary", status: "Failed", attempts: 3, maxAttempts: 3, payload: { range: "{bad-json", studentId: "student_maya" }, errorMessage: "Malformed JSON in attendance summary payload", idempotencyKey: "attendance:student_maya:bad", startedAt: daysAgo(3), finishedAt: daysAgo(3), relatedStudentId: "student_maya" },
      { id: "job_report_timeout", type: "ReportGeneration", status: "Retrying", attempts: 2, maxAttempts: 4, payload: { report: "weekly-risk", sectionId: "section_algebra_a" }, errorMessage: "Report generation timeout", idempotencyKey: "report:weekly-risk:section_algebra_a", startedAt: daysAgo(1), nextRunAt: daysAgo(0), relatedClassSectionId: "section_algebra_a" },
      { id: "job_permission", type: "EnrollmentSync", status: "DeadLettered", attempts: 3, maxAttempts: 3, payload: { sectionId: "section_algebra_a" }, errorMessage: "Permission denied for enrollment sync", idempotencyKey: "enrollment-sync:section_algebra_a", startedAt: daysAgo(5), finishedAt: daysAgo(5), relatedClassSectionId: "section_algebra_a" },
      { id: "job_digest_success", type: "GuardianDigest", status: "Succeeded", attempts: 1, maxAttempts: 3, payload: { studentId: "student_liam" }, idempotencyKey: "digest:student_liam:week_2026_21", startedAt: daysAgo(1), finishedAt: daysAgo(1), relatedStudentId: "student_liam" },
      { id: "job_notification_queued", type: "EmailNotification", status: "Queued", attempts: 0, maxAttempts: 3, payload: { notificationId: "notification_maya_guardian_digest", recipient: "denise.johnson@guardian.example" }, idempotencyKey: "email:notification_maya_guardian_digest", scheduledFor: daysAgo(0), nextRunAt: daysAgo(0), relatedStudentId: "student_maya" },
      { id: "job_agent_review_queued", type: "AgentRun", status: "Queued", attempts: 0, maxAttempts: 2, payload: { agentType: "StudentSuccessReview", targetId: "student_maya" }, idempotencyKey: "agent:student-success:student_maya", scheduledFor: daysAgo(0), nextRunAt: daysAgo(0), relatedStudentId: "student_maya" }
    ]
  });

  await prisma.agentManifest.createMany({
    data: [
      {
        id: "manifest_student_progress_v1",
        agentType: "StudentProgressSummary",
        version: "1.0.0",
        name: "Student Progress Summary Agent",
        description: "Summarizes grades, attendance, missing work, support notes, and interventions.",
        supportedTargets: ["Student"],
        requiredPermissions: ["agent:run"],
        inputSchema: { version: "1.0.0", required: ["studentProfile", "recentGrades", "attendanceRecords"] },
        outputSchema: { version: "1.0.0", required: ["academicSummary", "recommendedNextActions"] },
        isActive: true
      },
      {
        id: "manifest_guardian_draft_v1",
        agentType: "GuardianCommunicationDraft",
        version: "1.0.0",
        name: "Guardian Communication Draft Agent",
        description: "Creates a human-reviewable guardian outreach draft without sending messages.",
        supportedTargets: ["Student"],
        requiredPermissions: ["agent:run", "notification:manage"],
        inputSchema: { version: "1.0.0", required: ["studentName", "guardianName", "gradeSummary"] },
        outputSchema: { version: "1.0.0", required: ["subject", "draftBody", "requiredHumanReview"] },
        isActive: true
      },
      {
        id: "manifest_grading_consistency_v1",
        agentType: "GradingConsistency",
        version: "1.0.0",
        name: "Grading Consistency Agent",
        description: "Detects outlier scores and feedback/rubric coverage gaps.",
        supportedTargets: ["Assignment"],
        requiredPermissions: ["agent:run"],
        inputSchema: { version: "1.0.0", required: ["assignment", "submissions"] },
        outputSchema: { version: "1.0.0", required: ["consistencyScore", "recommendedTeacherActions"] },
        isActive: true
      },
      {
        id: "manifest_success_review_v1",
        agentType: "StudentSuccessReview",
        version: "1.0.0",
        name: "Student Success Review Agent",
        description: "Orchestrates prior agent outputs into a reviewable student success plan.",
        supportedTargets: ["Student"],
        requiredPermissions: ["agent:run", "agentRecommendation:decide"],
        inputSchema: { version: "1.0.0", required: ["progress", "risk", "attendance"] },
        outputSchema: { version: "1.0.0", required: ["executiveSummary", "recommendedPlan", "needsHumanApproval"] },
        isActive: true
      }
    ]
  });

  await prisma.agentRun.createMany({
    data: [
      {
        id: "agent_run_maya_risk",
        agentType: "AtRiskStudentDetection",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Student",
        targetId: "student_maya",
        inputSnapshot: { studentId: "student_maya", gradeAverage: 56, absences: 5, missingAssignments: 4 },
        output: { riskScore: 73, riskLevel: "High", recommendedIntervention: "Advisor follow-up and Algebra recovery plan" },
        confidenceScore: 84,
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
        createdByUserId: "user_advisor",
        trace: [{ step: "risk-score", detail: "Grades + attendance + missing work created high risk." }]
      },
      {
        id: "agent_run_maya_progress",
        agentType: "StudentProgressSummary",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Student",
        targetId: "student_maya",
        inputSnapshot: { studentId: "student_maya", courses: ["Algebra I", "Biology", "English Literature"] },
        output: { academicSummary: "Maya is improving in Biology but declining in Algebra.", interventionRecommended: true },
        confidenceScore: 81,
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
        createdByUserId: "user_teacher_algebra",
        trace: [{ step: "summary", detail: "Compared grades, attendance, and support notes." }]
      },
      {
        id: "agent_run_teacher_workload",
        agentType: "TeacherWorkloadInsight",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Teacher",
        targetId: "teacher_algebra",
        inputSnapshot: { teacherId: "teacher_algebra", activeSections: 1, ungradedSubmissions: 4, highRiskStudents: 1 },
        output: { workloadScore: 66, workloadSummary: "Heavy workload due to grading backlog and risk support." },
        confidenceScore: 86,
        startedAt: daysAgo(2),
        completedAt: daysAgo(2),
        createdByUserId: "user_manager",
        trace: [{ step: "workload-score", detail: "Calculated from sections, roster, backlog, and risk load." }]
      },
      {
        id: "agent_run_guardian_draft",
        agentType: "GuardianCommunicationDraft",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Student",
        targetId: "student_maya",
        inputSnapshot: { studentId: "student_maya", guardianEmail: "denise.johnson@guardian.example", reason: "GradeConcern" },
        output: { subject: "Maya Johnson: support follow-up", requiredHumanReview: true, tone: "Urgent" },
        confidenceScore: 78,
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
        createdByUserId: "user_advisor",
        trace: [{ step: "human-review", detail: "Guardian draft requires approval before send." }]
      },
      {
        id: "agent_run_grading_consistency",
        agentType: "GradingConsistency",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Assignment",
        targetId: "assignment_alg_project",
        inputSnapshot: { assignmentId: "assignment_alg_project", submissions: 3 },
        output: { consistencyScore: 72, outlierStudentIds: ["student_maya"], feedbackCoverageSummary: "67% of submissions include teacher feedback." },
        confidenceScore: 79,
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
        createdByUserId: "user_teacher_algebra",
        trace: [{ step: "outliers", detail: "Missing project submission created a score outlier." }]
      },
      {
        id: "agent_run_success_review",
        agentType: "StudentSuccessReview",
        status: "Succeeded",
        agentVersion: "1.0.0",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        targetType: "Student",
        targetId: "student_maya",
        inputSnapshot: { studentId: "student_maya", subagents: ["StudentProgressSummary", "AtRiskStudentDetection", "AttendanceAnomaly"] },
        output: { executiveSummary: "Maya needs coordinated Algebra, attendance, and guardian follow-up.", needsHumanApproval: true },
        confidenceScore: 80,
        startedAt: daysAgo(0),
        completedAt: daysAgo(0),
        createdByUserId: "user_advisor",
        trace: [{ step: "orchestration", detail: "Combined progress, risk, and attendance agent outputs." }]
      }
    ]
  });

  await prisma.agentRecommendation.createMany({
    data: [
      {
        id: "recommendation_maya_advisor_followup",
        agentRunId: "agent_run_success_review",
        status: "Proposed",
        ownerRole: "Advisor",
        action: "Hold a student success review and update Maya's Algebra intervention plan.",
        priority: 3,
        rationale: "Combined grade, attendance, and missing work signals remain high."
      },
      {
        id: "recommendation_guardian_review",
        agentRunId: "agent_run_guardian_draft",
        status: "Approved",
        ownerRole: "Advisor",
        action: "Review and send the guardian communication draft.",
        priority: 2,
        rationale: "Guardian requested weekly progress digest.",
        approvedByUserId: "user_advisor",
        decidedAt: daysAgo(0)
      },
      {
        id: "recommendation_grading_review",
        agentRunId: "agent_run_grading_consistency",
        status: "Proposed",
        ownerRole: "Teacher",
        action: "Review Budget Model Project scoring outliers before grade return.",
        priority: 2,
        rationale: "Missing and scored submissions have large score spread."
      }
    ]
  });

  await prisma.agentEvaluation.createMany({
    data: [
      {
        id: "eval_guardian_draft_maya",
        agentType: "GuardianCommunicationDraft",
        version: "1.0.0",
        fixtureName: "maya-grade-concern",
        passed: true,
        score: 0.92,
        expectedOutput: { requiredHumanReview: true, tone: "Urgent" },
        actualOutput: { requiredHumanReview: true, tone: "Urgent" }
      },
      {
        id: "eval_grading_consistency_project",
        agentType: "GradingConsistency",
        version: "1.0.0",
        fixtureName: "budget-project-outlier",
        passed: true,
        score: 0.88,
        expectedOutput: { detectsOutlier: true },
        actualOutput: { outlierStudentIds: ["student_maya"] }
      },
      {
        id: "eval_success_review_missing_attendance",
        agentType: "StudentSuccessReview",
        version: "1.0.0",
        fixtureName: "missing-attendance-confidence",
        passed: false,
        score: 0.64,
        expectedOutput: { confidenceBelow: 75 },
        actualOutput: { confidenceScore: 80 }
      }
    ]
  });

  await prisma.auditEvent.createMany({
    data: [
      { id: "audit_teacher_updated", actorUserId: "user_manager", action: "teacher.updated", entityType: "Teacher", entityId: "teacher_algebra", before: { officeLocation: "Room 210" }, after: { officeLocation: "Room 214" }, metadata: { seed: true }, createdAt: daysAgo(9) },
      { id: "audit_assignment_published", actorUserId: "user_teacher_algebra", action: "assignment.published", entityType: "Assignment", entityId: "assignment_alg_project", before: { status: "Draft" }, after: { status: "Published" }, metadata: { seed: true }, createdAt: daysAgo(5) },
      { id: "audit_submission_graded", actorUserId: "user_teacher_algebra", action: "submission.graded", entityType: "Submission", entityId: "sub_maya_functions", before: { score: null }, after: { score: 16 }, metadata: { seed: true }, createdAt: daysAgo(10) },
      { id: "audit_attendance_recorded", actorUserId: "user_teacher_algebra", action: "attendance.recorded", entityType: "AttendanceRecord", entityId: "att_maya_alg_6", before: Prisma.JsonNull, after: { status: "Absent" }, metadata: { seed: true }, createdAt: daysAgo(2) },
      { id: "audit_intervention_created", actorUserId: "user_advisor", action: "intervention.created", entityType: "InterventionPlan", entityId: "plan_maya_algebra", before: Prisma.JsonNull, after: { status: "Active", riskArea: "Grades" }, metadata: { seed: true }, createdAt: daysAgo(3) },
      { id: "audit_agent_completed", actorUserId: "user_advisor", action: "agent.completed", entityType: "AgentRun", entityId: "agent_run_maya_risk", before: { status: "Running" }, after: { status: "Succeeded" }, metadata: { seed: true }, createdAt: daysAgo(1) },
      { id: "audit_guardian_linked", actorUserId: "user_manager", action: "studentGuardian.linked", entityType: "StudentGuardian", entityId: "student_guardian_maya", before: Prisma.JsonNull, after: { studentId: "student_maya", guardianId: "guardian_maya_denise" }, metadata: { seed: true }, createdAt: daysAgo(6) },
      { id: "audit_rubric_created", actorUserId: "user_teacher_algebra", action: "rubric.created", entityType: "Rubric", entityId: "rubric_budget_model", before: Prisma.JsonNull, after: { criteria: 4 }, metadata: { seed: true }, createdAt: daysAgo(8) },
      { id: "audit_recommendation_proposed", actorUserId: "user_advisor", action: "agentRecommendation.proposed", entityType: "AgentRecommendation", entityId: "recommendation_maya_advisor_followup", before: Prisma.JsonNull, after: { status: "Proposed" }, metadata: { seed: true }, createdAt: daysAgo(0) }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seeded Agentic Education Ops demo data.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
