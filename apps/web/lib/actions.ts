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
  logService,
  reportService,
  studentService,
  supportService,
  teacherService,
  workerService
} from "@agentic-edu/application";
import {
  academicTermStatusSchema,
  approvalDecisionSchema,
  assignmentSchema,
  attendanceSchema,
  attendanceStatusSchema,
  classSectionSchema,
  courseSchema,
  guardianContactSchema,
  guardianRelationshipSchema,
  interventionPlanSchema,
  interventionStatusSchema,
  logRetentionDaysSchema,
  recommendationDecisionSchema,
  reportScopeSchema,
  studentCreateSchema,
  studentSchema,
  supportNoteSchema,
  teacherSchema
} from "@agentic-edu/domain";
import { parseSheetDate } from "@agentic-edu/application";
import type { AttendanceStatus as AttendanceStatusInput } from "@agentic-edu/shared";
import { getCurrentActor } from "@/lib/current-user";
import { AppError } from "@agentic-edu/application";
import { runAction, type FormState } from "@/lib/action-result";

/*
 * Every action in this file has the same shape:
 *
 *   export async function doThing(_previous: FormState, formData: FormData) {
 *     const result = await runAction(async () => { ...work...; return value; });
 *     if (result.ok) redirect(...);          // only where a redirect is wanted
 *     return result;
 *   }
 *
 * Two conventions worth knowing before you add one:
 *
 * 1. The `_previous` first parameter is required by React's useActionState.
 *    It holds the result of the *last* submission. None of these actions need
 *    it — the form is the source of truth — so it is named with a leading
 *    underscore and ignored. It cannot be omitted; the hook always passes it.
 *
 * 2. `redirect()` is called AFTER runAction returns, never inside it.
 *    redirect works by throwing, so calling it inside the try block means the
 *    catch has to recognise and re-throw it. runAction does guard against that,
 *    but relying on the guard is fragile — keeping redirect outside means the
 *    control flow is obvious from reading the function.
 */

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

export async function createTeacher(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const teacher = await teacherService.createTeacher(actor, parseTeacher(formData));
    revalidatePath("/teachers");
    return teacher;
  });
  if (result.ok && result.data) redirect(`/teachers/${result.data.id}`);
  return result;
}

export async function updateTeacher(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const teacher = await teacherService.updateTeacher(actor, id, parseTeacher(formData));
    revalidatePath(`/teachers/${id}`);
    return teacher;
  });
  return result;
}

export async function createStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const student = await studentService.createStudent(actor, parseNewStudent(formData));
    revalidatePath("/students");
    return student;
  });
  if (result.ok && result.data) redirect(`/students/${result.data.id}`);
  return result;
}

export async function updateStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const student = await studentService.updateStudent(actor, id, parseStudent(formData));
    revalidatePath(`/students/${id}`);
    return student;
  });
}

export async function createCourse(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const course = await academicService.createCourse(actor, parseCourse(formData));
    revalidatePath("/courses");
    return course;
  });
  if (result.ok && result.data) redirect(`/courses/${result.data.id}`);
  return result;
}

export async function updateCourse(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const course = await academicService.updateCourse(actor, id, parseCourse(formData));
    revalidatePath(`/courses/${id}`);
    return course;
  });
}

export async function createSection(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const section = await academicService.createSection(actor, parseSection(formData));
    revalidatePath("/sections");
    return section;
  });
  if (result.ok && result.data) redirect(`/sections/${result.data.id}`);
  return result;
}

export async function updateSection(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const section = await academicService.updateSection(actor, id, parseSection(formData));
    revalidatePath(`/sections/${id}`);
    return section;
  });
}

export async function enrollStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const enrollment = await enrollmentService.enrollStudent(actor, {
      studentId: stringValue(formData, "studentId"),
      classSectionId: stringValue(formData, "classSectionId"),
      allowWaitlist: formData.get("allowWaitlist") === "on"
    });
    revalidatePath("/enrollments");
    revalidatePath(`/sections/${enrollment.classSectionId}`);
    return enrollment;
  });
  if (result.ok && result.data) redirect(`/sections/${result.data.classSectionId}/roster`);
  return result;
}

export async function dropEnrollment(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const enrollment = await enrollmentService.dropEnrollment(actor, stringValue(formData, "id"));
    revalidatePath("/enrollments");
    return enrollment;
  });
}

export async function promoteFromWaitlist(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const enrollment = await enrollmentService.promoteFromWaitlist(actor, stringValue(formData, "id"));
    revalidatePath(`/sections/${enrollment.classSectionId}/roster`);
    revalidatePath("/enrollments");
    return enrollment;
  });
}

export async function bulkEnroll(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const classSectionId = stringValue(formData, "classSectionId");
    // Multiple checkboxes share the name `studentIds`, so getAll is required —
    // formData.get would silently take only the first one selected.
    const studentIds = formData.getAll("studentIds").map((value) => String(value)).filter(Boolean);

    const results = await enrollmentService.bulkEnroll(actor, {
      classSectionId,
      studentIds,
      allowWaitlist: formData.get("allowWaitlist") === "on"
    });

    revalidatePath(`/sections/${classSectionId}/roster`);
    revalidatePath("/enrollments");

    /*
     * A partly-successful batch is reported as a failure so the operator sees
     * the per-student reasons. Returning ok:true with a quiet list of failures
     * would render as success and the rejected students would simply never
     * appear on the roster, with nothing to explain why.
     */
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      throw new AppError(
        "CONFLICT",
        `Enrolled ${results.length - failed.length} of ${results.length}. ` +
          failed.map((f) => `${f.studentId}: ${f.reason}`).join(" / "),
        { results }
      );
    }
    return results;
  });
}

export async function createAssignment(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const assignment = await assignmentService.createAssignment(actor, parseAssignment(formData));
    revalidatePath("/assignments");
    return assignment;
  });
  if (result.ok && result.data) redirect(`/assignments/${result.data.id}`);
  return result;
}

export async function updateAssignment(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const assignment = await assignmentService.updateAssignment(actor, id, parseAssignment(formData));
    revalidatePath(`/assignments/${id}`);
    return assignment;
  });
}

export async function publishAssignment(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const assignment = await assignmentService.publishAssignment(actor, id);
    revalidatePath(`/assignments/${id}`);
    return assignment;
  });
}

export async function gradeSubmission(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const submission = await assignmentService.gradeSubmission(actor, {
      id,
      score: numberValue(formData, "score"),
      feedback: stringValue(formData, "feedback"),
      gradedByTeacherId: stringValue(formData, "gradedByTeacherId")
    });
    revalidatePath(`/submissions/${id}`);
    return submission;
  });
}

export async function gradeSubmissionWithRubric(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const submissionId = stringValue(formData, "submissionId");

    /*
     * Criterion inputs are named `criterion_<id>` and `criterionFeedback_<id>`
     * so the form can carry a variable number of them without an index that
     * has to stay in sync with the rendered order.
     *
     * A blank score means "not scored yet", not zero. Coercing blanks to 0
     * would silently award nothing for criteria the teacher simply had not
     * reached, and the partial-save behaviour depends on telling those apart.
     */
    const scores: Array<{ criterionId: string; score: number; feedback: string | null }> = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("criterion_")) continue;
      const raw = String(value).trim();
      if (raw.length === 0) continue;
      const criterionId = key.slice("criterion_".length);
      scores.push({
        criterionId,
        score: Number(raw),
        feedback: optionalString(formData, `criterionFeedback_${criterionId}`)
      });
    }

    const result = await assignmentService.gradeSubmissionWithRubric(actor, {
      submissionId,
      gradedByTeacherId: stringValue(formData, "gradedByTeacherId"),
      feedback: stringValue(formData, "feedback"),
      scores
    });
    revalidatePath(`/submissions/${submissionId}`);
    revalidatePath("/my-work");
    return result;
  });
}

export async function createSubmission(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    const actor = await getCurrentActor();
    const submission = await assignmentService.submitAssignment(actor, {
      assignmentId: stringValue(formData, "assignmentId"),
      studentId: stringValue(formData, "studentId"),
      contentText: stringValue(formData, "contentText"),
      attachmentUrl: optionalString(formData, "attachmentUrl")
    });
    revalidatePath(`/assignments/${submission.assignmentId}`);
    return submission;
  });
  if (result.ok && result.data) redirect(`/submissions/${result.data.id}`);
  return result;
}

export async function recordAttendance(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const attendance = await attendanceService.recordAttendance(
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
    return attendance;
  });
}

export async function recordSectionAttendance(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const classSectionId = stringValue(formData, "classSectionId");
    const dateParam = stringValue(formData, "date");

    /*
     * Status inputs are radios named `status_<studentId>`. A student with no
     * radio selected is skipped rather than defaulted — an unmarked row means
     * "not recorded", and silently writing Present for it would fabricate
     * attendance data nobody entered.
     */
    const entries: Array<{ studentId: string; status: AttendanceStatusInput; notes: string | null }> = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("status_")) continue;
      const studentId = key.slice("status_".length);
      entries.push({
        studentId,
        status: attendanceStatusSchema.parse(String(value)),
        notes: optionalString(formData, `notes_${studentId}`)
      });
    }

    const saved = await attendanceService.recordSectionAttendance(actor, {
      classSectionId,
      date: parseSheetDate(dateParam),
      recordedByTeacherId: stringValue(formData, "recordedByTeacherId"),
      entries
    });

    revalidatePath(`/sections/${classSectionId}/attendance`);
    revalidatePath("/attendance");
    return saved;
  });
}

export async function createSupportNote(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const input = supportNoteSchema.parse({
      studentId: stringValue(formData, "studentId"),
      authorUserId: actor.id,
      visibility: stringValue(formData, "visibility"),
      noteType: stringValue(formData, "noteType"),
      content: stringValue(formData, "content")
    });
    const note = await supportService.createSupportNote(actor, input);
    revalidatePath(`/students/${input.studentId}`);
    revalidatePath("/interventions");
    return note;
  });
}

export async function createInterventionPlan(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await runAction(async () => {
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
    const plan = await supportService.createInterventionPlan(actor, input);
    revalidatePath(`/students/${input.studentId}`);
    revalidatePath("/interventions");
    return plan;
  });
  if (result.ok && result.data) redirect(`/students/${result.data.studentId}`);
  return result;
}

export async function updateInterventionStatus(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const status = interventionStatusSchema.parse(stringValue(formData, "status"));
    const plan = await supportService.updateInterventionStatus(actor, stringValue(formData, "id"), status);
    revalidatePath("/interventions");
    revalidatePath(`/students/${plan.studentId}`);
    return plan;
  });
}

export async function retryBackgroundJob(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const job = await jobService.retryBackgroundJob(actor, id);
    revalidatePath(`/jobs/${id}`);
    return job;
  });
}

export async function deadLetterBackgroundJob(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const id = stringValue(formData, "id");
    const job = await jobService.deadLetterBackgroundJob(actor, id);
    revalidatePath(`/jobs/${id}`);
    return job;
  });
}

export async function runStudentProgressAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const run = await agentRunService.runStudentProgressAgent(actor, studentId);
    revalidatePath(`/students/${studentId}`);
    return run;
  });
}

export async function runAtRiskAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const run = await agentRunService.runAtRiskAgent(actor, studentId);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/at-risk");
    return run;
  });
}

export async function runAssignmentFeedbackAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const submissionId = stringValue(formData, "submissionId");
    const run = await agentRunService.runAssignmentFeedbackAgent(actor, submissionId);
    revalidatePath(`/submissions/${submissionId}`);
    return run;
  });
}

export async function runAttendanceAnomalyAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    // Only two of the seven AgentTargetType values are meaningful here, so this
    // is a narrow inline union rather than a shared schema.
    const targetType = z2TargetType(stringValue(formData, "targetType"));
    const targetId = stringValue(formData, "targetId");
    const run = await agentRunService.runAttendanceAnomalyAgent(actor, { targetType, targetId });
    revalidatePath("/attendance");
    if (targetType === "Student") revalidatePath(`/students/${targetId}`);
    return run;
  });
}

export async function runTeacherWorkloadAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const teacherId = stringValue(formData, "teacherId");
    const run = await agentRunService.runTeacherWorkloadAgent(actor, teacherId);
    revalidatePath(`/teachers/${teacherId}`);
    return run;
  });
}

export async function runFailedJobInvestigationAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const jobId = stringValue(formData, "jobId");
    const run = await agentRunService.runFailedJobInvestigationAgent(actor, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return run;
  });
}

export async function createAcademicTerm(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const term = await academicOperationsService.createAcademicTerm(actor, {
      name: stringValue(formData, "name"),
      status: academicTermStatusSchema.parse(stringValue(formData, "status")),
      startsAt: new Date(stringValue(formData, "startsAt")),
      endsAt: new Date(stringValue(formData, "endsAt"))
    });
    revalidatePath("/terms");
    return term;
  });
}

export async function createGradingPeriod(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const period = await academicOperationsService.createGradingPeriod(actor, {
      academicTermId: stringValue(formData, "academicTermId"),
      name: stringValue(formData, "name"),
      startsAt: new Date(stringValue(formData, "startsAt")),
      endsAt: new Date(stringValue(formData, "endsAt")),
      weight: Number(formData.get("weight") ?? 1)
    });
    revalidatePath("/terms");
    return period;
  });
}

export async function createGuardian(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const guardian = await academicOperationsService.createGuardian(actor, {
      userId: optionalString(formData, "userId"),
      firstName: stringValue(formData, "firstName"),
      lastName: stringValue(formData, "lastName"),
      email: stringValue(formData, "email"),
      phone: optionalString(formData, "phone")
    });
    revalidatePath("/guardians");
    return guardian;
  });
}

export async function linkGuardianToStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const link = await academicOperationsService.linkGuardianToStudent(actor, {
      studentId: stringValue(formData, "studentId"),
      guardianId: stringValue(formData, "guardianId"),
      relationship: guardianRelationshipSchema.parse(stringValue(formData, "relationship")),
      isPrimary: formData.get("isPrimary") === "on",
      receivesDigest: formData.get("receivesDigest") === "on",
      emergencyContact: formData.get("emergencyContact") === "on"
    });
    revalidatePath("/guardians");
    return link;
  });
}

export async function addGuardianToStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const contact = guardianContactSchema.parse({
      name: stringValue(formData, "guardianName"),
      email: stringValue(formData, "guardianEmail")
    });
    const link = await academicOperationsService.addGuardianToStudent(actor, {
      studentId,
      name: contact.name,
      email: contact.email,
      relationship: guardianRelationshipSchema.parse(stringValue(formData, "relationship")),
      isPrimary: formData.get("isPrimary") === "on",
      receivesDigest: formData.get("receivesDigest") === "on"
    });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/guardians");
    return link;
  });
}

export async function setPrimaryGuardian(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const link = await academicOperationsService.setPrimaryGuardian(actor, stringValue(formData, "linkId"));
    revalidatePath(`/students/${link.studentId}`);
    return link;
  });
}

export async function unlinkGuardianFromStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const link = await academicOperationsService.unlinkGuardianFromStudent(actor, stringValue(formData, "linkId"));
    revalidatePath(`/students/${link.studentId}`);
    revalidatePath("/guardians");
    return link;
  });
}

export async function createRubric(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const rubric = await academicOperationsService.createRubric(actor, {
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
    return rubric;
  });
}

export async function updateGuardianPreferences(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const link = await academicOperationsService.updateGuardianPreferences(actor, {
      studentId,
      // An unchecked checkbox sends nothing at all, so absence means false.
      receivesDigest: formData.get("receivesDigest") === "on"
    });
    revalidatePath("/family");
    return link;
  });
}

export async function markNotificationRead(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const notification = await academicOperationsService.markNotificationRead(actor, stringValue(formData, "id"));
    revalidatePath("/notifications");
    return notification;
  });
}

export async function requestInterventionApproval(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const approval = await academicOperationsService.requestInterventionApproval(
      actor,
      stringValue(formData, "interventionPlanId")
    );
    revalidatePath("/approvals");
    revalidatePath("/interventions");
    return approval;
  });
}

export async function decideInterventionApproval(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const status = approvalDecisionSchema.parse(stringValue(formData, "status"));
    const approval = await academicOperationsService.decideInterventionApproval(
      actor,
      stringValue(formData, "id"),
      status,
      optionalString(formData, "rationale")
    );
    revalidatePath("/approvals");
    return approval;
  });
}

export async function runGuardianCommunicationDraftAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const run = await agentRunService.runGuardianCommunicationDraftAgent(actor, studentId);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/agent-ops");
    return run;
  });
}

export async function runGradingConsistencyAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const assignmentId = stringValue(formData, "assignmentId");
    const run = await agentRunService.runGradingConsistencyAgent(actor, assignmentId);
    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath("/agent-ops");
    return run;
  });
}

export async function runStudentSuccessReviewAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const studentId = stringValue(formData, "studentId");
    const run = await agentRunService.runStudentSuccessReviewAgent(actor, studentId);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/agent-ops");
    return run;
  });
}

export async function decideAgentRecommendation(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const status = recommendationDecisionSchema.parse(stringValue(formData, "status"));
    const recommendation = await agentOperationsService.decideRecommendation(
      actor,
      stringValue(formData, "id"),
      status,
      optionalString(formData, "rationale")
    );
    revalidatePath("/agent-recommendations");
    revalidatePath("/agent-ops");
    return recommendation;
  });
}

export async function runWorkerBatch(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const limit = Number(formData.get("limit") ?? 10);
    const processed = await workerService.runNextBatch(actor, Number.isFinite(limit) ? limit : 10);
    revalidatePath("/worker-jobs");
    revalidatePath("/jobs");
    return processed;
  });
}

/**
 * Retention control for /logs.
 *
 * `logRetentionDaysSchema` is doing real work: an empty number input arrives as
 * `""`, `Number("")` is 0, and "delete logs older than 0 days" deletes the lot.
 * Parsing before the service sees it turns that into a message on the form.
 */
export async function purgeStructuredLogs(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const days = logRetentionDaysSchema.parse(formData.get("days"));
    const result = await logService.purgeOlderThan(actor, days);
    revalidatePath("/logs");
    return result;
  });
}

/**
 * Queues a weekly risk report.
 *
 * The scope arrives as one select value ("School", "ClassSection:<id>",
 * "Advisor:<id>") rather than two coupled fields, because a scope type with the
 * wrong kind of id is not a state worth representing. Splitting on the first
 * colon keeps the pair inseparable from the form to the service.
 */
export async function generateWeeklyRiskReport(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const raw = stringValue(formData, "scope");
    const [scopeTypeRaw, scopeId] = raw.split(":");
    const scopeType = reportScopeSchema.parse(scopeTypeRaw);

    if (scopeType !== "School" && !scopeId) {
      throw new AppError("VALIDATION_ERROR", "Choose which section or advisor to report on.", { scope: raw });
    }

    const job = await reportService.requestWeeklyRiskReport(actor, {
      scopeType,
      scopeId: scopeType === "School" ? null : scopeId ?? null
    });
    revalidatePath("/reports");
    revalidatePath("/worker-jobs");
    return job;
  });
}

export async function releaseDueJobs(_previous: FormState, _formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const released = await workerService.releaseDueJobs(actor);
    revalidatePath("/worker-jobs");
    return { released };
  });
}

export async function runNextWorkerJob(_previous: FormState, _formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await getCurrentActor();
    const job = await workerService.runNextJob(actor);
    revalidatePath("/worker-jobs");
    revalidatePath("/jobs");
    // null is a legitimate result: it means the queue is empty, which is not an
    // error. The UI distinguishes "nothing to do" from "something went wrong".
    return job;
  });
}

/**
 * The attendance anomaly agent accepts only two of the seven AgentTargetType
 * values. Rather than add a schema to the domain package for a union used in
 * exactly one place, this narrows inline and throws the same shape a Zod parse
 * would — actionFailure maps it to VALIDATION_ERROR either way.
 */
function z2TargetType(value: string): "Student" | "ClassSection" {
  if (value === "Student" || value === "ClassSection") return value;
  throw Object.assign(new Error("Invalid target type"), {
    name: "ZodError",
    issues: [{ message: "Target must be a student or a class section.", path: ["targetType"] }]
  });
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

function studentFields(formData: FormData) {
  return {
    userId: optionalString(formData, "userId"),
    firstName: stringValue(formData, "firstName"),
    lastName: stringValue(formData, "lastName"),
    email: stringValue(formData, "email"),
    gradeLevel: numberValue(formData, "gradeLevel"),
    enrollmentStatus: stringValue(formData, "enrollmentStatus"),
    studentNumber: stringValue(formData, "studentNumber"),
    advisorId: optionalString(formData, "advisorId")
  };
}

function parseStudent(formData: FormData) {
  return studentSchema.parse(studentFields(formData));
}

/**
 * Create takes a guardian; update does not. See studentCreateSchema — the edit
 * form no longer carries guardian fields at all, so an edit cannot silently
 * overwrite a guardian record with whatever was in a stale form.
 */
function parseNewStudent(formData: FormData) {
  return studentCreateSchema.parse({
    ...studentFields(formData),
    primaryGuardian: {
      name: stringValue(formData, "guardianName"),
      email: stringValue(formData, "guardianEmail")
    }
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
    academicTermId: stringValue(formData, "academicTermId"),
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
