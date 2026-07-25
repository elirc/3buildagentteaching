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

export interface WaitlistPromotionInput {
  studentStatus: StudentEnrollmentStatus;
  sectionStatus: ClassSectionStatus;
  teacherStatus: EmploymentStatus;
  enrollmentStatus: EnrollmentStatus;
  activeEnrollmentCount: number;
  sectionCapacity: number;
}

/**
 * Whether a waitlisted student may be moved into a seat.
 *
 * Re-checks capacity rather than trusting the caller, because the gap between
 * seeing "1 seat open" on a roster page and pressing Promote can be arbitrarily
 * long — someone else may have taken it. This is the same class of problem as
 * the enrollment race, and the answer is the same: decide at the moment of
 * writing, not at the moment of rendering.
 *
 * Also re-checks eligibility. A student can withdraw from the school while
 * sitting on a waitlist, and promoting them would quietly re-activate a record
 * the office deliberately closed.
 */
export function decideWaitlistPromotion(input: WaitlistPromotionInput): EnrollmentDecision {
  if (input.enrollmentStatus !== "Waitlisted") {
    return { allowed: false, reason: "Only waitlisted enrollments can be promoted." };
  }

  if (input.studentStatus === "Withdrawn" || input.studentStatus === "Graduated") {
    return { allowed: false, reason: "Student is no longer eligible for enrollment." };
  }

  if (input.sectionStatus === "Completed" || input.sectionStatus === "Cancelled") {
    return { allowed: false, reason: "Section is not open for enrollment." };
  }

  if (input.teacherStatus !== "Active") {
    return { allowed: false, reason: "Section must have an active teacher." };
  }

  if (input.activeEnrollmentCount >= input.sectionCapacity) {
    return { allowed: false, reason: "Section is still at capacity." };
  }

  return { allowed: true, status: "Enrolled" };
}

export interface CapacityChangeInput {
  newCapacity: number;
  activeEnrollmentCount: number;
}

/**
 * Whether a section's capacity may be reduced to the requested number.
 *
 * Lowering capacity below the number of students already seated would leave the
 * section permanently over-subscribed with no rule to resolve it — every
 * subsequent enrollment check would refuse, and nothing would say why. Refusing
 * the edit, and naming the count, puts the decision back with the human.
 */
export function canReduceCapacity(input: CapacityChangeInput): { allowed: boolean; reason?: string } {
  if (input.newCapacity < 1) {
    return { allowed: false, reason: "Capacity must be at least 1." };
  }
  if (input.newCapacity < input.activeEnrollmentCount) {
    return {
      allowed: false,
      reason: `Capacity cannot be below the ${input.activeEnrollmentCount} student(s) already enrolled.`
    };
  }
  return { allowed: true };
}
