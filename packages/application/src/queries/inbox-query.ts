import { prisma } from "@agentic-edu/db";
import type { ActorContext } from "../context";

/**
 * The acting user's own notifications.
 *
 * /notifications previously listed every notification for every user, with a
 * "Mark read" button on each. That is an admin debugging view, not an inbox —
 * there was no way to see what was addressed to *you*.
 *
 * Guardians also see notifications about their linked children, because a
 * message about Maya addressed to the school is still Denise's business.
 * Everyone else sees only what names them.
 */
export async function getInbox(actor: ActorContext, options: { all?: boolean } = {}) {
  const isOperator = actor.role === "Admin" || actor.role === "SchoolManager";
  const showAll = options.all === true && isOperator;

  const where = showAll
    ? {}
    : {
        OR: [
          { userId: actor.id },
          ...(actor.guardianStudentIds && actor.guardianStudentIds.length > 0
            ? [{ studentId: { in: [...actor.guardianStudentIds] } }]
            : [])
        ]
      };

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { user: true, student: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    // Counted with the same `where`, so the badge cannot disagree with the list.
    prisma.notification.count({ where: { ...where, status: { not: "Read" } } })
  ]);

  return { notifications, unread, showAll, canToggleAll: isOperator };
}

/** Unread count for the top-bar badge. One count query, no rows fetched. */
export async function getUnreadCount(actor: ActorContext) {
  return prisma.notification.count({
    where: {
      status: { not: "Read" },
      OR: [
        { userId: actor.id },
        ...(actor.guardianStudentIds && actor.guardianStudentIds.length > 0
          ? [{ studentId: { in: [...actor.guardianStudentIds] } }]
          : [])
      ]
    }
  });
}

/**
 * Agent recommendations, filtered to the acting user's role by default.
 *
 * An agent nominates an ownerRole for each recommendation. Showing every
 * recommendation to everyone means the person who should act cannot find
 * theirs — and the Critical-risk routing fix in this story only matters if
 * something actually filters on the field it corrects.
 */
export async function getRecommendationsForActor(actor: ActorContext, options: { all?: boolean } = {}) {
  const isOperator = actor.role === "Admin" || actor.role === "SchoolManager";
  const showAll = options.all === true && isOperator;

  const recommendations = await prisma.agentRecommendation.findMany({
    where: showAll ? {} : { ownerRole: actor.role },
    include: { agentRun: true, approvedBy: true },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 50
  });

  return { recommendations, showAll, canToggleAll: isOperator };
}
