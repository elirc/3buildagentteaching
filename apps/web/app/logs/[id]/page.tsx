import { notFound } from "next/navigation";
import { Card, CardHeader, JsonBlock, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await prisma.structuredLog.findUnique({ where: { id } });
  if (!log) notFound();
  const related = await prisma.structuredLog.findMany({ where: { fingerprint: log.fingerprint }, orderBy: { timestamp: "desc" }, take: 10 });
  return (
    <>
      <PageHeader title="Log Detail" description={`${log.service} · ${formatDateTime(log.timestamp)}`} actions={<StatusBadge value={log.level} />} />
      <div className="split">
        <Card><CardHeader title="Entry" /><JsonBlock value={log} /></Card>
        <Card><CardHeader title="Same Fingerprint" /><ul className="list">{related.map((item) => <li key={item.id}>{formatDateTime(item.timestamp)} · {item.message}</li>)}</ul></Card>
      </div>
    </>
  );
}
