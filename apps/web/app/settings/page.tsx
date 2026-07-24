import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { getCurrentUser } from "@/lib/current-user";
import { StatusBadge } from "@/components/status-badge";

export default async function SettingsPage() {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] })
  ]);
  return (
    <>
      <PageHeader title="Settings / Dev User Switcher" description="Local authentication simulation for role-aware views and actions. Full auth is intentionally out of scope for this MVP." />
      <Card>
        <CardHeader title="Active User" />
        <p><strong>{currentUser?.name ?? "No user"}</strong> · {currentUser ? <StatusBadge value={currentUser.role} /> : null}</p>
      </Card>
      <Card>
        <CardHeader title="Demo Accounts" />
        <DataTable>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><StatusBadge value={user.role} /></td></tr>)}</tbody>
        </DataTable>
      </Card>
    </>
  );
}
