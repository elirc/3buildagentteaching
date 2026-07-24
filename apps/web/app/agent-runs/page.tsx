import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function AgentRunsPage() {
  const runs = await prisma.agentRun.findMany({ include: { createdBy: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Agent Run History" description="Persisted deterministic mock agent runs with input snapshots, output, confidence, limitations, and trace." />
      <Card>
        <CardHeader title="Runs" />
        <DataTable>
          <thead><tr><th>Agent</th><th>Status</th><th>Target</th><th>Confidence</th><th>Created by</th><th>Created</th></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td><a href={`/agent-runs/${run.id}`}>{run.agentType}</a></td>
                <td><StatusBadge value={run.status} /></td>
                <td>{run.targetType} {run.targetId}</td>
                <td>{run.confidenceScore ? `${Math.round(run.confidenceScore)}%` : "n/a"}</td>
                <td>{run.createdBy?.name ?? "System"}</td>
                <td>{formatDateTime(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
