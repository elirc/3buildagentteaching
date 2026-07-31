import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function AgentRunsPage({ searchParams }: { searchParams?: Promise<{ all?: string }> }) {
  const params = (await searchParams) ?? {};
  const showAll = params.all === "1";

  /*
   * Root runs only by default. As of US-18 an orchestrated review produces four
   * rows rather than one, so an unfiltered list is three-quarters children —
   * and a child on its own is close to meaningless, because the thing worth
   * reading is the review it fed.
   */
  const runs = await prisma.agentRun.findMany({
    where: showAll ? {} : { parentRunId: null },
    include: { createdBy: true, _count: { select: { childRuns: true } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <>
      <PageHeader
        title="Agent Run History"
        description="Persisted deterministic mock agent runs with input snapshots, output, confidence, limitations, and trace."
        actions={
          <a className="ui-button ui-button--secondary" href={showAll ? "/agent-runs" : "/agent-runs?all=1"}>
            {showAll ? "Root runs only" : "Show child runs"}
          </a>
        }
      />
      <Card>
        <CardHeader title={showAll ? "All runs" : "Root runs"} />
        <DataTable>
          <thead><tr><th>Agent</th><th>Status</th><th>Target</th><th>Sub-runs</th><th>Confidence</th><th>Created by</th><th>Created</th></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <a href={`/agent-runs/${run.id}`}>{run.agentType}</a>
                  {run.parentRunId ? <span className="muted"> · child</span> : null}
                </td>
                <td><StatusBadge value={run.status} /></td>
                <td>{run.targetType} {run.targetId}</td>
                <td>{run._count.childRuns > 0 ? run._count.childRuns : "—"}</td>
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
