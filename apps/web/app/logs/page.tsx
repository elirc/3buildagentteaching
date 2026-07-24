import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { scoreOperationalAnomaly } from "@agentic-edu/observability";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function LogsPage({ searchParams }: { searchParams?: Promise<{ level?: string; service?: string; environment?: string; entityType?: string; userId?: string; from?: string; to?: string }> }) {
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
          <input name="from" type="date" defaultValue={params.from ?? ""} />
          <input name="to" type="date" defaultValue={params.to ?? ""} />
          <div className="form-actions"><button className="ui-button ui-button--secondary" type="submit">Apply</button></div>
        </form>
      </Card>
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
            <thead><tr><th>When</th><th>Level</th><th>Service</th><th>Message</th><th>Fingerprint</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}><td>{formatDateTime(log.timestamp)}</td><td><StatusBadge value={log.level} /></td><td>{log.service}</td><td><a href={`/logs/${log.id}`}>{log.message}</a></td><td>{log.fingerprint}</td></tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </>
  );
}
