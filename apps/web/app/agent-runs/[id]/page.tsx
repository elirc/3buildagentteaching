import { notFound } from "next/navigation";
import { Card, CardHeader, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function AgentRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.agentRun.findUnique({ where: { id }, include: { createdBy: true } });
  if (!run) notFound();
  return (
    <>
      <PageHeader title={run.agentType} description={`${run.targetType} ${run.targetId} · created by ${run.createdBy?.name ?? "System"}`} actions={<StatusBadge value={run.status} />} />
      <div className="metric-row">
        <Stat label="Confidence" value={run.confidenceScore ? `${Math.round(run.confidenceScore)}%` : "n/a"} tone="info" />
        <Stat label="Started" value={formatDateTime(run.startedAt)} />
        <Stat label="Completed" value={formatDateTime(run.completedAt)} />
      </div>
      <div className="grid grid-2" style={{ marginTop: "var(--space-4)" }}>
        <Card><CardHeader title="Input Snapshot" /><JsonBlock value={run.inputSnapshot} /></Card>
        <Card><CardHeader title="Output" /><JsonBlock value={run.output ?? { error: run.errorMessage }} /></Card>
        <Card><CardHeader title="Trace / Debug Output" /><JsonBlock value={run.trace} /></Card>
        <Card><CardHeader title="Metadata" /><JsonBlock value={{ id: run.id, targetType: run.targetType, targetId: run.targetId, errorMessage: run.errorMessage }} /></Card>
      </div>
    </>
  );
}
