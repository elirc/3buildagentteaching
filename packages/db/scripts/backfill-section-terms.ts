/**
 * One-off backfill: point every section at a real AcademicTerm.
 *
 *   npx tsx packages/db/scripts/backfill-section-terms.ts [--dry-run]
 *
 * Run BEFORE `db:push` makes `ClassSection.academicTermId` required and drops
 * `ClassSection.term`. Afterwards the string is gone and the only evidence of
 * which term a section meant goes with it.
 *
 * The matching rule is exact-on-name, because `AcademicTerm.name` is unique and
 * the legacy strings were written to match it ("Fall 2026"). What this script
 * deliberately will NOT do is guess: no fuzzy matching, no creating a term
 * because one is missing, no defaulting to the newest. If a string has no
 * match, the script lists every offender and exits non-zero, because silently
 * inventing a term — or quietly attaching thirty sections to the wrong one —
 * produces a database that looks correct and answers every date question wrong.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface LegacySectionRow {
  id: string;
  term: string | null;
  academicTermId: string | null;
  courseCode: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no writes will be made.\n");

  if (!(await hasLegacyTermColumn())) {
    console.log("ClassSection.term is already gone. Nothing to backfill.");
    return;
  }

  const sections = await prisma.$queryRawUnsafe<LegacySectionRow[]>(
    `SELECT s."id", s."term", s."academicTermId", c."code" AS "courseCode"
     FROM "ClassSection" s JOIN "Course" c ON c."id" = s."courseId"
     ORDER BY s."term", c."code"`
  );
  const terms = await prisma.academicTerm.findMany({ select: { id: true, name: true } });
  const byName = new Map(terms.map((term) => [term.name, term.id]));

  let updated = 0;
  let alreadyLinked = 0;
  const unmatched: string[] = [];

  for (const section of sections) {
    const label = `${section.courseCode} (${section.id})`;

    if (section.academicTermId) {
      /*
       * A section can already point at a term *and* carry a contradicting
       * string — that is the bug this story exists to remove, so it is worth
       * reporting rather than skipping past. The FK wins: it is the one the
       * date rules already use.
       */
      const linkedName = terms.find((term) => term.id === section.academicTermId)?.name;
      if (section.term && linkedName && section.term !== linkedName) {
        console.warn(`  ! ${label} is labelled "${section.term}" but points at "${linkedName}". Keeping "${linkedName}".`);
      }
      alreadyLinked += 1;
      continue;
    }

    const termId = section.term ? byName.get(section.term) : undefined;
    if (!termId) {
      unmatched.push(`${label} has term "${section.term ?? "(empty)"}", which matches no AcademicTerm.name`);
      continue;
    }

    if (!dryRun) {
      await prisma.$executeRawUnsafe(`UPDATE "ClassSection" SET "academicTermId" = $1 WHERE "id" = $2`, termId, section.id);
    }
    console.log(`${dryRun ? "would link" : "linked   "} ${label} -> ${section.term}`);
    updated += 1;
  }

  console.log(`\n${sections.length} section(s): ${updated} linked, ${alreadyLinked} already pointed at a term.`);
  console.log(`Known terms: ${terms.map((term) => term.name).join(", ") || "(none)"}`);

  if (unmatched.length > 0) {
    console.error(`\n${unmatched.length} section(s) could not be matched:`);
    for (const problem of unmatched) console.error(`  - ${problem}`);
    console.error("\nCreate the missing AcademicTerm rows (or correct the strings) and run again.");
    console.error("Do NOT run db:push until this is clean — the column is about to become required.");
    process.exitCode = 1;
  }
}

async function hasLegacyTermColumn(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM information_schema.columns
     WHERE table_name = 'ClassSection' AND column_name = 'term'`
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
