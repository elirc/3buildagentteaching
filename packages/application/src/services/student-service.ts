import { prisma } from "@agentic-edu/db";
import { normalizeGuardianEmail, splitGuardianName, type StudentCreateInput, type StudentInput } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent, type PrismaTransaction } from "../audit";
import { withServiceLogging } from "../logging";

export const studentService = withServiceLogging("student-service", {
  /**
   * Creates a student and their first guardian link in one transaction.
   *
   * The guardian is not optional. A student with no guardian is a student the
   * school cannot contact, and every feature that reaches a family — the
   * digest, the communication draft agent, the family portal — treats that case
   * as "nothing to do" rather than as a problem. Making the link part of the
   * same transaction means the invariant holds from the first row rather than
   * being something a later cleanup script has to establish.
   */
  async createStudent(actor: ActorContext, input: StudentCreateInput) {
    assertCan(actor, "student:create");
    const { primaryGuardian, ...studentFields } = input;

    return prisma.$transaction(async (tx) => {
      const student = await tx.student.create({ data: studentFields });
      const guardian = await findOrCreateGuardian(tx, {
        email: primaryGuardian.email,
        name: primaryGuardian.name,
        fallbackLastName: student.lastName
      });

      const link = await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: "Guardian",
          isPrimary: true,
          receivesDigest: true,
          emergencyContact: true
        }
      });

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "student.created",
        entityType: "Student",
        entityId: student.id,
        after: { ...student, primaryGuardianId: guardian.id, studentGuardianId: link.id }
      });
      return student;
    });
  },

  /**
   * Note what this no longer accepts: guardian details.
   *
   * They used to be two columns on this input, so saving a change of grade
   * level also rewrote the guardian's email from whatever was in the form — the
   * mechanism by which the denormalised copy drifted from the Guardian record.
   * Guardians are managed through their own methods now, which understand
   * primaries and relationships.
   */
  async updateStudent(actor: ActorContext, id: string, input: StudentInput) {
    assertCan(actor, "student:update", { studentId: id });
    return prisma.$transaction(async (tx) => {
      const before = await tx.student.findUniqueOrThrow({ where: { id } });
      const student = await tx.student.update({ where: { id }, data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "student.updated",
        entityType: "Student",
        entityId: student.id,
        before,
        after: student
      });
      return student;
    });
  }
});

/**
 * Matches an existing guardian by email, case-insensitively, or creates one.
 *
 * The case-insensitive match is the whole point. Guardian.email is unique, so
 * "Denise.Johnson@..." typed on the student form would otherwise either create
 * a second record for a person who already exists or fail the create outright
 * on the unique constraint, depending on how the database happened to fold the
 * case. Email is the identity of a guardian here, so it is normalised once, on
 * the way in.
 */
export async function findOrCreateGuardian(
  tx: PrismaTransaction,
  input: { email: string; name: string; fallbackLastName: string }
) {
  const email = normalizeGuardianEmail(input.email);
  const existing = await tx.guardian.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) return existing;

  const { firstName, lastName } = splitGuardianName(input.name);
  return tx.guardian.create({
    data: {
      firstName: firstName || "Guardian",
      // A one-word guardian name borrows the student's surname rather than
      // leaving a NOT NULL column empty. Visibly wrong beats silently blank —
      // the guardian panel shows both fields for correction.
      lastName: lastName || input.fallbackLastName,
      email
    }
  });
}
