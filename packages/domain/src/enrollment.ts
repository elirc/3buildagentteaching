import type { ClassSectionStatus, EmploymentStatus, EnrollmentStatus, StudentEnrollmentStatus } from "@agentic-edu/shared";

export interface EnrollmentDecisionInput {
  studentStatus: StudentEnrollmentStatus;
  sectionStatus: ClassSectionStatus;
  teacherStatus: EmploymentStatus;
  activeEnrollmentCount: number;
  sectionCapacity: number;
  hasExistingActiveEnrollment: boolean;
  allowWaitlist?: boolean;
}

export interface EnrollmentDecision {
  allowed: boolean;
  status?: EnrollmentStatus;
  reason?: string;
}

export function decideEnrollment(input: EnrollmentDecisionInput): EnrollmentDecision {
  if (input.studentStatus === "Withdrawn" || input.studentStatus === "Graduated") {
    return { allowed: false, reason: "Student is not eligible for new enrollment." };
  }

  if (input.sectionStatus === "Completed" || input.sectionStatus === "Cancelled") {
    return { allowed: false, reason: "Section is not open for enrollment." };
  }

  if (input.teacherStatus !== "Active") {
    return { allowed: false, reason: "Section must have an active teacher." };
  }

  if (input.hasExistingActiveEnrollment) {
    return { allowed: false, reason: "Student already has an active enrollment for this section." };
  }

  if (input.activeEnrollmentCount >= input.sectionCapacity) {
    if (input.allowWaitlist) {
      return { allowed: true, status: "Waitlisted" };
    }
    return { allowed: false, reason: "Section is at capacity." };
  }

  return { allowed: true, status: "Enrolled" };
}

export function canAssignTeacherToSection(status: EmploymentStatus): boolean {
  return status === "Active";
}

export function isActiveEnrollment(status: EnrollmentStatus): boolean {
  return status === "Enrolled" || status === "Waitlisted";
}
