import { notFound } from "next/navigation";
import { Card, CardHeader, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { AgentPanel } from "@/components/agent-panel";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { deadLetterBackgroundJob, retryBackgroundJob, runFailedJobInvestigationAgent } from "@/lib/actions";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) notFound();
  const [latestRun, audits, logs] = await Promise.all([
    prisma.agentRun.findFirst({ where: { agentType: "FailedJobInvestigation", targetType: "Job", targetId: id }, orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.findMany({ where: { entityType: "BackgroundJob", entityId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.structuredLog.findMany({ where: { OR: [{ entityType: "Job", entityId: id }, { message: { contains: job.type, mode: "insensitive" } }] }, orderBy: { timestamp: "desc" }, take: 8 })
  ]);
  return (
    <>
      <PageHeader title={`Job ${job.id}`} description={`${job.type} · created ${formatDateTime(job.createdAt)}`} actions={<StatusBadge value={job.status} />} />
      <div className="metric-row">
        <Stat label="Attempts" value={`${job.attempts}/${job.maxAttempts}`} tone={job.attempts >= job.maxAttempts ? "danger" : "info"} />
        <Stat label="Started" value={formatDateTime(job.startedAt)} />
        <Stat label="Finished" value={formatDateTime(job.finishedAt)} />
      </div>
      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Job Controls" />
            <div className="ui-actions" style={{ justifyContent: "flex-start" }}>
              <form action={retryBackgroundJob}><input type="hidden" name="id" value={job.id} /><button className="ui-button ui-button--primary" type="submit">Retry failed job</button></form>
              <form action={deadLetterBackgroundJob}><input type="hidden" name="id" value={job.id} /><button className="ui-button ui-button--danger" type="submit">Mark dead-lettered</button></form>
            </div>
            {job.errorMessage ? <p><strong>Error:</strong> {job.errorMessage}</p> : null}
          </Card>
          <AgentPanel title="Failed Job Investigation Panel" run={latestRun} action={<form action={runFailedJobInvestigationAgent}><input type="hidden" name="jobId" value={job.id} /><button className="ui-button ui-button--primary" type="submit">Run investigation</button></form>} />
          <Card><CardHeader title="Payload" /><JsonBlock value={job.payload} /></Card>
        </div>
        <div className="stack">
          <Card><CardHeader title="Related Logs" /><ul className="list">{logs.map((log) => <li key={log.id}><a href={`/logs/${log.id}`}>{log.level}: {log.message}</a></li>)}</ul></Card>
          <Card><CardHeader title="Audit Events" /><ul className="list">{audits.map((event) => <li key={event.id}>{event.action} · {formatDateTime(event.createdAt)}</li>)}</ul></Card>
        </div>
      </div>
    </>
  );
}
