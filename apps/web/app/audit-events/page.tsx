import { Card, CardHeader, DataTable, JsonBlock, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { formatDateTime } from "@/lib/format";
import { guardRoute } from "@/components/route-guard";

export default async function AuditEventsPage() {
  const denied = await guardRoute("/audit-events");
  if (denied) return denied;

  const events = await prisma.auditEvent.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Audit Events" description="Major user and system actions are recorded with actor, before/after snapshots, metadata, and timestamps." />
      <Card>
        <CardHeader title="Audit Log" />
        <DataTable>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td>{event.actor?.name ?? "System"}</td>
                <td>{event.action}</td>
                <td>{event.entityType} {event.entityId}</td>
                <td><JsonBlock value={event.metadata} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
