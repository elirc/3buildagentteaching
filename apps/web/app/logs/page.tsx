import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { scoreOperationalAnomaly } from "@agentic-edu/observability";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatDateTime } from "@/lib/format";
import { guardRoute } from "@/components/route-guard";
import { getActorCapabilities } from "@/lib/capabilities";
import { purgeStructuredLogs } from "@/lib/actions";

export default async function LogsPage({ searchParams }: { searchParams?: Promise<{ level?: string; service?: string; environment?: string; entityType?: string; userId?: string; requestId?: string; from?: string; to?: string }> }) {
  const denied = await guardRoute("/logs");
  if (denied) return denied;

  const { can } = await getActorCapabilities();
  const params = (await searchParams) ?? {};
  const timestamp =
    params.from || params.to
      ? {
          gte: params.from ? new Date(params.from) : undefined,
          lte: params.to ? new Date(params.to) : undefined
        }
      : undefined;
  const [logs, groups] = await Promise.all([
    prisma.structuredLog.findMany({
      where: {
        level: params.level ? (params.level as never) : undefined,
        service: params.service ? { contains: params.service, mode: "insensitive" } : undefined
        ,
        environment: params.environment ? (params.environment as never) : undefined,
        entityType: params.entityType ? { contains: params.entityType, mode: "insensitive" } : undefined,
        userId: params.userId ? { contains: params.userId, mode: "insensitive" } : undefined,
        // Exact match, not `contains`. A request id is a whole identifier — a
        // substring match would silently pull in unrelated requests whose id
        // happens to share a prefix, which defeats the entire purpose of
        // filtering by it.
        requestId: params.requestId ? params.requestId : undefined,
        timestamp
      },
      orderBy: { timestamp: "desc" },
      take: 100
    }),
    prisma.structuredLog.groupBy({ by: ["fingerprint"], _count: { fingerprint: true }, orderBy: { _count: { fingerprint: "desc" } }, take: 8 })
  ]);
  const anomalyScore = scoreOperationalAnomaly({
    errorCount: logs.filter((log) => log.level === "error" || log.level === "fatal").length,
    warnCount: logs.filter((log) => log.level === "warn").length,
    burstWindowMinutes: 10,
    uniqueFingerprints: new Set(logs.map((log) => log.fingerprint)).size
  });
  return (
    <>
      <PageHeader title="Structured Log Explorer" description="Filter structured logs and inspect grouped error fingerprints." />
      <Card>
        <CardHeader title="Filters" />
        <form className="form-grid">
          <select name="level" defaultValue={params.level ?? ""}><option value="">Any level</option><option value="debug">debug</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option><option value="fatal">fatal</option></select>
          <select name="environment" defaultValue={params.environment ?? ""}><option value="">Any environment</option><option value="development">development</option><option value="staging">staging</option><option value="production">production</option></select>
          <input name="service" placeholder="service" defaultValue={params.service ?? ""} />
          <input name="entityType" placeholder="entity type" defaultValue={params.entityType ?? ""} />
          <input name="userId" placeholder="user id" defaultValue={params.userId ?? ""} />
          <input name="requestId" placeholder="request id" defaultValue={params.requestId ?? ""} />
          <input name="from" type="date" defaultValue={params.from ?? ""} />
          <input name="to" type="date" defaultValue={params.to ?? ""} />
          <div className="form-actions"><button className="ui-button ui-button--secondary" type="submit">Apply</button></div>
        </form>
      </Card>
      {can("log:manage") ? (
        <Card>
          <CardHeader title="Retention" />
          <p className="muted">Structured logs accumulate on every service call. Trim the tail.</p>
          <ActionForm action={purgeStructuredLogs} className="form-grid" errorPlacement="bottom">
            <label>
              Delete logs older than (days)
              <input name="days" type="number" min={1} max={365} defaultValue={30} required />
            </label>
            <div className="form-actions">
              <SubmitButton variant="danger" pendingLabel="Deleting…">Delete old logs</SubmitButton>
            </div>
          </ActionForm>
          <p className="muted">
            Irreversible, and audited: the purge writes a <code>log.purged</code> audit event recording the cutoff and
            how many rows went, so the absence of logs is never mistaken for a fault.
          </p>
        </Card>
      ) : null}
      <div className="grid grid-2">
        <Card>
          <CardHeader title="Anomaly Detection Result Panel" />
          <div className="metric-row">
            <div className="ui-stat ui-stat--info"><span>Anomaly score</span><strong>{anomalyScore}</strong></div>
            <div className="ui-stat ui-stat--danger"><span>Error/fatal logs</span><strong>{logs.filter((log) => log.level === "error" || log.level === "fatal").length}</strong></div>
            <div className="ui-stat ui-stat--warn"><span>Warning logs</span><strong>{logs.filter((log) => log.level === "warn").length}</strong></div>
          </div>
          <p className="muted">Score is deterministic and based on matching logs, warning/error volume, burst window, and unique fingerprints.</p>
        </Card>
        <Card>
          <CardHeader title="Error Grouping By Fingerprint" />
          <DataTable>
            <thead><tr><th>Fingerprint</th><th>Count</th></tr></thead>
            <tbody>{groups.map((group) => <tr key={group.fingerprint}><td>{group.fingerprint}</td><td>{group._count.fingerprint}</td></tr>)}</tbody>
          </DataTable>
        </Card>
        <Card>
          <CardHeader title="Log Entries" />
          <DataTable>
            <thead><tr><th>When</th><th>Level</th><th>Service</th><th>Message</th><th>Request</th><th>Fingerprint</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.timestamp)}</td>
                  <td><StatusBadge value={log.level} /></td>
                  <td>{log.service}</td>
                  <td><a href={`/logs/${log.id}`}>{log.message}</a></td>
                  {/* Linking the id to its own filter is the whole point of
                      having one: from any line, one click shows everything else
                      that happened while serving the same request. */}
                  <td>{log.requestId ? <a href={`/logs?requestId=${encodeURIComponent(log.requestId)}`}>{log.requestId.slice(0, 8)}</a> : "—"}</td>
                  <td>{log.fingerprint}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </>
  );
}
