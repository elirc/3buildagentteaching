/**
 * One-off backfill: give every student a real Guardian link.
 *
 * Run this BEFORE `db:push` drops `Student.guardianName` / `guardianEmail`.
 * Afterwards the columns are gone and the information with them, so the order
 * is not a style preference — it is the difference between a migration and a
 * data loss incident.
 *
 *   npx tsx packages/db/scripts/backfill-guardians.ts [--dry-run]
 *
 * The script is idempotent: a student who already has a guardian link is left
 * alone, and a guardian who already exists is matched by email rather than
 * duplicated. Running it twice is a no-op, which matters because the first run
 * of a backfill is very often not the last.
 *
 * Reading the legacy columns through `$queryRaw` is deliberate. Once the schema
 * change lands, the generated Prisma client no longer knows those fields exist
 * and `student.guardianName` stops compiling — so a typed read would make this
 * script un-runnable in exactly the state it is meant to be run in. Raw SQL
 * costs the type safety and buys the ability to run at all.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeGuardianEmail, splitGuardianName } from "@agentic-edu/domain";

const prisma = new PrismaClient();

interface LegacyStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianEmail: string | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no writes will be made.\n");

  const legacyColumnsExist = await hasLegacyColumns();
  if (!legacyColumnsExist) {
    console.log("Student.guardianName / guardianEmail are already gone. Nothing to backfill.");
    return;
  }

  const students = await prisma.$queryRawUnsafe<LegacyStudentRow[]>(
    `SELECT "id", "firstName", "lastName", "guardianName", "guardianEmail" FROM "Student" ORDER BY "lastName", "firstName"`
  );

  let linked = 0;
  let createdGuardians = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const student of students) {
    const label = `${student.firstName} ${student.lastName} (${student.id})`;

    const existingPrimary = await prisma.studentGuardian.findFirst({
      where: { studentId: student.id, isPrimary: true }
    });
    if (existingPrimary) {
      console.log(`skip     ${label} — already has a primary guardian`);
      skipped += 1;
      continue;
    }

    const email = student.guardianEmail ? normalizeGuardianEmail(student.guardianEmail) : "";
    if (!email) {
      // Loudly, not silently. A student with no contact details is a data
      // problem for a human to resolve, and inventing an address to make the
      // script finish cleanly would bury it.
      problems.push(`${label} has no guardianEmail — no link created`);
      continue;
    }

    const { firstName, lastName } = splitGuardianName(student.guardianName ?? "");

    if (dryRun) {
      console.log(`would link ${label} -> ${email}`);
      linked += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // findFirst + create rather than upsert: Guardian.email is unique, but the
      // stored value may differ in case from the normalised one we are matching
      // on, and upsert matches exactly.
      const existing = await tx.guardian.findFirst({
        where: { email: { equals: email, mode: "insensitive" } }
      });

      if (existing) {
        /*
         * Two students can list the same guardian email under different names —
         * a remarriage, a typo, or a shared family address. Email wins, because
         * it is the identity the rest of the system uses, but the discarded
         * name is reported rather than dropped silently. Whoever runs this is
         * the last person who can compare the two.
         */
        const legacyName = `${firstName} ${lastName}`.trim();
        const existingName = `${existing.firstName} ${existing.lastName}`.trim();
        if (legacyName && legacyName.toLowerCase() !== existingName.toLowerCase()) {
          console.warn(`  ! ${email} is already "${existingName}"; this student listed "${legacyName}". Keeping "${existingName}".`);
        }
      }

      const guardian =
        existing ??
        (await tx.guardian.create({
          data: { firstName: firstName || "Guardian", lastName: lastName || student.lastName, email }
        }));
      if (!existing) createdGuardians += 1;

      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
        create: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: "Guardian",
          isPrimary: true,
          receivesDigest: true,
          emergencyContact: true
        },
        update: { isPrimary: true }
      });
    });

    console.log(`linked   ${label} -> ${email}`);
    linked += 1;
  }

  console.log(`\n${students.length} student(s): ${linked} linked, ${skipped} already had one, ${createdGuardians} guardian record(s) created.`);

  if (problems.length > 0) {
    console.error(`\n${problems.length} student(s) could not be backfilled:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    // Non-zero exit so a CI or deploy step stops here rather than proceeding to
    // drop the columns these students' details are still sitting in.
    process.exitCode = 1;
  }
}

async function hasLegacyColumns(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM information_schema.columns
     WHERE table_name = 'Student' AND column_name IN ('guardianName', 'guardianEmail')`
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
