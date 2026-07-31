import { Card, CardHeader, DataTable, LinkButton, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { listReports } from "@agentic-edu/application";
import type { WeeklyRiskReportPayload } from "@agentic-edu/domain";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { generateWeeklyRiskReport } from "@/lib/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { guardRoute } from "@/components/route-guard";
import { getActorCapabilities } from "@/lib/capabilities";

export default async function ReportsPage() {
  const denied = await guardRoute("/reports");
  if (denied) return denied;

  const { can } = await getActorCapabilities();
  const [reports, sections, advisors] = await Promise.all([
    listReports(),
    prisma.classSection.findMany({ include: { course: true, academicTerm: true }, orderBy: { academicTerm: { startsAt: "desc" } } }),
    prisma.user.findMany({ where: { role: "Advisor" }, orderBy: { name: "asc" } })
  ]);

  const latest = reports[0]?.payload as unknown as WeeklyRiskReportPayload | undefined;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Weekly at-risk snapshots. A report is a record of what was true when it ran, not a live query."
        actions={<LinkButton href="/api/export/at-risk" variant="secondary">Export live at-risk CSV</LinkButton>}
      />

      <div className="ui-stat-grid">
        <Stat label="Reports stored" value={reports.length} />
        <Stat label="Latest students" value={latest?.totals.students ?? 0} />
        <Stat label="Latest High/Critical" value={(latest?.totals.byLevel.High ?? 0) + (latest?.totals.byLevel.Critical ?? 0)} tone="danger" />
      </div>

      {can("intervention:create") ? (
        <Card>
          <CardHeader title="Generate now" />
          <p className="muted">
            Queues a background job — generation reads every student in scope, which is a job&apos;s work rather than a
            request&apos;s. Generating twice in the same week updates that week&apos;s report instead of adding a second.
          </p>
          <ActionForm action={generateWeeklyRiskReport} className="ui-form-grid" errorPlacement="bottom">
            <label>
              Scope
              <select name="scope" defaultValue="School">
                <option value="School">Whole school</option>
                {sections.map((section) => (
                  <option key={section.id} value={`ClassSection:${section.id}`}>
                    Section · {section.course.code} {section.academicTerm.name}
                  </option>
                ))}
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={`Advisor:${advisor.id}`}>Advisor · {advisor.name}</option>
                ))}
              </select>
            </label>
            <SubmitButton variant="primary" pendingLabel="Queueing…">Queue report</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Generated reports" />
        <DataTable>
          <thead><tr><th>Week</th><th>Scope</th><th>Students</th><th>High/Critical</th><th>Generated</th><th /></tr></thead>
          <tbody>
            {reports.map((report) => {
              const payload = report.payload as unknown as WeeklyRiskReportPayload;
              const elevated = (payload.totals?.byLevel?.High ?? 0) + (payload.totals?.byLevel?.Critical ?? 0);
              return (
                <tr key={report.id}>
                  <td><a href={`/reports/${report.id}`}>{formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</a></td>
                  <td>{payload.scopeLabel ?? report.scopeType}</td>
                  <td>{payload.totals?.students ?? 0}</td>
                  <td>{elevated}</td>
                  <td>{formatDateTime(report.generatedAt)}</td>
                  <td><a href={`/api/export/report?id=${report.id}`}>CSV</a></td>
                </tr>
              );
            })}
            {reports.length === 0 ? (
              <tr><td colSpan={6}>No reports yet. Queue one above, then run the worker on /worker-jobs.</td></tr>
            ) : null}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
