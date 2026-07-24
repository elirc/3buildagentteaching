"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  academicOperationsService,
  academicService,
  agentOperationsService,
  agentRunService,
  assignmentService,
  attendanceService,
  enrollmentService,
  jobService,
  studentService,
  supportService,
  teacherService,
  workerService
} from "@agentic-edu/application";
import {
  assignmentSchema,
  attendanceSchema,
  classSectionSchema,
  courseSchema,
  interventionPlanSchema,
  studentSchema,
  supportNoteSchema,
  teacherSchema
} from "@agentic-edu/domain";
import { getCurrentActor } from "@/lib/current-user";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalString(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value.length > 0 ? value : null;
}

function numberValue(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createTeacher(formData: FormData) {
  const actor = await getCurrentActor();
  const teacher = await teacherService.createTeacher(actor, parseTeacher(formData));
  revalidatePath("/teachers");
  redirect(`/teachers/${teacher.id}`);
}

export async function updateTeacher(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await teacherService.updateTeacher(actor, id, parseTeacher(formData));
  revalidatePath(`/teachers/${id}`);
  redirect(`/teachers/${id}`);
}

export async function createStudent(formData: FormData) {
  const actor = await getCurrentActor();
  const student = await studentService.createStudent(actor, parseStudent(formData));
  revalidatePath("/students");
  redirect(`/students/${student.id}`);
}

export async function updateStudent(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await studentService.updateStudent(actor, id, parseStudent(formData));
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function createCourse(formData: FormData) {
  const actor = await getCurrentActor();
  const course = await academicService.createCourse(actor, parseCourse(formData));
  revalidatePath("/courses");
  redirect(`/courses/${course.id}`);
}

export async function updateCourse(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await academicService.updateCourse(actor, id, parseCourse(formData));
  revalidatePath(`/courses/${id}`);
  redirect(`/courses/${id}`);
}

export async function createSection(formData: FormData) {
  const actor = await getCurrentActor();
  const section = await academicService.createSection(actor, parseSection(formData));
  revalidatePath("/sections");
  redirect(`/sections/${section.id}`);
}

export async function updateSection(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await academicService.updateSection(actor, id, parseSection(formData));
  revalidatePath(`/sections/${id}`);
  redirect(`/sections/${id}`);
}

export async function enrollStudent(formData: FormData) {
  const actor = await getCurrentActor();
  const enrollment = await enrollmentService.enrollStudent(actor, {
    studentId: stringValue(formData, "studentId"),
    classSectionId: stringValue(formData, "classSectionId"),
    allowWaitlist: formData.get("allowWaitlist") === "on"
  });
  revalidatePath("/enrollments");
  revalidatePath(`/sections/${enrollment.classSectionId}`);
  redirect(`/sections/${enrollment.classSectionId}/roster`);
}

export async function dropEnrollment(formData: FormData) {
  const actor = await getCurrentActor();
  await enrollmentService.dropEnrollment(actor, stringValue(formData, "id"));
  revalidatePath("/enrollments");
}

export async function createAssignment(formData: FormData) {
  const actor = await getCurrentActor();
  const assignment = await assignmentService.createAssignment(actor, parseAssignment(formData));
  revalidatePath("/assignments");
  redirect(`/assignments/${assignment.id}`);
}

export async function updateAssignment(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await assignmentService.updateAssignment(actor, id, parseAssignment(formData));
  revalidatePath(`/assignments/${id}`);
  redirect(`/assignments/${id}`);
}

export async function publishAssignment(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await assignmentService.publishAssignment(actor, id);
  revalidatePath(`/assignments/${id}`);
}

export async function gradeSubmission(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await assignmentService.gradeSubmission(actor, {
    id,
    score: Number(formData.get("score")),
    feedback: stringValue(formData, "feedback"),
    gradedByTeacherId: stringValue(formData, "gradedByTeacherId")
  });
  revalidatePath(`/submissions/${id}`);
}

export async function createSubmission(formData: FormData) {
  const actor = await getCurrentActor();
  const submission = await assignmentService.submitAssignment(actor, {
    assignmentId: stringValue(formData, "assignmentId"),
    studentId: stringValue(formData, "studentId"),
    contentText: stringValue(formData, "contentText"),
    attachmentUrl: optionalString(formData, "attachmentUrl")
  });
  revalidatePath(`/assignments/${submission.assignmentId}`);
  redirect(`/submissions/${submission.id}`);
}

export async function recordAttendance(formData: FormData) {
  const actor = await getCurrentActor();
  await attendanceService.recordAttendance(
    actor,
    attendanceSchema.parse({
      studentId: stringValue(formData, "studentId"),
      classSectionId: stringValue(formData, "classSectionId"),
      academicTermId: optionalString(formData, "academicTermId"),
      date: stringValue(formData, "date"),
      status: stringValue(formData, "status"),
      notes: optionalString(formData, "notes"),
      recordedByTeacherId: stringValue(formData, "recordedByTeacherId")
    })
  );
  revalidatePath("/attendance");
}

export async function createSupportNote(formData: FormData) {
  const actor = await getCurrentActor();
  const input = supportNoteSchema.parse({
    studentId: stringValue(formData, "studentId"),
    authorUserId: actor.id,
    visibility: stringValue(formData, "visibility"),
    noteType: stringValue(formData, "noteType"),
    content: stringValue(formData, "content")
  });
  await supportService.createSupportNote(actor, input);
  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/interventions");
}

export async function createInterventionPlan(formData: FormData) {
  const actor = await getCurrentActor();
  const input = interventionPlanSchema.parse({
    studentId: stringValue(formData, "studentId"),
    createdByUserId: actor.id,
    status: stringValue(formData, "status"),
    riskArea: stringValue(formData, "riskArea"),
    summary: stringValue(formData, "summary"),
    recommendedActions: splitList(stringValue(formData, "recommendedActions")),
    followUpDate: stringValue(formData, "followUpDate")
  });
  await supportService.createInterventionPlan(actor, input);
  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/interventions");
  redirect(`/students/${input.studentId}`);
}

export async function updateInterventionStatus(formData: FormData) {
  const actor = await getCurrentActor();
  const plan = await supportService.updateInterventionStatus(actor, stringValue(formData, "id"), stringValue(formData, "status") as never);
  revalidatePath("/interventions");
  revalidatePath(`/students/${plan.studentId}`);
}

export async function retryBackgroundJob(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await jobService.retryBackgroundJob(actor, id);
  revalidatePath(`/jobs/${id}`);
}

export async function deadLetterBackgroundJob(formData: FormData) {
  const actor = await getCurrentActor();
  const id = stringValue(formData, "id");
  await jobService.deadLetterBackgroundJob(actor, id);
  revalidatePath(`/jobs/${id}`);
}

export async function runStudentProgressAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const studentId = stringValue(formData, "studentId");
  await agentRunService.runStudentProgressAgent(actor, studentId);
  revalidatePath(`/students/${studentId}`);
}

export async function runAtRiskAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const studentId = stringValue(formData, "studentId");
  await agentRunService.runAtRiskAgent(actor, studentId);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/at-risk");
}

export async function runAssignmentFeedbackAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const submissionId = stringValue(formData, "submissionId");
  await agentRunService.runAssignmentFeedbackAgent(actor, submissionId);
  revalidatePath(`/submissions/${submissionId}`);
}

export async function runAttendanceAnomalyAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const targetType = stringValue(formData, "targetType") as "Student" | "ClassSection";
  const targetId = stringValue(formData, "targetId");
  await agentRunService.runAttendanceAnomalyAgent(actor, { targetType, targetId });
  revalidatePath("/attendance");
  if (targetType === "Student") revalidatePath(`/students/${targetId}`);
}

export async function runTeacherWorkloadAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const teacherId = stringValue(formData, "teacherId");
  await agentRunService.runTeacherWorkloadAgent(actor, teacherId);
  revalidatePath(`/teachers/${teacherId}`);
}

export async function runFailedJobInvestigationAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const jobId = stringValue(formData, "jobId");
  await agentRunService.runFailedJobInvestigationAgent(actor, jobId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function createAcademicTerm(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.createAcademicTerm(actor, {
    name: stringValue(formData, "name"),
    status: stringValue(formData, "status") as never,
    startsAt: new Date(stringValue(formData, "startsAt")),
    endsAt: new Date(stringValue(formData, "endsAt"))
  });
  revalidatePath("/terms");
}

export async function createGradingPeriod(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.createGradingPeriod(actor, {
    academicTermId: stringValue(formData, "academicTermId"),
    name: stringValue(formData, "name"),
    startsAt: new Date(stringValue(formData, "startsAt")),
    endsAt: new Date(stringValue(formData, "endsAt")),
    weight: Number(formData.get("weight") ?? 1)
  });
  revalidatePath("/terms");
}

export async function createGuardian(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.createGuardian(actor, {
    userId: optionalString(formData, "userId"),
    firstName: stringValue(formData, "firstName"),
    lastName: stringValue(formData, "lastName"),
    email: stringValue(formData, "email"),
    phone: optionalString(formData, "phone")
  });
  revalidatePath("/guardians");
}

export async function linkGuardianToStudent(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.linkGuardianToStudent(actor, {
    studentId: stringValue(formData, "studentId"),
    guardianId: stringValue(formData, "guardianId"),
    relationship: stringValue(formData, "relationship") as never,
    isPrimary: formData.get("isPrimary") === "on",
    receivesDigest: formData.get("receivesDigest") === "on",
    emergencyContact: formData.get("emergencyContact") === "on"
  });
  revalidatePath("/guardians");
}

export async function createRubric(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.createRubric(actor, {
    assignmentId: optionalString(formData, "assignmentId"),
    title: stringValue(formData, "title"),
    description: optionalString(formData, "description"),
    createdByTeacherId: stringValue(formData, "createdByTeacherId"),
    criteria: splitList(stringValue(formData, "criteria")).map((title, index) => ({
      title,
      description: `${title} criterion`,
      pointsPossible: Number(formData.get(`points_${index}`) ?? 10),
      sortOrder: index + 1
    }))
  });
  revalidatePath("/rubrics");
}

export async function markNotificationRead(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.markNotificationRead(actor, stringValue(formData, "id"));
  revalidatePath("/notifications");
}

export async function requestInterventionApproval(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.requestInterventionApproval(actor, stringValue(formData, "interventionPlanId"));
  revalidatePath("/approvals");
  revalidatePath("/interventions");
}

export async function decideInterventionApproval(formData: FormData) {
  const actor = await getCurrentActor();
  await academicOperationsService.decideInterventionApproval(
    actor,
    stringValue(formData, "id"),
    stringValue(formData, "status") as never,
    optionalString(formData, "rationale")
  );
  revalidatePath("/approvals");
}

export async function runGuardianCommunicationDraftAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const studentId = stringValue(formData, "studentId");
  await agentRunService.runGuardianCommunicationDraftAgent(actor, studentId);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/agent-ops");
}

export async function runGradingConsistencyAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const assignmentId = stringValue(formData, "assignmentId");
  await agentRunService.runGradingConsistencyAgent(actor, assignmentId);
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/agent-ops");
}

export async function runStudentSuccessReviewAgent(formData: FormData) {
  const actor = await getCurrentActor();
  const studentId = stringValue(formData, "studentId");
  await agentRunService.runStudentSuccessReviewAgent(actor, studentId);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/agent-ops");
}

export async function decideAgentRecommendation(formData: FormData) {
  const actor = await getCurrentActor();
  await agentOperationsService.decideRecommendation(
    actor,
    stringValue(formData, "id"),
    stringValue(formData, "status") as never,
    optionalString(formData, "rationale")
  );
  revalidatePath("/agent-recommendations");
  revalidatePath("/agent-ops");
}

export async function runNextWorkerJob() {
  const actor = await getCurrentActor();
  await workerService.runNextJob(actor);
  revalidatePath("/worker-jobs");
  revalidatePath("/jobs");
}

function parseTeacher(formData: FormData) {
  return teacherSchema.parse({
    userId: optionalString(formData, "userId"),
    firstName: stringValue(formData, "firstName"),
    lastName: stringValue(formData, "lastName"),
    email: stringValue(formData, "email"),
    department: stringValue(formData, "department"),
    employmentStatus: stringValue(formData, "employmentStatus"),
    subjectsTaught: splitList(stringValue(formData, "subjectsTaught")),
    officeLocation: optionalString(formData, "officeLocation")
  });
}

function parseStudent(formData: FormData) {
  return studentSchema.parse({
    userId: optionalString(formData, "userId"),
    firstName: stringValue(formData, "firstName"),
    lastName: stringValue(formData, "lastName"),
    email: stringValue(formData, "email"),
    gradeLevel: numberValue(formData, "gradeLevel"),
    enrollmentStatus: stringValue(formData, "enrollmentStatus"),
    studentNumber: stringValue(formData, "studentNumber"),
    guardianName: stringValue(formData, "guardianName"),
    guardianEmail: stringValue(formData, "guardianEmail"),
    advisorId: optionalString(formData, "advisorId")
  });
}

function parseCourse(formData: FormData) {
  return courseSchema.parse({
    code: stringValue(formData, "code"),
    title: stringValue(formData, "title"),
    description: stringValue(formData, "description"),
    subject: stringValue(formData, "subject"),
    gradeLevel: numberValue(formData, "gradeLevel"),
    creditHours: Number(formData.get("creditHours")),
    status: stringValue(formData, "status")
  });
}

function parseSection(formData: FormData) {
  return classSectionSchema.parse({
    courseId: stringValue(formData, "courseId"),
    teacherId: stringValue(formData, "teacherId"),
    academicTermId: optionalString(formData, "academicTermId"),
    term: stringValue(formData, "term"),
    room: stringValue(formData, "room"),
    schedule: {
      days: splitList(stringValue(formData, "days")),
      start: stringValue(formData, "start"),
      end: stringValue(formData, "end")
    },
    capacity: numberValue(formData, "capacity"),
    status: stringValue(formData, "status")
  });
}

function parseAssignment(formData: FormData) {
  return assignmentSchema.parse({
    classSectionId: stringValue(formData, "classSectionId"),
    gradingPeriodId: optionalString(formData, "gradingPeriodId"),
    title: stringValue(formData, "title"),
    description: stringValue(formData, "description"),
    type: stringValue(formData, "type"),
    status: stringValue(formData, "status"),
    dueDate: stringValue(formData, "dueDate"),
    pointsPossible: Number(formData.get("pointsPossible")),
    createdByTeacherId: stringValue(formData, "createdByTeacherId")
  });
}
