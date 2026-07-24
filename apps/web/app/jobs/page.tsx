import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function JobsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = (await searchParams) ?? {};
  const jobs = await prisma.backgroundJob.findMany({
    where: { status: params.status ? (params.status as never) : undefined },
    orderBy: { createdAt: "desc" }
  });
  return (
    <>
      <PageHeader title="Background Jobs" description="Mock job monitoring with retry, dead-letter, and investigation workflow." />
      <Card>
        <CardHeader title="Filters" />
        <form className="ui-actions" style={{ justifyContent: "flex-start" }}>
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option><option value="Queued">Queued</option><option value="Running">Running</option><option value="Succeeded">Succeeded</option><option value="Failed">Failed</option><option value="Retrying">Retrying</option><option value="DeadLettered">Dead-lettered</option>
          </select>
          <button className="ui-button ui-button--secondary" type="submit">Apply</button>
          <a className="ui-button ui-button--danger" href="/jobs?status=Failed">Failed jobs</a>
        </form>
      </Card>
      <Card>
        <CardHeader title="Jobs" />
        <DataTable>
          <thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Attempts</th><th>Error</th><th>Created</th></tr></thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td><a href={`/jobs/${job.id}`}>{job.id}</a></td>
                <td>{job.type}</td>
                <td><StatusBadge value={job.status} /></td>
                <td>{job.attempts}/{job.maxAttempts}</td>
                <td>{job.errorMessage ?? ""}</td>
                <td>{formatDateTime(job.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
