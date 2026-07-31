import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, LinkButton, PageHeader, Stat } from "@agentic-edu/ui";
import { getReportWithDiff } from "@agentic-edu/application";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { guardRoute } from "@/components/route-guard";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardRoute("/reports");
  if (denied) return denied;

  const { id } = await params;
  const found = await getReportWithDiff(id);
  if (!found) notFound();

  const { report, payload, previousId, diff } = found;

  return (
    <>
      <PageHeader
        title={`Weekly risk · ${payload.scopeLabel}`}
        description={`${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)} · generated ${formatDateTime(report.generatedAt)}`}
        actions={<LinkButton href={`/api/export/report?id=${report.id}`} variant="secondary">Export CSV</LinkButton>}
      />

      <div className="ui-stat-grid">
        <Stat label="Students" value={payload.totals.students} />
        <Stat label="Critical" value={payload.totals.byLevel.Critical} tone="danger" />
        <Stat label="High" value={payload.totals.byLevel.High} tone="warn" />
        <Stat label="Medium" value={payload.totals.byLevel.Medium} />
        <Stat label="Low" value={payload.totals.byLevel.Low} tone="good" />
        <Stat label="Average risk" value={payload.totals.averageRiskScore ?? "—"} />
      </div>

      <Card>
        <CardHeader title="Change since the previous report" />
        {previousId ? (
          <p className="muted">
            Compared against <a href={`/reports/${previousId}`}>the previous report for this scope</a>.
          </p>
        ) : (
          /* Not an error state. The first report for a scope has nothing to
             compare against, and showing an empty diff without saying why reads
             as "nothing changed". */
          <p className="muted">This is the first report for this scope, so there is nothing to compare it against yet.</p>
        )}
        <div className="grid grid-2">
          <div>
            <h3>Newly High or Critical</h3>
            {diff.newlyElevated.length === 0 ? <p className="muted">None.</p> : (
              <ul>
                {diff.newlyElevated.map((entry) => (
                  <li key={entry.studentId}>
                    <a href={`/students/${entry.studentId}`}>{entry.studentName}</a> — {entry.previousLevel} → {entry.currentLevel} ({entry.delta && entry.delta > 0 ? "+" : ""}{entry.delta})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Improved out of High/Critical</h3>
            {diff.improved.length === 0 ? <p className="muted">None.</p> : (
              <ul>
                {diff.improved.map((entry) => (
                  <li key={entry.studentId}>
                    <a href={`/students/${entry.studentId}`}>{entry.studentName}</a> — {entry.previousLevel} → {entry.currentLevel} ({entry.delta})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            {/* Kept separate from "newly elevated" on purpose: a student who
                appears for the first time at Critical has not *become*
                critical, and reporting them as an escalation sends someone
                looking for an event that never happened. */}
            <h3>New to this report</h3>
            {diff.added.length === 0 ? <p className="muted">None.</p> : (
              <ul>{diff.added.map((entry) => <li key={entry.studentId}>{entry.studentName} — {entry.currentLevel}</li>)}</ul>
            )}
          </div>
          <div>
            <h3>No longer in scope</h3>
            {diff.removed.length === 0 ? <p className="muted">None.</p> : (
              <ul>{diff.removed.map((entry) => <li key={entry.studentId}>{entry.studentName} — was {entry.previousLevel}</li>)}</ul>
            )}
          </div>
        </div>
      </Card>

      {diff.biggestMovers.length > 0 ? (
        <Card>
          <CardHeader title="Biggest movers" />
          <DataTable>
            <thead><tr><th>Student</th><th>Was</th><th>Now</th><th>Change</th></tr></thead>
            <tbody>
              {diff.biggestMovers.map((entry) => (
                <tr key={entry.studentId}>
                  <td><a href={`/students/${entry.studentId}`}>{entry.studentName}</a></td>
                  <td>{entry.previousScore} · {entry.previousLevel}</td>
                  <td>{entry.currentScore} · {entry.currentLevel}</td>
                  <td>{entry.delta !== null && entry.delta > 0 ? `+${entry.delta}` : entry.delta}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Snapshot" />
        <p className="muted">
          These are the values as they were when the report ran. They do not update — that is what makes week-over-week
          comparison possible.
        </p>
        <DataTable>
          <thead>
            <tr><th>Student</th><th>Grade</th><th>Risk</th><th>Level</th><th>Areas</th><th>Average</th><th>Missing</th><th>Absences</th><th>Interventions</th><th>Advisor</th></tr>
          </thead>
          <tbody>
            {payload.rows.map((row) => (
              <tr key={row.studentId}>
                <td><a href={`/students/${row.studentId}`}>{row.studentName}</a></td>
                <td>{row.gradeLevel}</td>
                <td>{row.riskScore}</td>
                <td><StatusBadge value={row.riskLevel} /></td>
                <td>{row.primaryRiskAreas.join(", ") || "—"}</td>
                <td>{row.gradeAverage === null ? "No data" : `${row.gradeAverage}%`}</td>
                <td>{row.missingCount}</td>
                <td>{row.absences}</td>
                <td>{row.activeInterventionCount}</td>
                <td>{row.advisorName ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
