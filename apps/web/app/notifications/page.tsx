import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { markNotificationRead } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export default async function NotificationsPage() {
  const overview = await getAcademicOperationsOverview();

  return (
    <>
      <PageHeader title="Notifications" description="Local notification records for guardian digests, agent recommendations, and operational alerts." />
      <div className="ui-stat-grid">
        <Stat label="Notifications" value={overview.notifications.length} />
        <Stat label="Unread" value={overview.metrics.unreadNotifications} tone={overview.metrics.unreadNotifications > 0 ? "warn" : "good"} />
        <Stat label="Failed" value={overview.notifications.filter((notification) => notification.status === "Failed").length} tone="danger" />
      </div>
      <Card>
        <CardHeader title="Notification Center" />
        <DataTable>
          <thead><tr><th>Title</th><th>Recipient</th><th>Type</th><th>Channel</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            {overview.notifications.map((notification) => (
              <tr key={notification.id}>
                <td>{notification.title}</td>
                <td>{notification.user?.name ?? notification.student?.email ?? "System"}</td>
                <td>{notification.type}</td>
                <td>{notification.channel}</td>
                <td><StatusBadge value={notification.status} /></td>
                <td>{formatDateTime(notification.createdAt)}</td>
                <td>
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={notification.id} />
                    <button className="ui-button ui-button--secondary" type="submit" disabled={notification.status === "Read"}>Mark read</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
