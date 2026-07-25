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

export async function getCurrentActor(): Promise<ActorContext> {
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
    guardianStudentIds: guardianLinks.map((item) => item.studentId)
  };
}
