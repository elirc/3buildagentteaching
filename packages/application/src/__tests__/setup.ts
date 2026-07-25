import { afterEach, beforeAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The worker process does not inherit globalSetup's mutated env, so .env.test
// has to be read again here — a genuinely surprising bit of vitest behaviour
// that costs an afternoon the first time you meet it.
loadEnvFile(resolve(__dirname, "../../../../.env.test"));

const { prisma } = await import("@agentic-edu/db");

/**
 * Every table, in no particular order — TRUNCATE ... CASCADE handles the
 * foreign keys, which is why this list does not need maintaining in dependency
 * order the way a sequence of DELETEs would.
 */
const TABLES = [
  "AuditEvent", "AgentRecommendation", "AgentEvaluation", "AgentManifest", "AgentRun",
  "WorkerLock", "BackgroundJob", "StructuredLog", "Notification", "InterventionApproval",
  "InterventionPlan", "SupportNote", "AttendanceRecord", "SubmissionCriterionScore",
  "Submission", "RubricCriterion", "Rubric", "Assignment", "Enrollment", "ClassSection",
  "GradingPeriod", "AcademicTerm", "Course", "StudentGuardian", "Guardian", "Student",
  "Teacher", "User"
];

beforeAll(async () => {
  await truncateAll();
});

/*
 * Recreate the acting users before every test.
 *
 * AuditEvent.actorUserId is a real foreign key to User. Because every service
 * writes an audit event inside its transaction, calling any service with an
 * actor whose User row does not exist fails the whole transaction on
 * AuditEvent_actorUserId_fkey — and the error points at audit.ts, several
 * layers away from the missing fixture.
 *
 * That is the schema working correctly: an audit trail that can name a user who
 * never existed is not an audit trail. The fixture has to be honest about it.
 */
beforeEach(async () => {
  await prisma.user.createMany({
    data: [
      { id: "user_admin", name: "Avery Chen", email: "admin@northstar.example", role: "Admin" },
      { id: "user_viewer", name: "Operations Viewer", email: "viewer@northstar.example", role: "Viewer" }
    ],
    skipDuplicates: true
  });
});

/*
 * Truncate AFTER each test rather than before.
 *
 * Both work, but cleaning up after means that when a test fails you can attach
 * a debugger, stop, and inspect exactly the rows that caused it. Cleaning up
 * first destroys the evidence of the run you were trying to look at.
 */
afterEach(async () => {
  await truncateAll();
});

async function truncateAll() {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  // RESTART IDENTITY is belt-and-braces here (every id is a cuid, not a
  // sequence) but costs nothing and stops this breaking if one ever isn't.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}
