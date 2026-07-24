import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getAgentOperationsOverview } from "@agentic-edu/application";
import { runNextWorkerJob } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export default async function WorkerJobsPage() {
  const overview = await getAgentOperationsOverview();

  return (
    <>
      <PageHeader
        title="Worker Jobs"
        description="Deterministic local worker simulation with idempotency keys, retry scheduling, and lock visibility."
        actions={
          <form action={runNextWorkerJob}>
            <button className="ui-button ui-button--primary" type="submit">Run next job</button>
          </form>
        }
      />
      <div className="ui-stat-grid">
        <Stat label="Runnable" value={overview.metrics.runnableJobs} tone="good" />
        <Stat label="Failed" value={overview.workerJobs.filter((job) => job.status === "Failed").length} tone="danger" />
        <Stat label="Dead-lettered" value={overview.workerJobs.filter((job) => job.status === "DeadLettered").length} tone="warn" />
      </div>
      <Card>
        <CardHeader title="Worker Queue" />
        <DataTable>
          <thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Attempts</th><th>Idempotency</th><th>Next Run</th><th>Lock</th></tr></thead>
          <tbody>
            {overview.workerJobs.map((job) => (
              <tr key={job.id}>
                <td><a href={`/jobs/${job.id}`}>{job.id}</a></td>
                <td>{job.type}</td>
                <td><StatusBadge value={job.status} /></td>
                <td>{job.attempts}/{job.maxAttempts}</td>
                <td>{job.idempotencyKey ?? "None"}</td>
                <td>{formatDateTime(job.nextRunAt ?? job.scheduledFor)}</td>
                <td>{job.workerLock ? `${job.workerLock.lockedBy} until ${formatDateTime(job.workerLock.expiresAt)}` : "Unlocked"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
