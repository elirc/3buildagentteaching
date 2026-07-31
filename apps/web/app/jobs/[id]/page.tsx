import { notFound } from "next/navigation";
import { Card, CardHeader, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { AgentPanel } from "@/components/agent-panel";
import { getRunnableAgents } from "@/lib/agent-availability";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { deadLetterBackgroundJob, retryBackgroundJob, runFailedJobInvestigationAgent } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { getActorCapabilities } from "@/lib/capabilities";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { can } = await getActorCapabilities();
  const runnable = await getRunnableAgents();
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
              {/*
                Disabled rather than hidden. An operator who cannot retry still
                needs to know retrying is the thing that would happen here — the
                title attribute tells them why they cannot, which is more useful
                than an empty card that looks broken.
              */}
              <ActionForm action={retryBackgroundJob}>
                <input type="hidden" name="id" value={job.id} />
                <SubmitButton variant="primary" disabled={!can("job:retry")}>Retry failed job</SubmitButton>
              </ActionForm>
              <ActionForm action={deadLetterBackgroundJob}>
                <input type="hidden" name="id" value={job.id} />
                <SubmitButton variant="danger" disabled={!can("job:deadLetter")}>Mark dead-lettered</SubmitButton>
              </ActionForm>
            </div>
            {!can("job:retry") ? <p className="muted">Job controls require an Admin or School Manager role.</p> : null}
            {job.errorMessage ? <p><strong>Error:</strong> {job.errorMessage}</p> : null}
          </Card>
          <AgentPanel
            title="Failed Job Investigation Panel"
            available={runnable.has("FailedJobInvestigation")}
            run={latestRun}
            action={
              can("agent:run") ? (
                <ActionForm action={runFailedJobInvestigationAgent}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <SubmitButton variant="primary">Run investigation</SubmitButton>
                </ActionForm>
              ) : null
            }
          />
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
