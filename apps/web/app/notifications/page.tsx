import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getInbox } from "@agentic-edu/application";
import { getActorCapabilities } from "@/lib/capabilities";
import { markNotificationRead } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function NotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ all?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const { actor } = await getActorCapabilities();
  const { notifications, unread, showAll, canToggleAll } = await getInbox(actor, { all: query.all === "1" });

  return (
    <>
      <PageHeader title="Notifications" description={showAll ? "Every notification in the system." : "Messages addressed to you."}
        actions={canToggleAll ? <a className="ui-button ui-button--secondary" href={showAll ? "/notifications" : "/notifications?all=1"}>{showAll ? "Show mine" : "Show all"}</a> : undefined} />
      <div className="ui-stat-grid">
        <Stat label="Notifications" value={notifications.length} />
        <Stat label="Unread" value={unread} tone={unread > 0 ? "warn" : "good"} />
        <Stat label="Failed" value={notifications.filter((notification) => notification.status === "Failed").length} tone="danger" />
      </div>
      <Card>
        <CardHeader title={showAll ? "All notifications" : "Your inbox"} />
        <DataTable>
          <thead><tr><th>Title</th><th>Recipient</th><th>Type</th><th>Channel</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            {notifications.map((notification) => (
              <tr key={notification.id}>
                <td>{notification.title}</td>
                <td>{notification.user?.name ?? notification.student?.email ?? "System"}</td>
                <td>{notification.type}</td>
                <td>{notification.channel}</td>
                <td><StatusBadge value={notification.status} /></td>
                <td>{formatDateTime(notification.createdAt)}</td>
                <td>
                  <ActionForm action={markNotificationRead}>
                    <input type="hidden" name="id" value={notification.id} />
                    <SubmitButton variant="secondary" disabled={notification.status === "Read"}>Mark read</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
