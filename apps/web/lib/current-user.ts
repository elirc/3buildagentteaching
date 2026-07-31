import { randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@agentic-edu/db";
import type { ActorContext } from "@agentic-edu/application";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const activeUserId = cookieStore.get("active_user_id")?.value;
  const user =
    (activeUserId
      ? await prisma.user.findUnique({ where: { id: activeUserId } })
      : null) ?? (await prisma.user.findFirst({ where: { role: "Admin" }, orderBy: { createdAt: "asc" } }));

  return user;
}

export async function listSwitchableUsers() {
  return prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
}

/**
 * Resolves the acting user and stamps the request with a correlation id.
 *
 * Wrapped in React's `cache` for one specific reason: a single page render
 * calls this more than once — the route guard asks who you are, then the page
 * asks again, then each Server Action asks a third time. Without memoisation
 * every one of those would mint a *different* `requestId`, and the field would
 * be worse than useless: it would look like a correlation id while correlating
 * nothing. `cache` scopes one result to one render pass, so every log line
 * written while producing a page shares an id, and the /logs filter on it
 * actually reassembles the request.
 *
 * A Server Action invocation is a separate pass and gets its own id, which is
 * correct — it is a separate request.
 */
export const getCurrentActor = cache(async function getCurrentActor(): Promise<ActorContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("No development user is available.");
  }
  const [teacher, student, advisedStudents, guardianLinks] = await Promise.all([
    prisma.teacher.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.student.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.student.findMany({ where: { advisorId: user.id }, select: { id: true } }),
    // Two hops: User -> Guardian -> StudentGuardian. A Guardian profile is not
    // required to have a user account, so this is empty for most actors.
    prisma.studentGuardian.findMany({
      where: { guardian: { userId: user.id } },
      select: { studentId: true }
    })
  ]);
  return {
    id: user.id,
    role: user.role,
    teacherId: teacher?.id ?? null,
    studentId: student?.id ?? null,
    advisedStudentIds: advisedStudents.map((item) => item.id),
    guardianStudentIds: guardianLinks.map((item) => item.studentId),
    requestId: randomUUID()
  };
});
