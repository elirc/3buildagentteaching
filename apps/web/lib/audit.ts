import { Prisma, prisma } from "@agentic-edu/db";

export async function recordAuditEvent(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
      after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
      metadata: (input.metadata ?? { source: "web" }) as Prisma.InputJsonValue
    }
  });
}
