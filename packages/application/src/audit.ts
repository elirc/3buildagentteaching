import { Prisma, type PrismaClient } from "@agentic-edu/db";

export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function createAuditEvent(
  tx: PrismaTransaction,
  input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  return tx.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : toJson(input.before),
      after: input.after === undefined ? undefined : toJson(input.after),
      metadata: (input.metadata ?? { source: "application-service" }) as Prisma.InputJsonValue
    }
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
