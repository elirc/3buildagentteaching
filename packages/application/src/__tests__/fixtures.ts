import { prisma } from "@agentic-edu/db";

/**
 * Minimal fixture builders.
 *
 * Deliberately not a copy of the seed. The seed tells one long coherent story,
 * which is right for a demo and wrong for a test — a test should create exactly
 * what it needs so that a reader can see the preconditions without opening
 * another file.
 */
export async function makeTeacher(overrides: { id?: string; employmentStatus?: "Active" | "OnLeave" | "Inactive" } = {}) {
  const id = overrides.id ?? `teacher_${Math.random().toString(36).slice(2, 10)}`;
  return prisma.teacher.create({
    data: {
      id,
      firstName: "Nina",
      lastName: "Patel",
      email: `${id}@northstar.example`,
      department: "Mathematics",
      employmentStatus: overrides.employmentStatus ?? "Active",
      subjectsTaught: ["Algebra"]
    }
  });
}

export async function makeStudent(overrides: { id?: string; enrollmentStatus?: "Active" | "Probation" | "Withdrawn" | "Graduated" } = {}) {
  const id = overrides.id ?? `student_${Math.random().toString(36).slice(2, 10)}`;
  return prisma.student.create({
    data: {
      id,
      firstName: "Maya",
      lastName: "Johnson",
      email: `${id}@student.example`,
      gradeLevel: 9,
      enrollmentStatus: overrides.enrollmentStatus ?? "Active",
      studentNumber: id
    }
  });
}

/**
 * A student with a linked primary guardian.
 *
 * Separate from makeStudent because most tests do not care about guardians and
 * a fixture that creates rows nobody asked for makes it harder to see what a
 * test actually depends on. The ones that do care say so by calling this.
 */
export async function makeStudentWithGuardian(
  overrides: { id?: string; guardianEmail?: string; receivesDigest?: boolean } = {}
) {
  const student = await makeStudent({ id: overrides.id });
  const email = overrides.guardianEmail ?? `${student.id}.guardian@example.com`;
  const guardian = await prisma.guardian.create({
    data: { firstName: "Denise", lastName: "Johnson", email }
  });
  const link = await prisma.studentGuardian.create({
    data: {
      studentId: student.id,
      guardianId: guardian.id,
      relationship: "Mother",
      isPrimary: true,
      receivesDigest: overrides.receivesDigest ?? true,
      emergencyContact: true
    }
  });
  return { student, guardian, link };
}

export async function makeSection(teacherId: string, overrides: { capacity?: number; status?: "Planned" | "Active" | "Completed" | "Cancelled" } = {}) {
  const course = await prisma.course.create({
    data: {
      code: `MATH-${Math.random().toString(36).slice(2, 7)}`,
      title: "Algebra I",
      description: "Linear equations.",
      subject: "Mathematics",
      gradeLevel: 9,
      creditHours: 1,
      status: "Active"
    }
  });
  return prisma.classSection.create({
    data: {
      courseId: course.id,
      teacherId,
      term: "Fall 2026",
      room: "214",
      schedule: { days: ["Mon"], start: "09:00", end: "09:55" },
      capacity: overrides.capacity ?? 2,
      status: overrides.status ?? "Active"
    }
  });
}

export async function makeAssignment(classSectionId: string, teacherId: string, pointsPossible = 20) {
  return prisma.assignment.create({
    data: {
      classSectionId,
      title: "Linear Equations Practice",
      description: "Solve linear equations.",
      type: "Homework",
      status: "Published",
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      pointsPossible,
      createdByTeacherId: teacherId
    }
  });
}

export const ADMIN = { id: "user_admin", role: "Admin" as const };
export const VIEWER = { id: "user_viewer", role: "Viewer" as const };

export async function makeRubric(assignmentId: string, teacherId: string, criteria: Array<{ title: string; points: number }>) {
  return prisma.rubric.create({
    data: {
      assignmentId,
      title: "Project Rubric",
      createdByTeacherId: teacherId,
      criteria: {
        create: criteria.map((criterion, index) => ({
          title: criterion.title,
          description: `${criterion.title} criterion`,
          pointsPossible: criterion.points,
          sortOrder: index + 1
        }))
      }
    },
    include: { criteria: { orderBy: { sortOrder: "asc" } } }
  });
}
