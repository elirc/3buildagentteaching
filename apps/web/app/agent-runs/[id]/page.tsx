import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

function durationLabel(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt || !completedAt) return "—";
  return `${completedAt.getTime() - startedAt.getTime()} ms`;
}

export default async function AgentRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      createdBy: true,
      // One level each way. The parent link is what lets a reader who landed on
      // a child get back to the thing that explains it.
      childRuns: { orderBy: { startedAt: "asc" } },
      parentRun: true
    }
  });
  if (!run) notFound();

  const tree = run.childRuns.length > 0 ? run.childRuns : [];

  return (
    <>
      <PageHeader
        title={run.agentType}
        description={`${run.targetType} ${run.targetId} · created by ${run.createdBy?.name ?? "System"} · v${run.agentVersion ?? "unknown"}`}
        actions={<StatusBadge value={run.status} />}
      />

      {run.parentRun ? (
        <p className="muted">
          Sub-run of <a href={`/agent-runs/${run.parentRun.id}`}>{run.parentRun.agentType}</a>. It was produced to feed
          that review rather than requested on its own.
        </p>
      ) : null}

      <div className="metric-row">
        <Stat label="Confidence" value={run.confidenceScore ? `${Math.round(run.confidenceScore)}%` : "n/a"} tone="info" />
        <Stat label="Started" value={formatDateTime(run.startedAt)} />
        <Stat label="Completed" value={formatDateTime(run.completedAt)} />
        <Stat label="Duration" value={durationLabel(run.startedAt, run.completedAt)} />
      </div>

      {tree.length > 0 ? (
        <Card>
          <CardHeader title="Run tree" />
          <p className="muted">
            This run orchestrated {tree.length} sub-agent{tree.length === 1 ? "" : "s"}. Its confidence is capped by the
            least confident of them — a review built on thin data reports as thin, rather than inheriting the
            orchestrator&apos;s own certainty.
          </p>
          <DataTable>
            <thead><tr><th>Agent</th><th>Status</th><th>Confidence</th><th>Duration</th><th /></tr></thead>
            <tbody>
              <tr>
                <td><strong>{run.agentType}</strong> <span className="muted">(this run)</span></td>
                <td><StatusBadge value={run.status} /></td>
                <td>{run.confidenceScore ? `${Math.round(run.confidenceScore)}%` : "n/a"}</td>
                <td>{durationLabel(run.startedAt, run.completedAt)}</td>
                <td />
              </tr>
              {tree.map((child) => (
                <tr key={child.id}>
                  {/* Indented with a marker rather than a nested table: one
                      level is all this model permits, and a table inside a table
                      would imply otherwise. */}
                  <td style={{ paddingLeft: "var(--space-4)" }}>└ {child.agentType}</td>
                  <td><StatusBadge value={child.status} /></td>
                  <td>{child.confidenceScore ? `${Math.round(child.confidenceScore)}%` : "n/a"}</td>
                  <td>{durationLabel(child.startedAt, child.completedAt)}</td>
                  <td><a href={`/agent-runs/${child.id}`}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {run.status === "Failed" ? (
            <p className="muted">
              The parent failed, and the sub-runs above are kept deliberately: the ones that completed are still worth
              reading, and which one failed is the first question anyone asks.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: "var(--space-4)" }}>
        <Card><CardHeader title="Input Snapshot" /><JsonBlock value={run.inputSnapshot} /></Card>
        <Card><CardHeader title="Output" /><JsonBlock value={run.output ?? { error: run.errorMessage }} /></Card>
        <Card><CardHeader title="Trace / Debug Output" /><JsonBlock value={run.trace} /></Card>
        <Card>
          <CardHeader title="Metadata" />
          <JsonBlock
            value={{
              id: run.id,
              targetType: run.targetType,
              targetId: run.targetId,
              agentVersion: run.agentVersion,
              inputSchemaVersion: run.inputSchemaVersion,
              outputSchemaVersion: run.outputSchemaVersion,
              parentRunId: run.parentRunId,
              errorMessage: run.errorMessage
            }}
          />
        </Card>
      </div>
    </>
  );
}
